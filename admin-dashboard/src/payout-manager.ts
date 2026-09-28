import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { DevPayoutRequest, FinancialOverview, PartnerFinancials, PartnerPayout } from "./types.js";
import { PartnerStore } from "./partner-store.js";
import { PAYOUTS_DIR } from "./paths.js";

// Mirror of mcp-server AffiliateEvent (written to data/mcp/events.json)
export interface AffiliateEvent {
  devId: string;
  partner: string;
  action: string;
  type: string;
  estimatedRevenue: number;
  cashbackAmount: number;
  timestamp: string;
}

/** Carries the HTTP status the API should answer with (404 unknown id, 409 illegal transition). */
export class PayoutError extends Error {
  constructor(message: string, readonly status: 404 | 409) {
    super(message);
  }
}

const DEV_TRANSITIONS: Record<DevPayoutRequest["status"], DevPayoutRequest["status"][]> = {
  requested: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: [],
  rejected: [],
};

const PARTNER_TRANSITIONS: Record<PartnerPayout["status"], PartnerPayout["status"][]> = {
  expected: ["confirmed", "received"],
  confirmed: ["received"],
  received: [],
};

// ponytail: dev-payouts.json is shared with the MCP server (request_payout); every op re-reads
// the file first, so a write race needs two requests in the same few ms. Move to SQLite if that matters.
export class PayoutManager {
  private partnerPayouts: PartnerPayout[] = [];
  private devPayouts: DevPayoutRequest[] = [];
  private dataDir: string;

  constructor(dataDir = PAYOUTS_DIR) {
    this.dataDir = dataDir;
  }

  // ===== Partner Payouts =====

  public async recordPartnerPayout(partnerId: string, period: string, grossAmount: number, expectedDate: string): Promise<PartnerPayout> {
    await this.loadData();
    const payout: PartnerPayout = {
      id: randomUUID(),
      partnerId,
      period,
      grossAmount,
      status: "expected",
      expectedDate,
      receivedAt: null,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    this.partnerPayouts.push(payout);
    await this.saveData();
    return payout;
  }

  public async confirmPartnerPayout(payoutId: string): Promise<void> {
    await this.setPartnerStatus(payoutId, "confirmed");
  }

  public async markPartnerPayoutReceived(payoutId: string): Promise<void> {
    await this.setPartnerStatus(payoutId, "received");
  }

  public async getPartnerPayouts(partnerId?: string): Promise<PartnerPayout[]> {
    await this.loadData();
    if (partnerId) {
      return this.partnerPayouts.filter(p => p.partnerId === partnerId);
    }
    return [...this.partnerPayouts];
  }

  private async setPartnerStatus(payoutId: string, status: PartnerPayout["status"]): Promise<void> {
    await this.loadData();
    const payout = this.partnerPayouts.find(p => p.id === payoutId);
    if (!payout) throw new PayoutError("Payout not found", 404);
    if (!PARTNER_TRANSITIONS[payout.status].includes(status)) {
      throw new PayoutError(`Cannot change partner payout from ${payout.status} to ${status}`, 409);
    }
    payout.status = status;
    if (status === "received") payout.receivedAt = new Date().toISOString();
    await this.saveData();
  }

  // ===== Dev Payouts =====

  public async approveDevPayout(payoutId: string): Promise<void> {
    await this.setDevStatus(payoutId, "approved");
  }

  public async markDevPayoutPaid(payoutId: string): Promise<void> {
    await this.setDevStatus(payoutId, "paid");
  }

  public async rejectDevPayout(payoutId: string, reason: string): Promise<void> {
    await this.setDevStatus(payoutId, "rejected", reason);
  }

  public async getDevPayouts(devId?: string): Promise<DevPayoutRequest[]> {
    await this.loadData();
    if (devId) {
      return this.devPayouts.filter(p => p.devId === devId);
    }
    return [...this.devPayouts];
  }

  public async getPendingDevPayouts(): Promise<DevPayoutRequest[]> {
    await this.loadData();
    return this.devPayouts.filter(p => p.status === "requested");
  }

  private async setDevStatus(payoutId: string, status: DevPayoutRequest["status"], reason?: string): Promise<void> {
    await this.loadData();
    const payout = this.devPayouts.find(p => p.id === payoutId);
    if (!payout) throw new PayoutError("Payout not found", 404);
    if (!DEV_TRANSITIONS[payout.status].includes(status)) {
      throw new PayoutError(`Cannot change dev payout from ${payout.status} to ${status}`, 409);
    }
    payout.status = status;
    if (status === "paid" || status === "rejected") payout.processedAt = new Date().toISOString();
    if (status === "rejected") payout.rejectionReason = reason ?? "No reason provided";
    await this.saveData();
  }

  // ===== Reconciliation =====

  public async getFinancialOverview(partnerStore: PartnerStore, events: AffiliateEvent[]): Promise<FinancialOverview> {
    await this.loadData();
    let grossRevenue = 0;
    let totalCashbackLiability = 0;
    let currentMRR = 0;

    const partnerMap = new Map<string, PartnerFinancials>();
    const partners = await partnerStore.getAll();

    for (const p of partners) {
      partnerMap.set(p.id, {
        partnerId: p.id,
        partnerName: p.name,
        totalCommission: 0,
        totalCashbackPaid: 0,
        platformMargin: 0,
        activeDevelopers: 0,
        totalReferrals: 0,
      });
    }

    const devsPerPartner = new Map<string, Set<string>>();
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const event of events) {
      grossRevenue += event.estimatedRevenue;
      totalCashbackLiability += event.cashbackAmount;

      const pStats = partnerMap.get(event.partner);
      if (pStats) {
        pStats.totalCommission += event.estimatedRevenue;
        pStats.totalCashbackPaid += event.cashbackAmount;
        pStats.platformMargin += (event.estimatedRevenue - event.cashbackAmount);
        if (event.type === "signup") pStats.totalReferrals += 1;
        if (!devsPerPartner.has(event.partner)) devsPerPartner.set(event.partner, new Set());
        devsPerPartner.get(event.partner)!.add(event.devId);
      }

      if (event.timestamp.startsWith(currentMonth)) {
        currentMRR += event.estimatedRevenue;
      }
    }

    for (const [partnerId, devs] of devsPerPartner) {
      partnerMap.get(partnerId)!.activeDevelopers = devs.size;
    }

    const pendingReceivables = this.partnerPayouts
      .filter(p => p.status !== "received")
      .reduce((sum, p) => sum + p.grossAmount, 0);

    const pendingDevPayouts = this.devPayouts
      .filter(p => p.status === "requested" || p.status === "approved")
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      grossRevenue,
      totalCashbackLiability,
      netRevenue: grossRevenue - totalCashbackLiability,
      pendingReceivables,
      pendingDevPayouts,
      currentMRR,
      partnerBreakdown: Array.from(partnerMap.values()),
    };
  }

  // ===== Persistence =====

  public async loadData(): Promise<void> {
    this.partnerPayouts = await this.readJson<PartnerPayout[]>("partner-payouts.json", []);
    this.devPayouts = await this.readJson<DevPayoutRequest[]>("dev-payouts.json", []);
  }

  public async saveData(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.writeJson("partner-payouts.json", this.partnerPayouts);
    await this.writeJson("dev-payouts.json", this.devPayouts);
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dataDir, file), "utf-8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw e;
    }
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    const target = path.join(this.dataDir, file);
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, target);
  }
}

export const payoutManager = new PayoutManager();
