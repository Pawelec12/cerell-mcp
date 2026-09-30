import { promises as fs, watch, type FSWatcher } from 'fs';
import * as path from 'path';
import { BasePartner, PartnerRegistry } from './base.js';
import { PARTNERS_DIR } from '../paths.js';
import { upstreamPool, type UpstreamConfig, type UpstreamPool } from '../upstream.js';
import type {
  ActionContext,
  ActionResult,
  PartnerActionDef,
  PartnerCategory,
  PricingTier,
  AffiliateStrategy,
} from '../types.js';

/** Subset of admin-dashboard PartnerConfig (data/partners/<id>.json) the MCP server needs. */
export interface StoredPartnerConfig {
  id: string;
  name: string;
  website: string;
  category: PartnerCategory;
  description: string;
  status: 'active' | 'inactive' | 'pending';
  affiliateId: string;
  signupUrlTemplate: string;
  trackingCookieDays: number;
  /** Public cashback rate for developers (share of their spend). Defaults to 0.1 when omitted. */
  devCashbackRate?: number;
  cashbackDurationMonths?: number | null;
  commission:
    | { type: 'revenue_share'; rate: number }
    | { type: 'one_time'; amountPerSignup: number }
    | { type: 'hybrid'; signupBonus: number; revenueShare: { rate: number } }
    | { type: 'tiered'; tiers: { minReferrals: number; amountPerReferral: number }[] };
  tools: {
    name: string;
    description: string;
    params: {
      name: string;
      type: 'string' | 'number' | 'boolean';
      description: string;
      required: boolean;
      default?: string | number | boolean;
      enum?: string[];
    }[];
    returns: {
      envVarTemplates: Record<string, string>;
      mockData: Record<string, unknown>;
      successMessage: string;
    };
  }[];
  pricing: PricingTier[];
  documentation: { topic: string; content: string }[];
  /** Partner's own MCP server; when set, actions are proxied to it instead of answered from mocks */
  upstream?: UpstreamConfig;
}

function fillTemplate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/** A partner defined entirely by admin config — no code per partner. */
export class DynamicPartner extends BasePartner {
  readonly id: string;
  readonly name: string;
  readonly category: PartnerCategory;
  readonly description: string;
  readonly website: string;
  readonly affiliateId: string;
  readonly commissionRate: number;
  override readonly signupBonus: number;
  override readonly devCashbackRate: number;
  readonly signupUrlTemplate: string;
  readonly pricing: PricingTier[];

  /** Actions reported by the partner's MCP server (tool lists are the same for every dev) */
  private discovered: PartnerActionDef[] | null = null;

  constructor(private readonly config: StoredPartnerConfig, private readonly pool: UpstreamPool = upstreamPool) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.category = config.category;
    this.description = config.description;
    this.website = config.website;
    this.affiliateId = config.affiliateId;
    this.signupUrlTemplate = config.signupUrlTemplate;
    this.pricing = config.pricing ?? [];
    this.devCashbackRate = config.devCashbackRate ?? 0.1;

