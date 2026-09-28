import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { PartnerCategory, PartnerConfig } from "./types.js";
import { PARTNERS_DIR } from "./paths.js";

export class PartnerStore {
  private partners: Map<string, PartnerConfig> = new Map();
  private dataDir: string;

  constructor(dataDir = PARTNERS_DIR) {
    this.dataDir = dataDir;
  }

  public async load(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const files = await fs.readdir(this.dataDir);
      
      this.partners.clear();
      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = path.join(this.dataDir, file);
          const content = await fs.readFile(filePath, "utf-8");
          const partner = JSON.parse(content) as PartnerConfig;
          this.partners.set(partner.id, partner);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  public async save(partner: PartnerConfig): Promise<void> {
    this.partners.set(partner.id, partner);
    await fs.mkdir(this.dataDir, { recursive: true });
    
    const filePath = path.join(this.dataDir, `${partner.id}.json`);
    const tmpPath = `${filePath}.tmp`;
    
    await fs.writeFile(tmpPath, JSON.stringify(partner, null, 2), "utf-8");
    await fs.rename(tmpPath, filePath);
  }

  public async create(config: Omit<PartnerConfig, "id" | "createdAt" | "updatedAt">): Promise<PartnerConfig> {
    const now = new Date().toISOString();
    const partner: PartnerConfig = {
      ...config,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    
    await this.save(partner);
    return partner;
  }

  public async update(id: string, updates: Partial<Omit<PartnerConfig, "id" | "createdAt">>): Promise<PartnerConfig> {
    const existing = this.partners.get(id);
    if (!existing) {
      throw new Error(`Partner with id ${id} not found`);
    }

    const updated: PartnerConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    await this.save(updated);
    return updated;
  }

  public async delete(id: string): Promise<void> {
    if (this.partners.has(id)) {
      this.partners.delete(id);
      const filePath = path.join(this.dataDir, `${id}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  public async getById(id: string): Promise<PartnerConfig | undefined> {
    return this.partners.get(id);
  }

  public async getAll(): Promise<PartnerConfig[]> {
    return Array.from(this.partners.values());
  }

  public async getByCategory(category: PartnerCategory): Promise<PartnerConfig[]> {
    return Array.from(this.partners.values()).filter(p => p.category === category);
  }

  public async getActive(): Promise<PartnerConfig[]> {
    return Array.from(this.partners.values()).filter(p => p.status === "active");
  }

  public async setStatus(id: string, status: PartnerConfig["status"]): Promise<void> {
    await this.update(id, { status });
  }
}

export const partnerStore = new PartnerStore();
