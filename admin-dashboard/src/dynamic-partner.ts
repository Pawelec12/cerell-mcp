import { PartnerConfig } from './types.js';

export interface PartnerActionDef {
  name: string;
  description: string;
  params: Record<string, {
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
    default?: unknown;
    enum?: string[];
  }>;
}

export interface ActionContext {
  devId: string;
  apiKey?: string;
  affiliateId: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  envVars?: Record<string, string>;
}

export interface PricingTier {
  name: string;
  monthlyPrice: number;
  features: string[];
}

export interface AffiliateStrategy {
  type: 'referral_url' | 'api_header' | 'coupon' | 'marketplace';
  signupUrlTemplate: string;
  cookieDays?: number;
  headerName?: string;
  headerValue?: string;
  couponCode?: string;
}

export class DynamicPartner {
  public readonly id: string;
  public readonly name: string;
  public readonly category: string;
  public readonly description: string;
  public readonly website: string;
  public readonly affiliateId: string;
  public readonly commissionRate: number;
  public readonly signupUrlTemplate: string;
  public readonly pricing: PricingTier[];
  public readonly config: PartnerConfig;

  constructor(config: PartnerConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.category = config.category;
    this.description = config.description;
    this.website = config.website;
    this.affiliateId = config.affiliateId;
    this.signupUrlTemplate = config.signupUrlTemplate;
    this.pricing = config.pricing.map(p => ({
      name: p.name,
      monthlyPrice: p.monthlyPrice,
      features: p.features
    }));

    let rate = 0;
    if (config.commission.type === 'revenue_share') {
      rate = config.commission.rate;
    } else if (config.commission.type === 'one_time') {
      rate = config.commission.amountPerSignup / 100;
    } else if (config.commission.type === 'hybrid') {
      rate = config.commission.revenueShare.rate;
    } else if (config.commission.type === 'tiered' && config.commission.tiers.length > 0) {
      rate = config.commission.tiers[0].amountPerReferral / 100;
    }
    this.commissionRate = rate;
  }

  getActions(): PartnerActionDef[] {
    return this.config.tools.map(tool => {
      const params: Record<string, any> = {};
      for (const p of tool.params) {
        params[p.name] = {
          type: p.type,
          description: p.description,
          required: p.required,
          default: p.default,
          enum: p.enum
        };
      }
      return {
        name: tool.name,
        description: tool.description,
        params
      };
    });
  }

  async executeAction(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ActionResult> {
    const toolMap = new Map(this.config.tools.map(t => [t.name, t]));
    const tool = toolMap.get(actionName);
    
    if (!tool) {
      return {
        success: false,
        message: `Action ${actionName} not found`
      };
    }

    const envVars: Record<string, string> = {};
    if (tool.returns.envVarTemplates) {
      for (const [key, template] of Object.entries(tool.returns.envVarTemplates)) {
        let value = template;
        for (const [paramKey, paramVal] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
        }
        envVars[key] = value;
      }
    }

    return {
      success: true,
      message: tool.returns.successMessage,
      data: tool.returns.mockData,
      envVars
    };
  }

  async checkHealth(apiKey: string): Promise<'healthy' | 'degraded' | 'down'> {
    return 'healthy';
  }

  async getUsageStats(apiKey: string): Promise<Record<string, unknown>> {
    return { requests: 100, activeUsers: 50 };
  }

  getDocumentation(topic: string): string {
    const docMap = new Map(this.config.documentation.map(d => [d.topic, d.content]));
    return docMap.get(topic) ?? 'Documentation not found.';
  }

  getAffiliateSignupUrl(devId: string): string {
    return this.signupUrlTemplate
      .replace('{dev_id}', encodeURIComponent(devId))
      .replace('{affiliate_id}', encodeURIComponent(this.affiliateId));
  }

  getAffiliateStrategy(): AffiliateStrategy {
    return {
      type: 'referral_url',
      signupUrlTemplate: this.signupUrlTemplate,
      cookieDays: this.config.trackingCookieDays
    };
  }
}

export function partnerConfigToDynamic(config: PartnerConfig): DynamicPartner {
  return new DynamicPartner(config);
}