    const c = config.commission;
    this.commissionRate =
      c.type === 'revenue_share' ? c.rate : c.type === 'hybrid' ? c.revenueShare.rate : 0;
    // ponytail: tiered pays the first tier; per-referral-count tiers need a platform referral counter here.
    this.signupBonus =
      c.type === 'one_time' ? c.amountPerSignup
      : c.type === 'hybrid' ? c.signupBonus
      : c.type === 'tiered' ? (c.tiers[0]?.amountPerReferral ?? 0)
      : 0;
  }

  getActions(): PartnerActionDef[] {
    const declared = this.getDeclaredActions();
    if (!this.discovered) return declared;
    const names = new Set(this.discovered.map(a => a.name));
    return [...this.discovered, ...declared.filter(a => !names.has(a.name))];
  }

  override async discoverActions(context: ActionContext): Promise<void> {
    if (!this.config.upstream || !context.apiKey || this.discovered) return;
    const tools = await this.pool.listTools(this.id, this.config.upstream, context.apiKey);
    this.discovered = tools.map(t => ({ name: t.name, description: t.description, params: {}, inputSchema: t.inputSchema }));
  }

  private getDeclaredActions(): PartnerActionDef[] {
    return (this.config.tools ?? []).map(tool => ({
      name: tool.name,
      description: tool.description,
      params: Object.fromEntries(
        (tool.params ?? []).map(p => [p.name, {
          type: p.type,
          description: p.description,
          required: p.required,
          default: p.default,
          enum: p.enum,
        }]),
      ),
    }));
  }

  async executeAction(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ActionResult> {
    if (this.config.upstream) return this.executeUpstream(actionName, params, context);

    const tool = this.config.tools.find(t => t.name === actionName);
    if (!tool) {
      return { success: false, message: `Action ${actionName} not supported` };
    }

    const resolved: Record<string, unknown> = {};
    for (const p of tool.params) {
      const value = params[p.name] ?? p.default;
      if (value === undefined) {
        if (p.required) return { success: false, message: `Missing required parameter: ${p.name}` };
        continue;
      }
      if (p.enum && !p.enum.includes(String(value))) {
        return { success: false, message: `Invalid ${p.name}: expected one of ${p.enum.join(', ')}` };
      }
      resolved[p.name] = value;
    }

    const envVars = Object.fromEntries(
      Object.entries(tool.returns.envVarTemplates).map(([k, t]) => [k, fillTemplate(t, resolved)]),
    );

    return {
      success: true,
      message: fillTemplate(tool.returns.successMessage, resolved),
      data: tool.returns.mockData,
      envVars,
    };
  }

  private async executeUpstream(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ActionResult> {
    if (!context.apiKey) {
      return { success: false, message: `Link your ${this.name} account with connect_account first.` };
    }
    try {
      const result = await this.pool.callTool(this.id, this.config.upstream!, context.apiKey, actionName, params);
      const templates = this.config.tools.find(t => t.name === actionName)?.returns.envVarTemplates ?? {};
      return {
        success: !result.isError,
        message: result.text,
        data: result.structured ?? {},
        envVars: result.isError
          ? {}
          : Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, fillTemplate(t, params)])),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message: `${this.name} MCP server error: ${message}` };
    }
  }

  async checkHealth(apiKey: string): Promise<'healthy' | 'degraded' | 'down'> {
    if (!this.config.upstream) return 'healthy';
    try {
      await this.pool.listTools(this.id, this.config.upstream, apiKey);
      return 'healthy';
    } catch {
      return 'down';
    }
  }

  async getUsageStats(_apiKey: string): Promise<Record<string, unknown>> {
    return {};
  }

  getDocumentation(topic: string): string {
    return (this.config.documentation ?? []).find(d => d.topic === topic)?.content
      ?? `Visit ${this.website} for more information.`;
  }

  override getAffiliateStrategy(): AffiliateStrategy {
    return {
      type: 'referral_url',
      signupUrlTemplate: this.signupUrlTemplate,
      cookieDays: this.config.trackingCookieDays,
    };
  }
}

/**
 * Syncs active admin-configured partners into the registry. Dynamic partners from disk
 * take precedence over built-in code stubs so admin customizations work in real time.
 */
export class DynamicPartnerLoader {
  /** id -> raw file content + instance, so unchanged partners keep their live upstream sessions */
  private loaded = new Map<string, { raw: string; partner: DynamicPartner }>();

  constructor(
    private registry: PartnerRegistry,
    private dir: string = PARTNERS_DIR,
    private pool: UpstreamPool = upstreamPool,
  ) {}

  async load(): Promise<number> {
    await fs.mkdir(this.dir, { recursive: true });
    const files = (await fs.readdir(this.dir)).filter(f => f.endsWith('.json'));

    const previous = this.loaded;
    this.loaded = new Map();
    for (const id of previous.keys()) this.registry.unregister(id);

    for (const file of files) {
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf-8');
        const config = JSON.parse(raw) as StoredPartnerConfig;
        
        // If config is not active, ensure any matching existing partner is unregistered
        if (config.status !== 'active') {
          const matching = this.registry.getAll().find(
            p => p.name.toLowerCase() === config.name.toLowerCase() || p.id === config.id
          );
          if (matching) this.registry.unregister(matching.id);
          continue;
        }

        // Active dynamic partner takes precedence over built-in code stub with the same name or ID
        const existing = this.registry.getAll().find(
          p => p.name.toLowerCase() === config.name.toLowerCase() || p.id === config.id
        );
        if (existing) {
          this.registry.unregister(existing.id);
        }

        const kept = previous.get(config.id);
        const partner = kept?.raw === raw ? kept.partner : new DynamicPartner(config, this.pool);
        this.registry.register(partner);
        this.loaded.set(config.id, { raw, partner });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[partners] skipping ${file}: ${message}\n`);
      }
    }

    for (const [id, { partner }] of previous) {
      if (this.loaded.get(id)?.partner !== partner) await this.pool.closePartner(id);
    }
    return this.loaded.size;
  }

  /** Reloads on any change in the partners dir, so admin edits reach the MCP server without a restart. */
  watch(): FSWatcher {
    let timer: NodeJS.Timeout | undefined;
    return watch(this.dir, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this.load().catch(e => process.stderr.write(`[partners] reload failed: ${String(e)}\n`));
      }, 200);
    });
  }
}
