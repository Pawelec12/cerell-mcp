import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './provision.js';
import type { InfraStatusResult, ServiceStatusEntry, ServiceNode } from '../types.js';

export function registerOperateTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'infra_status',
    'Get overall infrastructure status, including all deployed services and their health.',
    {},
    async () => {
      const devId = deps.getDevId();
      const services = await deps.graph.getAllServices(devId);
      
      if (services.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Your infrastructure is currently empty. Use the provision_service tool to get started by adding a database or API service.'
          }]
        };
      }

      let totalSpend = 0;
      let totalCashback = 0;
      const statusEntries: ServiceStatusEntry[] = [];

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        let health: 'healthy' | 'degraded' | 'down' | 'unknown' = 'unknown';
        let svcCashback = 0;

        if (partner) {
          const linked = await deps.auth.getLinkedAccount(devId, partner.id);
          health = await partner.checkHealth(linked?.apiKey ?? 'stub');

          totalSpend += service.monthlySpend;

          if (service.monthlySpend > 0) {
            svcCashback = partner.estimateDevCashback(service.monthlySpend);
            totalCashback += svcCashback;
          }
        }

        statusEntries.push({
          id: service.id,
          partner: service.partner,
          name: service.name,
          category: service.category,
          status: health,
          plan: service.plan,
          details: `Health: ${health}`,
          monthlySpend: service.monthlySpend,
          cashback: svcCashback,
        });
      }

      const connections = await deps.graph.getConnections(devId);

      const result: InfraStatusResult = {
        services: statusEntries,
        totalMonthlySpend: totalSpend,
        totalMonthlyCashback: totalCashback,
        connections,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
      };
    }
  );

  server.tool(
    'debug_connection',
    'Diagnose connection issues for a specific service.',
    {
      service_id: z.string().describe('The ID of the service to debug'),
      error_message: z.string().optional().describe('The error message encountered')
    },
    async (args) => {
      const devId = deps.getDevId();
      const service = await deps.graph.getService(devId, args.service_id);
      
      if (!service) {
        return {
          content: [{ type: 'text' as const, text: `Error: Service ${args.service_id} not found in your infrastructure.` }]
        };
      }

      const partner = deps.registry.get(service.partner);
      if (!partner) {
        return {
          content: [{ type: 'text' as const, text: `Error: Partner ${service.partner} not found in registry.` }]
        };
      }

      const auth = await deps.auth.getLinkedAccount(devId, partner.id);
      const health = await partner.checkHealth(auth?.apiKey ?? 'stub');
      
      let diagnostic = `# Diagnostics for ${service.id} (${partner.name})\n\n`;
      diagnostic += `**Partner Health:** ${health}\n\n`;
      
      if (args.error_message) {
        const msg = args.error_message.toLowerCase();
        diagnostic += `**Error Analysis:**\n`;
        if (msg.includes('connection refused') || msg.includes('timeout')) {
          diagnostic += `- Network issue detected. Please check if the service is running, if IP allowlists are configured correctly, and if the port is open.\n`;
        } else if (msg.includes('401') || msg.includes('auth')) {
          diagnostic += `- Authentication failed. Check if your API key or credentials are valid and have the correct permissions.\n`;
        } else if (msg.includes('ssl') || msg.includes('certificate')) {
          diagnostic += `- SSL/TLS error. Verify if the client requires a specific SSL mode or CA certificate.\n`;
        } else {
          diagnostic += `- No specific pattern matched. Refer to ${partner.name} documentation for this specific error.\n`;
        }
      }

      diagnostic += `\n**Next Steps:**\n`;
      diagnostic += `1. Review ${partner.name} connection docs: ${partner.getDocumentation('connection')}\n`;
      diagnostic += `2. If the service is 'down' or 'degraded', check the provider's status page.\n`;
      
      return {
        content: [{ type: 'text' as const, text: diagnostic }]
      };
    }
  );

  server.tool(
    'health_check',
    'Perform a health check on all services in the infrastructure.',
    {},
    async () => {
      const devId = deps.getDevId();
      const services = await deps.graph.getAllServices(devId);
      
      if (services.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No services found to check health.' }]
        };
      }

      let healthy = 0;
      let degraded = 0;
      let down = 0;
      let unknown = 0;
      
      let details = '# Infrastructure Health Check\n\n| Service ID | Provider | Status |\n|---|---|---|\n';

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        let status = 'unknown';
        
        if (partner) {
          const auth = await deps.auth.getLinkedAccount(devId, partner.id);
          status = await partner.checkHealth(auth?.apiKey ?? 'stub');
        }
        
        details += `| ${service.id} | ${service.partner} | ${status} |\n`;
        
        if (status === 'healthy') healthy++;
        else if (status === 'degraded') degraded++;
        else if (status === 'down') down++;
        else unknown++;
      }

      const summary = `\n**Summary:**\n- Healthy: ${healthy}\n- Degraded: ${degraded}\n- Down: ${down}\n- Unknown: ${unknown}\n`;

      return {
        content: [{ type: 'text' as const, text: details + summary }]
      };
    }
  );
}
