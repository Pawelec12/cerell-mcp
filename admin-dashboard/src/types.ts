// ============================================================================
// types.ts — Admin dashboard types: commission models, partner configs, payouts
// ============================================================================

// ===== Partner Categories (mirror of mcp-server) =====

export type PartnerCategory =
  | "database"
  | "hosting"
  | "auth"
  | "payments"
  | "monitoring"
  | "analytics"
  | "storage"
  | "email"
  | "cache"
  | "queue";

// ===== Commission Models =====

/**
 * Revenue Share: partner pays X% of dev's monthly spend, recurring.
 * Example: Neon pays 20% of monthly spend for 12 months.
 */
export interface RevenueShareCommission {
  type: "revenue_share";
  /** Commission rate as decimal (0.20 = 20%) */
  rate: number;
  /** What the rate applies to */
  basis: "monthly_spend" | "first_month_only" | "annual_spend";
  /** How many months the commission lasts. null = lifetime */
  durationMonths: number | null;
  /** Minimum accumulated amount before partner pays out */
  minPayout: number;
}

/**
 * One-Time Bounty: partner pays flat $X per dev signup.
 * Example: DigitalOcean pays $20 per signup if dev spends ≥$10 in first month.
 */
export interface OneTimeCommission {
  type: "one_time";
  /** Flat amount per qualifying signup */
  amountPerSignup: number;
  /** Optional: minimum first-month spend required to qualify */
  qualifyingMinSpend: number;
  /** Human-readable condition description */
  conditionDescription: string;
  /** Minimum accumulated amount before partner pays out */
  minPayout: number;
}

/**
 * Hybrid: signup bonus + ongoing revenue share.
 * Example: Stripe pays $10 signup bonus + 15% monthly for 12 months.
 */
export interface HybridCommission {
  type: "hybrid";
  /** One-time signup bonus */
  signupBonus: number;
  /** Ongoing revenue share config */
  revenueShare: Omit<RevenueShareCommission, "type">;
  /** Minimum accumulated amount before partner pays out */
  minPayout: number;
}

/**
 * Tiered: payout per signup increases with volume.
 * Example: AWS pays $20/signup for 1-10 referrals, $30 for 11-50, $50 for 50+.
 */
export interface TieredCommission {
  type: "tiered";
  /** Tiers sorted ascending by minReferrals */
  tiers: TieredLevel[];
  /** Minimum accumulated amount before partner pays out */
  minPayout: number;
}

export interface TieredLevel {
  /** Minimum total referrals to enter this tier */
  minReferrals: number;
  /** Amount paid per referral in this tier */
  amountPerReferral: number;
}

/** Discriminated union of all commission models */
export type CommissionConfig =
  | RevenueShareCommission
  | OneTimeCommission
  | HybridCommission
  | TieredCommission;

// ===== MCP Tool Definition (what admin configures per partner) =====

/** A single parameter for an MCP tool */
export interface ToolParamDef {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  default?: string | number | boolean;
  enum?: string[];
}

/** What a tool returns (template for mock responses) */
export interface ToolReturnDef {
  /** Environment variables this tool sets (name → description/template) */
  envVarTemplates: Record<string, string>;
  /** Mock response data template */
  mockData: Record<string, unknown>;
  /** Success message template */
  successMessage: string;
}

/** Complete tool definition as admin enters it */
export interface ToolDefinition {
  name: string;
  description: string;
  params: ToolParamDef[];
  returns: ToolReturnDef;
}

/** Pricing tier definition */
export interface PricingTierDef {
  name: string;
  monthlyPrice: number;
  features: string[];
}

/** Documentation entry (topic → content) */
export interface DocEntry {
  topic: string;
  content: string;
}

/**
 * Partner's own MCP server that the gateway proxies to. `{api_key}` in args/env/url/headers
 * is replaced with each developer's linked API key.
 */
export type UpstreamConfig =
  | { transport: "stdio"; command: "npx" | "node" | "uvx" | "docker"; args: string[]; env: Record<string, string> }
  | { transport: "http"; url: string; headers: Record<string, string> };

