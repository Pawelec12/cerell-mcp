import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './provision.js';
import type { ServiceNode, PartnerCategory } from '../types.js';

export function registerOptimizeTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'analyze_costs',
    'Analyze infrastructure costs and generate cost-saving suggestions.',
    {
      period: z.string().optional().default('current_month').describe('The billing period to analyze')
    },
    async (args) => {
      const devId = deps.getDevId();
      const services = await deps.graph.getAllServices(devId);
      
      let totalSpend = 0;
      let totalCommission = 0;
      let totalCashback = 0;
      const suggestions: string[] = [];

      const usedCategories = new Set<PartnerCategory>();

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        if (partner) {
          usedCategories.add(partner.category);
          const spend = typeof service.monthlySpend === 'number' ? service.monthlySpend : 0;
          totalSpend += spend;
          
          if (spend === 0) {
            suggestions.push(`Service ${service.id} appears to be on a free tier or has 0 recorded spend. Review limits to avoid unexpected upgrades.`);
          } else {
            const commission = spend * partner.commissionRate;
            totalCommission += commission;
            totalCashback += partner.estimateDevCashback(spend);
            
            if (spend > 100) {
              suggestions.push(`High spend detected on ${service.id} ($${spend}/mo). Consider optimizing usage or evaluating higher-tier volume discounts.`);
            }
          }
        }
      }

      const allCategories = deps.registry.getCategories();
      for (const cat of allCategories) {
        if (!usedCategories.has(cat)) {
          suggestions.push(`Opportunity: You have no active ${cat} services. Deploying one via a partner could earn additional cashback.`);
        }
      }

      const analysis = {
        period: args.period,
        totalSpend,
        estimatedCashback: totalCashback,
        suggestions
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(analysis, null, 2) }]
      };
    }
  );

  server.tool(
    'suggest_optimization',
    'Get service-specific optimization recommendations based on usage stats and docs.',
    {
      service_id: z.string().describe('The ID of the service to optimize')
    },
    async (args) => {
      const devId = deps.getDevId();
      const service = await deps.graph.getService(devId, args.service_id);
      
      if (!service) {
        return {
          content: [{ type: 'text' as const, text: `Error: Service ${args.service_id} not found.` }]
        };
      }

      const partner = deps.registry.get(service.partner);
      if (!partner) {
        return {
          content: [{ type: 'text' as const, text: `Error: Partner ${service.partner} not found in registry.` }]
        };
      }

      const auth = await deps.auth.getLinkedAccount(devId, partner.id);
      const usageStats = await partner.getUsageStats(auth?.apiKey ?? 'stub');
      const scalingDocs = partner.getDocumentation('scaling');

      let response = `# Optimization Suggestions for ${service.id} (${partner.name})\n\n`;
      response += `**Current Usage:**\n\`\`\`json\n${JSON.stringify(usageStats, null, 2)}\n\`\`\`\n\n`;
      response += `**Recommendations:**\n`;
      response += `- Implement connection pooling if connections are high.\n`;
      response += `- Ensure proper indexing on frequently queried fields.\n`;
      response += `- Consider caching strategies for read-heavy workloads.\n\n`;
      response += `**Provider Docs (Scaling):**\n> ${scalingDocs}\n`;

      return {
        content: [{ type: 'text' as const, text: response }]
      };
    }
  );

  server.tool(
    'recommend_upgrade',
    'Evaluate current service plans and recommend upgrades based on tier limits and cashback benefits.',
    {
      service_id: z.string().optional().describe('Specific service ID to evaluate, or all if omitted')
    },
    async (args) => {
      const devId = deps.getDevId();
      let services: ServiceNode[] = [];
      
      if (args.service_id) {
        const svc = await deps.graph.getService(devId, args.service_id);
        if (svc) services.push(svc);
      } else {
        services = await deps.graph.getAllServices(devId);
      }

      if (services.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ recommendations: [] }, null, 2) }]
        };
      }

      const recommendations: Record<string, unknown>[] = [];

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        if (!partner || !partner.pricing || partner.pricing.length === 0) continue;

        const currentSpend = service.monthlySpend;
        
        let currentTierIndex = 0;
        for (let i = 0; i < partner.pricing.length; i++) {
          if (currentSpend >= partner.pricing[i].monthlyPrice) {
            currentTierIndex = i;
          }
        }

        const currentTier = partner.pricing[currentTierIndex];
        const nextTier = partner.pricing[currentTierIndex + 1];

        if (nextTier) {
          const currentCashback = partner.estimateDevCashback(currentSpend);
          const nextCashback = partner.estimateDevCashback(nextTier.monthlyPrice);

          recommendations.push({
            serviceId: service.id,
            partner: partner.name,
            currentPlan: currentTier.name,
            currentCost: currentSpend,
            nextPlan: nextTier.name,
            nextCost: nextTier.monthlyPrice,
            cashbackDelta: nextCashback - currentCashback,
            rationale: `Upgrading to ${nextTier.name} adds \$${nextTier.monthlyPrice - currentSpend} to cost but grants \$${(nextCashback - currentCashback).toFixed(2)} additional cashback.`
          });
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ recommendations }, null, 2) }]
      };
    }
  );
}
