import { DevAccount, LinkedAccount } from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MCP_DATA_DIR } from './paths.js';

export class AuthManager {
  private accounts: Map<string, DevAccount> = new Map();
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  async getOrCreateDev(devId: string): Promise<DevAccount> {
    let account = this.accounts.get(devId);
    if (!account) {
      account = {
        id: devId,
        createdAt: new Date().toISOString(),
        linkedAccounts: {}
      };
      this.accounts.set(devId, account);
      await this.saveAccounts();
    }
    return account;
  }

  async linkAccount(devId: string, partnerId: string, apiKey: string, plan: string = 'Free', monthlySpend: number = 0): Promise<void> {
    const account = await this.getOrCreateDev(devId);
    
    account.linkedAccounts[partnerId] = {
      partnerId,
      apiKey,
      linkedAt: account.linkedAccounts[partnerId]?.linkedAt ?? new Date().toISOString(),
      currentPlan: plan,
      monthlySpend
    };
    
    await this.saveAccounts();
  }

  async getLinkedAccount(devId: string, partnerId: string): Promise<LinkedAccount | undefined> {
    const account = await this.getOrCreateDev(devId);
    return account.linkedAccounts[partnerId];
  }

  async isLinked(devId: string, partnerId: string): Promise<boolean> {
    const account = await this.getLinkedAccount(devId, partnerId);
    return account !== undefined;
  }

  async loadAccounts(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, 'accounts.json');
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const accountsArray = JSON.parse(data) as DevAccount[];
      this.accounts = new Map(accountsArray.map(acc => [acc.id, acc]));
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        this.accounts = new Map();
        await this.saveAccounts();
        return;
      }
      throw error;
    }
  }

  async saveAccounts(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = path.join(this.dataDir, 'accounts.json');
    const tmpPath = `${filePath}.tmp`;
    
    const accountsArray = Array.from(this.accounts.values());
    await fs.writeFile(tmpPath, JSON.stringify(accountsArray, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }
}

export const auth = new AuthManager(MCP_DATA_DIR);
