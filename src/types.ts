// ============================================================================
// types.ts — Single source of truth for all types and interfaces
// ============================================================================

// ===== Partner Types =====

/** Infrastructure categories that partners can serve */
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

/** Definition of a single action a partner supports */
export interface PartnerActionDef {
  name: string;
  description: string;
  params: Record<string, ParamDef>;
  /** Full JSON Schema when the action comes from a partner's own MCP server */
  inputSchema?: Record<string, unknown>;
}

/** Parameter definition for a partner action */
export interface ParamDef {
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
  default?: string | number | boolean;
  enum?: string[];
}

/** A pricing tier offered by a partner */
export interface PricingTier {
  name: string;
  monthlyPrice: number;
  features: string[];
}

/** Context passed to action handlers during execution */
export interface ActionContext {
  devId: string;
  apiKey?: string;
  affiliateId: string;
}

/** Result of executing a partner action */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  envVars?: Record<string, string>;
}

/** Affiliate strategy configuration per partner */
export interface AffiliateStrategy {
  type: "referral_url" | "api_header" | "coupon" | "marketplace";
  signupUrlTemplate: string;
  cookieDays?: number;
  headerName?: string;
  headerValue?: string;
  couponCode?: string;
}

// ===== Infrastructure State Graph =====

/** The complete infrastructure graph for a developer */
export interface InfraGraph {
  devId: string;
  services: Record<string, ServiceNode>;
  connections: Connection[];
  createdAt: string;
  updatedAt: string;
}

/** A single service/resource in the infrastructure graph */
export interface ServiceNode {
  id: string;
  partner: string;
  category: PartnerCategory;
  name: string;
  plan: string;
  region?: string;
  status: "active" | "inactive" | "pending" | "error";
  config: Record<string, unknown>;
  envVars: Record<string, string>;
  monthlySpend: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/** A connection between two services */
export interface Connection {
  fromServiceId: string;
  toServiceId: string;
  type: "env_var" | "webhook" | "api_call" | "sdk";
  label: string;
}

// ===== Affiliate & Cashback =====

export type AffiliateEventStatus = "pending" | "confirmed" | "rejected";

/** A single tracked affiliate event */
export interface AffiliateEvent {
  id: string;
  devId: string;
  partner: string;
  action: string;
  type: "signup" | "provision" | "upgrade" | "usage";
  estimatedRevenue: number;
  cashbackAmount: number;
  timestamp: string;
  status: AffiliateEventStatus;
  confirmedAt?: string | null;
  rejectionReason?: string | null;
}

/** Cashback balance for a developer */
export interface CashbackBalance {
  /** Cleared funds backed by confirmed partner payouts, available for withdrawal */
  available: number;
  /** Estimated cashback from pending partner events awaiting settlement */
  pendingCashback: number;
  /** Payout requests currently pending processing by admin */
  pending: number;
  /** Total lifetime confirmed cashback earned */
  lifetimeEarned: number;
  lastUpdated: string;
}

export type PayoutMethod = "stripe" | "revolut" | "wise" | "paypal" | "bank_transfer" | "crypto" | "credits";

/** Cashback payout request (same shape as admin-dashboard DevPayoutRequest) */
export interface DevPayoutRequest {
  id: string;
  devId: string;
  amount: number;
  method: PayoutMethod;
  status: "requested" | "approved" | "paid" | "rejected";
  requestedAt: string;
  processedAt: string | null;
  rejectionReason: string | null;
  estimatedFee?: number;
  netAmount?: number;
  payoutDetails?: Record<string, any>;
}

/** Tiered cashback configuration */
export interface CashbackTier {
  minMonthlySpend: number;
  devShare: number;
}

/** Full cashback configuration */
export interface CashbackConfig {
  defaultDevShare: number;
  tiers: CashbackTier[];
  referralBonusPerUser: number;
  newPartnerBonus: number;
  /** Smallest cashback payout a dev can request */
  minPayout: number;
}

// ===== Auth / Developer Account =====

/** Developer account on the platform */
export interface DevAccount {
  id: string;
  createdAt: string;
  linkedAccounts: Record<string, LinkedAccount>;
}

/** A linked partner account */
export interface LinkedAccount {
  partnerId: string;
  externalId?: string;
  apiKey: string;
  linkedAt: string;
  currentPlan: string;
  monthlySpend: number;
}

// ===== Tool Results =====

/** Result of compare_providers tool */
export interface ProviderComparison {
  category: PartnerCategory;
  requirements: string[];
  recommendations: ProviderRecommendation[];
}

/** A single provider recommendation */
export interface ProviderRecommendation {
  provider: string;
  name: string;
  matchScore: number;
  reason: string;
  pricing: string;
  cashbackEstimate: string;
  availableActions: string[];
}

/** Result of setup_service tool */
export interface SetupResult {
  status: "success" | "account_required" | "error";
  message: string;
  signupUrl?: string;
  serviceId?: string;
  data?: Record<string, unknown>;
  envVars?: Record<string, string>;
  cashbackInfo?: string;
}

/** Result of infra_status tool */
export interface InfraStatusResult {
  services: ServiceStatusEntry[];
  totalMonthlySpend: number;
  totalMonthlyCashback: number;
  connections: Connection[];
}

/** Status of a single service */
export interface ServiceStatusEntry {
  id: string;
  partner: string;
  name: string;
  category: PartnerCategory;
  status: "healthy" | "degraded" | "down" | "unknown";
  plan: string;
  details: string;
  monthlySpend: number;
  cashback: number;
}

/** Result of analyze_costs tool */
export interface CostAnalysis {
  period: string;
  totalSpend: number;
  totalCashback: number;
  netCost: number;
  breakdown: CostBreakdownEntry[];
  suggestions: CostSuggestion[];
}

/** Cost breakdown per partner */
export interface CostBreakdownEntry {
  partner: string;
  category: PartnerCategory;
  plan: string;
  monthlySpend: number;
  cashback: number;
  netCost: number;
}

/** Cost optimization suggestion */
export interface CostSuggestion {
  type: "downgrade" | "upgrade" | "switch" | "new_service" | "optimize";
  partner: string;
  message: string;
  estimatedSaving: number;
  estimatedCashbackChange: number;
}

/** Result of scale_assessment tool */
export interface ScaleAssessment {
  currentCapacity: string;
  estimatedHeadroom: string;
  bottlenecks: Bottleneck[];
  recommendations: ScaleRecommendation[];
}

/** A scaling bottleneck */
export interface Bottleneck {
  service: string;
  metric: string;
  currentUsage: string;
  limit: string;
  severity: "low" | "medium" | "high";
}

/** A scaling recommendation */
export interface ScaleRecommendation {
  service: string;
  action: string;
  reason: string;
  estimatedCost: number;
  estimatedCashback: number;
}

/** Result of plan_migration tool */
export interface MigrationPlan {
  from: string;
  to: string;
  steps: MigrationStep[];
  estimatedDowntime: string;
  risks: string[];
  costChange: number;
  cashbackChange: number;
}

/** A single migration step */
export interface MigrationStep {
  order: number;
  action: string;
  description: string;
  automated: boolean;
}
