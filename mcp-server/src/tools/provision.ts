// ============================================================================
// tools/provision.ts — Provision mode: compare, setup, connect
// ============================================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  ProviderComparison,
  ProviderRecommendation,
  SetupResult,
  PartnerCategory,
} from "../types.js";
import type { PartnerRegistry } from "../partners/base.js";
import type { InfraStateGraph } from "../graph.js";
import type { AffiliateTracker, CashbackEngine } from "../affiliate.js";
import type { AuthManager } from "../auth.js";
import type { DevPayoutStore } from "../payouts.js";

export interface ToolDeps {
  getDevId: () => string;
  graph: InfraStateGraph;
  registry: PartnerRegistry;
  tracker: AffiliateTracker;
  cashbackEngine: CashbackEngine;
  auth: AuthManager;
  payouts: DevPayoutStore;
}

const CATEGORY_ENUM = z.enum([
  "database", "hosting", "auth", "payments", "monitoring",
  "analytics", "storage", "email", "cache", "queue",
]);

export function registerProvisionTools(server: McpServer, deps: ToolDeps): void {
  // ─── compare_providers ──────────────────────────────────────────────
  server.tool(
    "compare_providers",
    "Compare infrastructure providers in a given category. Returns ranked recommendations with cashback estimates. Use this to help developers choose the right service.",
    {
      category: CATEGORY_ENUM.describe("Infrastructure category to compare (e.g. 'database', 'hosting', 'auth')"),
      requirements: z.string().optional().describe("Comma-separated requirements (e.g. 'postgres,serverless,branching')"),
    },
    async (params) => {
      const { category, requirements } = params;
      const reqsList = requirements
        ? requirements.split(",").map((r) => r.trim().toLowerCase())
        : [];

      const partners = deps.registry.getByCategory(category as PartnerCategory);

      if (partners.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `No providers found for category "${category}". Available categories: ${deps.registry.getCategories().join(", ")}`,
          }],
        };
      }

      const recommendations: ProviderRecommendation[] = partners.map((p) => {
        const actions = p.getActions();
        const actionNames = actions.map((a) => a.name);

        // Score based on requirements match (check description + action names)
        const searchableText = [
          p.description,
          ...actions.map((a) => a.description),
          ...actionNames,
        ].join(" ").toLowerCase();

        let matchScore = 80; // base score for category match
        for (const req of reqsList) {
          if (searchableText.includes(req)) {
            matchScore = Math.min(100, matchScore + 5);
          }
        }

        // Pricing summary
        const pricingStr = p.pricing
          .map((t) => `${t.name}: \$${t.monthlyPrice}/mo`)
          .join(" | ");

        // Cashback estimate from cheapest paid plan
        const cheapestPaid = p.pricing.find((t) => t.monthlyPrice > 0);
        const cashbackEst = cheapestPaid
          ? `~\$${p.estimateDevCashback(cheapestPaid.monthlyPrice).toFixed(2)}/mo on ${cheapestPaid.name} plan (~${Math.round(p.devCashbackRate * 100)}% of your spend)`
          : "Free tier available — cashback starts on paid plans";

        return {
          provider: p.id,
          name: p.name,
          matchScore,
          reason: p.description,
          pricing: pricingStr,
          cashbackEstimate: cashbackEst,
          availableActions: actionNames,
        };
      });

      // Sort by match score descending
      recommendations.sort((a, b) => b.matchScore - a.matchScore);

      const result: ProviderComparison = {
        category: category as PartnerCategory,
        requirements: reqsList,
        recommendations,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ─── setup_service ──────────────────────────────────────────────────
  server.tool(
    "setup_service",
    "Provision or configure a service with a partner. If the developer hasn't linked their account yet, returns a signup URL with affiliate tracking. Once linked, executes the action and adds the service to the infrastructure graph.",
    {
      provider: z.string().describe("Partner ID (e.g. 'neon', 'vercel', 'clerk')"),
      action: z.string().describe("Action to execute (e.g. 'create_database', 'deploy')"),
      config: z.string().optional().describe("JSON string of action-specific config parameters"),
    },
    async (params) => {
      const { provider, action, config } = params;
      const devId = deps.getDevId();

      // Validate partner exists
      const partner = deps.registry.get(provider);
      if (!partner) {
        const available = deps.registry.getAll().map((p) => p.id).join(", ");
        const result: SetupResult = {
          status: "error",
          message: `Partner "${provider}" not found. Available partners: ${available}`,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Check if dev has linked account
      const isLinked = await deps.auth.isLinked(devId, provider);
      if (!isLinked) {
        const signupUrl = partner.getAffiliateSignupUrl(devId);
        const result: SetupResult = {
          status: "account_required",
          message: `To use ${partner.name}, you need to create an account first. Click the signup link below, then use the connect_account tool with your API key.`,
          signupUrl,
          cashbackInfo: `You'll earn cashback on every dollar spent with ${partner.name} after signing up through this link.`,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // Parse config
      let parsedConfig: Record<string, unknown> = {};
      if (config) {
        try {
          parsedConfig = JSON.parse(config) as Record<string, unknown>;
        } catch {
          const result: SetupResult = {
            status: "error",
            message: "Invalid JSON in config parameter. Please provide valid JSON.",
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }
      }

      const linked = await deps.auth.getLinkedAccount(devId, provider);
      const context = {
        devId,
        apiKey: linked?.apiKey,
        affiliateId: partner.affiliateId,
      };

      try {
        // Validate action exists (partners with their own MCP server report actions only once linked)
        await partner.discoverActions(context);
        const validActions = partner.getActions();
        if (!validActions.some((a) => a.name === action)) {
          const result: SetupResult = {
            status: "error",
            message: `Action "${action}" not found for ${partner.name}. Available actions: ${validActions.map((a) => a.name).join(", ")}`,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }

        const actionResult = await partner.executeAction(action, parsedConfig, context);

        if (actionResult.success) {
          // Add to infrastructure graph
          const serviceId = (actionResult.data?.["id"] as string) ?? `${provider}-${Date.now()}`;
          await deps.graph.addService(devId, {
            id: serviceId,
            partner: provider,
            category: partner.category,
            name: `${partner.name} — ${action}`,
            plan: linked?.currentPlan ?? "free",
            status: "active",
            config: parsedConfig,
            envVars: actionResult.envVars ?? {},
            monthlySpend: linked?.monthlySpend ?? 0,
            createdAt: new Date().toISOString(),
            metadata: actionResult.data ?? {},
          });

          // Track the provision for analytics only: recurring commission is credited when the
          // partner reports spend, otherwise repeating an action would mint cashback.
          const spend = linked?.monthlySpend ?? 0;

          await deps.tracker.trackEvent({
            devId,
            partner: provider,
            action,
            type: "provision",
            estimatedRevenue: 0,
            cashbackAmount: 0,
          });

          const result: SetupResult = {
            status: "success",
            message: actionResult.message,
            serviceId,
            data: actionResult.data,
            envVars: actionResult.envVars,
            cashbackInfo: spend > 0
              ? `Cashback tracking active: ~\$${partner.estimateDevCashback(spend).toFixed(2)}/mo (~${Math.round(partner.devCashbackRate * 100)}% of your spend)`
              : "Cashback will activate when you upgrade to a paid plan",
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } else {
          const result: SetupResult = {
            status: "error",
            message: actionResult.message,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const result: SetupResult = { status: "error", message };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    },
  );

  // ─── connect_account ────────────────────────────────────────────────
  server.tool(
    "connect_account",
    "Link a developer's partner account. After signing up with a partner, use this tool to connect the account by providing the API key. This enables provisioning and cashback tracking.",
    {
      provider: z.string().describe("Partner ID (e.g. 'neon', 'vercel')"),
      api_key: z.string().describe("Your API key for this partner"),
      plan: z.string().optional().default("free").describe("Current plan (e.g. 'free', 'pro', 'launch')"),
    },
    async (params) => {
      const { provider, api_key, plan } = params;
      const devId = deps.getDevId();

      // Validate partner exists
      const partner = deps.registry.get(provider);
      if (!partner) {
        const available = deps.registry.getAll().map((p) => p.id).join(", ");
        return {
          content: [{
            type: "text" as const,
            text: `Partner "${provider}" not found. Available partners: ${available}`,
          }],
        };
      }

      const planTier = partner.pricing.find(
        (t) => t.name.toLowerCase() === plan.toLowerCase(),
      );
      const monthlySpend = planTier?.monthlyPrice ?? 0;
      const firstLink = !(await deps.auth.isLinked(devId, provider));

      await deps.auth.linkAccount(devId, provider, api_key, plan, monthlySpend);

      // Signup commission is credited once per dev + partner; re-linking only updates the plan.
      const commission = firstLink ? monthlySpend * partner.commissionRate + partner.signupBonus : 0;
      const cashback = deps.cashbackEngine.calculateCashback(commission, monthlySpend);

      if (firstLink) {
        await deps.tracker.trackEvent({
          devId,
          partner: provider,
          action: "link_account",
          type: "signup",
          estimatedRevenue: commission,
          cashbackAmount: cashback.devAmount,
        });
      }

      const msg = [
        `✅ Successfully ${firstLink ? "linked" : "updated"} ${partner.name} account (plan: ${plan}).`,
        "",
        commission > 0
          ? `💰 Cashback earned: \$${cashback.devAmount.toFixed(2)} (~${Math.round(partner.devCashbackRate * 100)}% of your spend on ${partner.name})`
          : firstLink
            ? "💡 You're on the free tier. Cashback activates when you upgrade to a paid plan."
            : "ℹ️ Signup cashback was already credited for this partner.",
        "",
        `Available actions: ${partner.getActions().map((a) => a.name).join(", ")}`,
      ].join("\n");

      return { content: [{ type: "text" as const, text: msg }] };
    },
  );

  // ─── list_actions ───────────────────────────────────────────────────
  server.tool(
    "list_actions",
    "List every action a partner supports with its input schema. Call this before setup_service to know which parameters an action needs. Partners with their own MCP server expose their full toolset once the account is linked.",
    {
      provider: z.string().describe("Partner ID (from compare_providers)"),
    },
    async ({ provider }) => {
      const partner = deps.registry.get(provider);
      if (!partner) {
        const available = deps.registry.getAll().map((p) => p.id).join(", ");
        return { content: [{ type: "text" as const, text: `Partner "${provider}" not found. Available partners: ${available}` }] };
      }

      const devId = deps.getDevId();
      const linked = await deps.auth.getLinkedAccount(devId, provider);
      let note = linked ? "" : "Account not linked yet — only the partner's featured actions are listed. Use setup_service to get the signup link.";
      try {
        await partner.discoverActions({ devId, apiKey: linked?.apiKey, affiliateId: partner.affiliateId });
      } catch (e: unknown) {
        note = `Could not reach ${partner.name}'s MCP server: ${e instanceof Error ? e.message : String(e)}`;
      }

      const actions = partner.getActions().map((a) => ({
        name: a.name,
        description: a.description,
        inputSchema: a.inputSchema ?? a.params,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ provider, name: partner.name, note: note || undefined, actions }, null, 2) }],
      };
    },
  );
}
