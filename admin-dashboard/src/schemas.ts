import { z } from "zod";

// Runtime validation for everything the admin API accepts. Mirrors types.ts.

const money = z.number().finite().nonnegative();
const rate = z.number().min(0).max(1);

export const CategorySchema = z.enum([
  "database", "hosting", "auth", "payments", "monitoring",
  "analytics", "storage", "email", "cache", "queue",
]);

const RevenueShareFields = {
  rate,
  basis: z.enum(["monthly_spend", "first_month_only", "annual_spend"]),
  durationMonths: z.number().int().positive().nullable(),
  minPayout: money,
};

export const CommissionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("revenue_share"), ...RevenueShareFields }),
  z.object({
    type: z.literal("one_time"),
    amountPerSignup: z.number().positive(),
    qualifyingMinSpend: money,
    conditionDescription: z.string(),
    minPayout: money,
  }),
  z.object({
    type: z.literal("hybrid"),
    signupBonus: money,
    revenueShare: z.object(RevenueShareFields),
    minPayout: money,
  }),
  z.object({
    type: z.literal("tiered"),
    tiers: z
      .array(z.object({ minReferrals: z.number().int().nonnegative(), amountPerReferral: z.number().positive() }))
      .min(1, "Tiered commission must have at least one tier")
      .refine(
        (tiers) => tiers.every((t, i) => i === 0 || t.minReferrals > tiers[i - 1].minReferrals),
        "Tiers must be sorted ascending by minReferrals",
      ),
    minPayout: money,
  }),
]);

const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/, "Use snake_case (e.g. create_database)");

const ToolSchema = z.object({
  name: identifier,
  description: z.string().min(1),
  params: z.array(z.object({
    name: identifier,
    type: z.enum(["string", "number", "boolean"]),
    description: z.string(),
    required: z.boolean(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    enum: z.array(z.string()).optional(),
  })),
  returns: z.object({
    envVarTemplates: z.record(z.string()),
    mockData: z.record(z.unknown()),
    successMessage: z.string().min(1),
  }),
});

const UpstreamSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("stdio"),
    command: z.enum(["npx", "node", "uvx", "docker"]),
    args: z.array(z.string()),
    env: z.record(z.string()).default({}),
  }).strict(),
  z.object({
    transport: z.literal("http"),
    url: z.string().url().refine(
      (u) => u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u),
      "Must be https:// (developer API keys are sent to this URL)",
    ),
    headers: z.record(z.string()).default({}),
  }).strict(),
]);

const PartnerFields = z.object({
  name: z.string().trim().min(1, "Name cannot be empty"),
  website: z.string().url(),
  category: CategorySchema,
  description: z.string().min(1),
  logoUrl: z.string().url().or(z.literal("")),
  status: z.enum(["active", "inactive", "pending"]),
  affiliateId: z.string().min(1),
  signupUrlTemplate: z.string().url().refine((u) => u.includes("{dev_id}"), "Must contain {dev_id} for tracking"),
  trackingCookieDays: z.number().int().nonnegative(),
  partnerDashboardUrl: z.string().url().or(z.literal("")),
  partnerContactEmail: z.string().email().or(z.literal("")),
  commission: CommissionSchema,
  payoutCycle: z.enum(["monthly", "quarterly"]),
  upstream: UpstreamSchema.optional(),
  tools: z.array(ToolSchema),
  pricing: z.array(z.object({ name: z.string().min(1), monthlyPrice: money, features: z.array(z.string()) })),
  documentation: z.array(z.object({ topic: z.string().min(1), content: z.string() })),
}).strict();

/** Full partner record; cross-field rules live here so PUT can re-check the merged result. */
export const PartnerCreateSchema = PartnerFields.refine(
  (p) => p.tools.length > 0 || p.upstream !== undefined,
  { message: "Define at least one tool or connect the partner's MCP server (upstream)", path: ["tools"] },
);
export const PartnerUpdateSchema = PartnerFields.partial();

export const StatusSchema = z.object({ status: z.enum(["active", "inactive", "pending"]) });

export const SimulateSchema = z.object({
  commissionConfig: CommissionSchema,
  monthlySpend: money,
  months: z.number().int().min(1).max(120),
  devShareRate: rate.optional(),
});

export const CalculateSchema = z.object({
  partnerId: z.string().min(1),
  event: z.object({
    type: z.enum(["signup", "monthly_spend"]),
    monthlySpend: money,
    monthsSinceSignup: z.number().int().nonnegative(),
    totalPlatformReferrals: z.number().int().nonnegative(),
    isFirstMonth: z.boolean(),
  }),
  devShareRate: rate.optional(),
});

export const PartnerPayoutSchema = z.object({
  partnerId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be YYYY-MM"),
  grossAmount: z.number().positive(),
  expectedDate: z.string().date(),
});

export const PartnerPayoutStatusSchema = z.object({ status: z.enum(["confirmed", "received"]) });

export const DevPayoutStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved") }),
  z.object({ status: z.literal("paid") }),
  z.object({ status: z.literal("rejected"), rejectionReason: z.string().min(1) }),
]);

export const TestActionSchema = z.object({
  actionName: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});
