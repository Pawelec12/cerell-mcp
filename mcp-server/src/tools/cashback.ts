import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './provision.js';

export function registerCashbackTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    'check_cashback',
    'View the current cashback balance and available rewards.',
    {},
    async () => {
      const devId = deps.getDevId();
      const payouts = await deps.payouts.getForDev(devId);
      const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
      const services = await deps.graph.getAllServices(devId);
      
      let breakdown = '';
      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        if (partner) {
          breakdown += `- **${service.id}** (${partner.name}): ~\$${partner.estimateDevCashback(service.monthlySpend).toFixed(2)}/mo (~${Math.round(partner.devCashbackRate * 100)}% of your spend)\n`;
        }
      }
      
      if (!breakdown) breakdown = '- No active services generating cashback.\n';

      let payoutLines = '';
      for (const p of payouts) {
        payoutLines += `- ${p.requestedAt.split('T')[0]}: $${p.amount.toFixed(2)} via ${p.method} — **${p.status}**` +
                       (p.rejectionReason ? ` (${p.rejectionReason})` : '') + '\n';
      }

      const md = `# Cashback Dashboard\n\n` +
                 `**Available Balance:** $${balance.available.toFixed(2)}\n` +
                 `**Pending Payouts:** $${balance.pending.toFixed(2)}\n` +
                 `**Lifetime Earnings:** $${balance.lifetimeEarned.toFixed(2)}\n\n` +
                 `## Active Services\n${breakdown}` +
                 (payoutLines ? `\n## Payout Requests\n${payoutLines}` : '');
                 
      return {
        content: [{ type: 'text' as const, text: md }]
      };
    }
  );

  server.tool(
    'spend_summary',
    'View a summary of infrastructure spending grouped by partner, and estimated cashback.',
    {
      period: z.string().optional().default('current_month').describe('The billing period to view')
    },
    async (args) => {
      const devId = deps.getDevId();
      const services = await deps.graph.getAllServices(devId);
      
      if (services.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No active services found.' }]
        };
      }

      const partnerStats: Record<string, { name: string; spend: number; cashback: number }> = {};

      for (const service of services) {
        const partner = deps.registry.get(service.partner);
        if (partner) {
          if (!partnerStats[partner.id]) {
            partnerStats[partner.id] = { name: partner.name, spend: 0, cashback: 0 };
          }
          
          const spend = service.monthlySpend;
          partnerStats[partner.id].spend += spend;
          partnerStats[partner.id].cashback += partner.estimateDevCashback(spend);
        }
      }

      let md = `# Spend & Cashback Summary (${args.period})\n\n`;
      md += `| Partner | Your Spend | Your Cashback |\n`;
      md += `|---|---|---|\n`;
      
      let tSpend = 0, tCashback = 0;
      for (const id in partnerStats) {
        const st = partnerStats[id];
        md += `| ${st.name} | $${st.spend.toFixed(2)} | $${st.cashback.toFixed(2)} |\n`;
        tSpend += st.spend;
        tCashback += st.cashback;
      }
      
      md += `| **TOTAL** | **$${tSpend.toFixed(2)}** | **$${tCashback.toFixed(2)}** |\n`;

      return {
        content: [{ type: 'text' as const, text: md }]
      };
    }
  );

  server.tool(
    'request_payout',
    'Request a payout of available cashback balance. The platform admin reviews and pays it out.',
    {
      amount: z.number().positive().describe('Amount in USD to withdraw (must not exceed available balance)'),
      method: z.enum(['paypal', 'bank_transfer', 'crypto', 'credits']).describe('Payout method'),
    },
    async (args) => {
      const devId = deps.getDevId();
      const payouts = await deps.payouts.getForDev(devId);
      const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
      const min = deps.cashbackEngine.minPayout;
      const amount = Math.round(args.amount * 100) / 100;

      let error: string | null = null;
      if (amount < min) error = `Minimum payout is $${min.toFixed(2)}.`;
      else if (amount > balance.available + 1e-9) error = `Requested $${amount.toFixed(2)} exceeds available balance of $${balance.available.toFixed(2)}.`;

      if (error) {
        return { content: [{ type: 'text' as const, text: `❌ ${error}` }], isError: true };
      }

      const payout = await deps.payouts.request(devId, amount, args.method);
      return {
        content: [{
          type: 'text' as const,
          text: `✅ Payout requested: $${payout.amount.toFixed(2)} via ${payout.method} (id: ${payout.id}). ` +
                `Remaining available balance: $${(balance.available - amount).toFixed(2)}.`,
        }],
      };
    }
  );

  server.tool(
    'cashback_history',
    'View the history of cashback events and payouts.',
    {
      limit: z.number().optional().default(20).describe('Maximum number of events to show')
    },
    async (args) => {
      const devId = deps.getDevId();
      const events = await deps.tracker.getEventsForDev(devId);
      
      // Sort desc by timestamp
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const limited = events.slice(0, args.limit);
      
      if (limited.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No cashback events found.' }]
        };
      }

      let md = `# Cashback History\n\n`;
      md += `| Date | Type | Partner | Amount | Action |\n`;
      md += `|---|---|---|---|---|\n`;
      
      for (const ev of limited) {
        const dateStr = new Date(ev.timestamp).toISOString().split('T')[0];
        md += `| ${dateStr} | ${ev.type} | ${ev.partner} | \$${ev.cashbackAmount.toFixed(2)} | ${ev.action} |\n`;
      }

      return {
        content: [{ type: 'text' as const, text: md }]
      };
    }
  );
}
