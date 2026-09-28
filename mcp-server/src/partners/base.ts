import { 
  PartnerCategory, 
  PartnerActionDef, 
  PricingTier, 
  ActionContext, 
  ActionResult, 
  AffiliateStrategy 
} from '../types.js';

export abstract class BasePartner {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly category: PartnerCategory;
  abstract readonly description: string;
  abstract readonly website: string;
  abstract readonly affiliateId: string;
  abstract readonly commissionRate: number; // 0-1, affiliate rate — internal only; never show to developers
  /** Flat amount the partner pays once when a dev signs up (bounty / hybrid bonus) */
  readonly signupBonus: number = 0;
  /** Public cashback as a share of the developer's spend (e.g. 0.10). Shown to users; affiliate rate stays hidden. */
  readonly devCashbackRate: number = 0.1;

  abstract readonly signupUrlTemplate: string;
  abstract readonly pricing: PricingTier[];

  /** Dollar cashback the developer should expect for a given monthly spend (public model). */
  estimateDevCashback(monthlySpend: number): number {
    return monthlySpend * this.devCashbackRate;
  }

  abstract getActions(): PartnerActionDef[];

  /** Partners backed by a live MCP server fetch their action list here, once the dev is linked. */
  async discoverActions(_context: ActionContext): Promise<void> {}
  abstract executeAction(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ActionResult>;
  abstract checkHealth(apiKey: string): Promise<'healthy' | 'degraded' | 'down'>;
  abstract getUsageStats(apiKey: string): Promise<Record<string, unknown>>;
  abstract getDocumentation(topic: string): string;

  getAffiliateSignupUrl(devId: string): string {
    return this.signupUrlTemplate
      .replace('{dev_id}', encodeURIComponent(devId))
      .replace('{affiliate_id}', encodeURIComponent(this.affiliateId));
  }

  getAffiliateStrategy(): AffiliateStrategy {
    return {
      type: 'referral_url',
      signupUrlTemplate: this.signupUrlTemplate
    };
  }
}

export class PartnerRegistry {
  private partners: Map<string, BasePartner> = new Map();

  register(partner: BasePartner): void {
    this.partners.set(partner.id, partner);
  }

  unregister(id: string): void {
    this.partners.delete(id);
  }

  get(id: string): BasePartner | undefined {
    return this.partners.get(id);
  }

  getByCategory(category: PartnerCategory): BasePartner[] {
    return Array.from(this.partners.values()).filter(p => p.category === category);
  }

  getAll(): BasePartner[] {
    return Array.from(this.partners.values());
  }

  getCategories(): PartnerCategory[] {
    const categories = new Set<PartnerCategory>();
    for (const partner of this.partners.values()) {
      categories.add(partner.category);
    }
    return Array.from(categories);
  }
}

export const registry = new PartnerRegistry();