// ===== Partner Configuration (full record admin creates) =====

export interface PartnerConfig {
  id: string;
  name: string;
  website: string;
  category: PartnerCategory;
  description: string;
  logoUrl: string;
  status: "active" | "inactive" | "pending";

  // Affiliate tracking
  affiliateId: string;
  signupUrlTemplate: string;
  trackingCookieDays: number;
  partnerDashboardUrl: string;
  partnerContactEmail: string;

  // Commission structure
  commission: CommissionConfig;
  payoutCycle: "monthly" | "quarterly";

  // MCP integration
  /** When set, actions are proxied to this server; `tools` then lists only featured actions */
  upstream?: UpstreamConfig;
  tools: ToolDefinition[];
  pricing: PricingTierDef[];
  documentation: DocEntry[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ===== Financial / Payout Types =====

/** A payout record FROM a partner TO the platform */
export interface PartnerPayout {
  id: string;
  partnerId: string;
  period: string;
  grossAmount: number;
  status: "expected" | "confirmed" | "received";
  expectedDate: string;
  receivedAt: string | null;
  notes: string;
  createdAt: string;
}

/** A cashback payout request FROM platform TO a developer */
export interface DevPayoutRequest {
  id: string;
  devId: string;
  amount: number;
  method: "paypal" | "bank_transfer" | "crypto" | "credits";
  status: "requested" | "approved" | "paid" | "rejected";
  requestedAt: string;
  processedAt: string | null;
  rejectionReason: string | null;
}

/** Financial overview snapshot */
export interface FinancialOverview {
  /** Total commission earned from all partners (all time) */
  grossRevenue: number;
  /** Total cashback paid/owed to developers */
  totalCashbackLiability: number;
  /** Gross minus cashback = platform revenue */
  netRevenue: number;
  /** Pending payouts from partners not yet received */
  pendingReceivables: number;
  /** Pending cashback payout requests from devs */
  pendingDevPayouts: number;
  /** Monthly recurring revenue (current month) */
  currentMRR: number;
  /** Breakdown per partner */
  partnerBreakdown: PartnerFinancials[];
}

export interface PartnerFinancials {
  partnerId: string;
  partnerName: string;
  totalCommission: number;
  totalCashbackPaid: number;
  platformMargin: number;
  activeDevelopers: number;
  totalReferrals: number;
}

// ===== Commission Calculation Results =====

/** Result of a single commission calculation */
export interface CommissionResult {
  /** What the partner pays the platform */
  partnerPays: number;
  /** What the platform gives back to the developer */
  devCashback: number;
  /** What the platform keeps */
  platformMargin: number;
  /** Applied dev share percentage */
  devShareRate: number;
  /** Whether the commission qualifies (conditions met) */
  qualifies: boolean;
  /** If not qualified, why */
  disqualifyReason: string | null;
}

/** Input event for commission calculation */
export interface CommissionEvent {
  type: "signup" | "monthly_spend";
  /** Developer's monthly spend with this partner */
  monthlySpend: number;
  /** Months since the developer signed up with this partner */
  monthsSinceSignup: number;
  /** Total referrals the platform has sent to this partner (for tiered) */
  totalPlatformReferrals: number;
  /** Whether this is the developer's first month */
  isFirstMonth: boolean;
}

// ===== Developer Analytics =====

export interface DeveloperStats {
  devId: string;
  joinedAt: string;
  linkedPartners: number;
  totalMonthlySpend: number;
  totalCashbackEarned: number;
  platformRevenueGenerated: number;
  /** Estimated lifetime value */
  estimatedLTV: number;
  /** Which partners this dev is using */
  partnerBreakdown: DevPartnerStat[];
}

export interface DevPartnerStat {
  partnerId: string;
  partnerName: string;
  plan: string;
  monthlySpend: number;
  cashbackEarned: number;
  monthsActive: number;
}

// ===== API Response Wrappers =====

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
