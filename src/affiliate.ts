import { AffiliateEvent, CashbackConfig, CashbackBalance, DevPayoutRequest } from './types.js';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MCP_DATA_DIR } from './paths.js';

export class AffiliateTracker {
  private events: AffiliateEvent[] = [];
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  async trackEvent(event: Omit<AffiliateEvent, 'id' | 'timestamp' | 'status'> & { status?: AffiliateEvent['status'] }): Promise<AffiliateEvent> {
    const newEvent: AffiliateEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      status: event.status ?? 'pending',
      confirmedAt: event.status === 'confirmed' ? new Date().toISOString() : null,
      rejectionReason: null,
    };
    
    this.events.push(newEvent);
    await this.saveEvents();
    return newEvent;
  }

  async confirmEvent(eventId: string): Promise<AffiliateEvent | null> {
    await this.loadEvents();
    const event = this.events.find(e => e.id === eventId);
    if (!event) return null;
    event.status = 'confirmed';
    event.confirmedAt = new Date().toISOString();
    event.rejectionReason = null;
    await this.saveEvents();
    return event;
  }

  async rejectEvent(eventId: string, reason: string): Promise<AffiliateEvent | null> {
    await this.loadEvents();
    const event = this.events.find(e => e.id === eventId);
    if (!event) return null;
    event.status = 'rejected';
    event.rejectionReason = reason;
    await this.saveEvents();
    return event;
  }

  async getEventsForDev(devId: string): Promise<AffiliateEvent[]> {
    return this.events.filter(e => e.devId === devId);
  }

  async getEventsByPartner(partner: string): Promise<AffiliateEvent[]> {
    return this.events.filter(e => e.partner === partner);
  }

  async loadEvents(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, 'events.json');
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const rawEvents = JSON.parse(data) as AffiliateEvent[];
      this.events = rawEvents.map(e => ({
        ...e,
        status: e.status ?? 'confirmed',
      }));
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        this.events = [];
        await this.saveEvents();
        return;
      }
      throw error;
    }
  }

  async saveEvents(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, 'events.json');
    const tmpPath = `${filePath}.tmp`;
    
    await fs.writeFile(tmpPath, JSON.stringify(this.events, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }
}

export class CashbackEngine {
  private config: CashbackConfig = {
    defaultDevShare: 0.6,
    tiers: [
      { minMonthlySpend: 0, devShare: 0.5 },
      { minMonthlySpend: 100, devShare: 0.6 },
      { minMonthlySpend: 500, devShare: 0.7 }
    ],
    referralBonusPerUser: 5,
    newPartnerBonus: 10,
    minPayout: 10
  };

  get minPayout(): number {
    return this.config.minPayout;
  }

  getDevShare(monthlySpend: number): number {
    let applicableShare = this.config.defaultDevShare;
    let highestApplicableSpend = -1;

    for (const tier of this.config.tiers) {
      if (monthlySpend >= tier.minMonthlySpend && tier.minMonthlySpend > highestApplicableSpend) {
        highestApplicableSpend = tier.minMonthlySpend;
        applicableShare = tier.devShare;
      }
    }
    
    return applicableShare;
  }

  calculateCashback(commissionAmount: number, devMonthlySpend: number): { devAmount: number; platformAmount: number; devShare: number } {
    const devShare = this.getDevShare(devMonthlySpend);
    const devAmount = commissionAmount * devShare;
    const platformAmount = commissionAmount - devAmount;
    
    return { devAmount, platformAmount, devShare };
  }

  /** available = confirmed earned minus non-rejected payouts; pending = active payouts; pendingCashback = unconfirmed events. */
  async getBalance(devId: string, tracker: AffiliateTracker, payouts: DevPayoutRequest[]): Promise<CashbackBalance> {
    const events = await tracker.getEventsForDev(devId);
    const confirmedEarned = events
      .filter(e => e.status === 'confirmed')
      .reduce((sum, e) => sum + e.cashbackAmount, 0);
    const pendingCashback = events
      .filter(e => e.status === 'pending')
      .reduce((sum, e) => sum + e.cashbackAmount, 0);

    const active = payouts.filter(p => p.devId === devId && p.status !== 'rejected');
    const withdrawn = active.reduce((sum, p) => sum + p.amount, 0);
    const pending = active
      .filter(p => p.status === 'requested' || p.status === 'approved')
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      available: Math.max(0, confirmedEarned - withdrawn),
      pendingCashback,
      pending,
      lifetimeEarned: confirmedEarned,
      lastUpdated: new Date().toISOString()
    };
  }
}

export const tracker = new AffiliateTracker(MCP_DATA_DIR);
export const cashbackEngine = new CashbackEngine();
