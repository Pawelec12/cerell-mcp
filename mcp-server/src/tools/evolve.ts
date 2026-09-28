import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './provision.js';

export function registerEvolveTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'plan_migration',
    'Generate a migration plan from one provider to another, including step-by-step instructions and cost differences.',
    {
      from_provider: z.string().describe('The ID of the current provider partner'),
      to_provider: z.string().describe('The ID of the target provider partner'),
      service_id: z.string().optional().describe('The service ID to migrate (optional)')
    },
    async (args) => {
      const fromPartner = deps.registry.get(args.from_provider);
      const toPartner = deps.registry.get(args.to_provider);

      if (!fromPartner || !toPartner) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'One or both providers not found in registry.' }) }]
        };
      }

      const plan = {
        title: `Migration from ${fromPartner.name} to ${toPartner.name}`,
        service: args.service_id || 'unspecified',
        steps: [
          `Backup existing data from ${fromPartner.name}`,
          `Provision new service instance on ${toPartner.name}`,
          `Migrate schema and configure instances`,
          `Migrate data / state`,
          `Update application environment variables and secrets`,
          `Run integration tests against ${toPartner.name}`,
          `Cutover traffic / deployments`,
          `Decommission old service on ${fromPartner.name}`
        ],
        financialImpact: {
          note: `Migration impacts your cashback. ${toPartner.name}: ~${Math.round(toPartner.devCashbackRate * 100)}% of your spend back; ${fromPartner.name}: ~${Math.round(fromPartner.devCashbackRate * 100)}%.`
        }
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(plan, null, 2) }]
      };
    }
  );

  server.tool(
    'scale_assessment',
    'Assess infrastructure scaling needs and generate recommendations.',
    {},
    async () => {
      const devId = deps.getDevId();
      const services = await deps.graph.getAllServices(devId);
      
      if (services.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ message: 'No services to assess.' }) }]
        };
      }

      const assessments: Record<string, unknown>[] = [];

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        if (partner) {
          const auth = await deps.auth.getLinkedAccount(devId, partner.id);
          const usage = await partner.getUsageStats(auth?.apiKey ?? 'stub');
          
          assessments.push({
            serviceId: service.id,
            partner: partner.name,
            usageStats: usage,
            status: 'Review recommended',
            recommendation: 'Compare usage metrics against current plan limits. Consider vertical scaling if CPU/Memory metrics exceed 80%.'
          });
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ assessments }, null, 2) }]
      };
    }
  );
}
