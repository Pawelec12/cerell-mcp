import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PAYOUTS_DIR } from './paths.js';
import type { DevPayoutRequest, PayoutMethod } from './types.js';

/**
 * Dev cashback payout requests. The file is shared with admin-dashboard, which
 * approves/pays/rejects them, so it is re-read on every call instead of cached.
 */
export class DevPayoutStore {
  constructor(private dataDir: string = PAYOUTS_DIR) {}

  private get filePath(): string {
    return path.join(this.dataDir, 'dev-payouts.json');
  }

  private async readAll(): Promise<DevPayoutRequest[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf-8')) as DevPayoutRequest[];
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async getForDev(devId: string): Promise<DevPayoutRequest[]> {
    return (await this.readAll()).filter(p => p.devId === devId);
  }

  async request(devId: string, amount: number, method: PayoutMethod): Promise<DevPayoutRequest> {
    const all = await this.readAll();
    const payout: DevPayoutRequest = {
      id: randomUUID(),
      devId,
      amount,
      method,
      status: 'requested',
      requestedAt: new Date().toISOString(),
      processedAt: null,
      rejectionReason: null,
    };
    all.push(payout);
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmp = `${this.filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
    return payout;
  }
}

export const payoutStore = new DevPayoutStore();
