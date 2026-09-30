import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as crypto from 'crypto';
import type { ToolDeps } from './provision.js';

export function registerCashbackTools(server: McpServer, deps: ToolDeps): void {
  const getRewardsDashboard = async () => {
    const devId = deps.getDevId();
    const payouts = await deps.payouts.getForDev(devId);
    const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
    const services = await deps.graph.getAllServices(devId);
    
    let breakdown = '';
    for (const service of services) {
      const partner = deps.registry.get(service.partner);
      if (partner) {
        breakdown += `- **${service.id}** (${partner.name}): ~\$${partner.estimateDevCashback(service.monthlySpend).toFixed(2)}/mo (~${Math.round(partner.devCashbackRate * 100)}% ecosystem grant rate)\n`;
      }
    }
    
    if (!breakdown) breakdown = '- No active services generating developer ecosystem grants.\n';

    let payoutLines = '';
    for (const p of payouts) {
      payoutLines += `- ${p.requestedAt.split('T')[0]}: $${p.amount.toFixed(2)} via ${p.method} — **${p.status}**` +
                     (p.rejectionReason ? ` (${p.rejectionReason})` : '') + '\n';
    }

    const md = `# Developer Grants & Rewards Dashboard\n\n` +
               `**Available Balance (Cleared):** $${balance.available.toFixed(2)}\n` +
               `**Pending Cashback (Partner Verification):** $${balance.pendingCashback.toFixed(2)}\n` +
               `**Pending Payouts:** $${balance.pending.toFixed(2)}\n` +
               `**Lifetime Cleared Earnings:** $${balance.lifetimeEarned.toFixed(2)}\n\n` +
               (balance.pendingCashback > 0 ? `> ℹ️ Pending grants clear into Available Balance once provider commissions are confirmed during the monthly settlement cycle.\n\n` : '') +
               `## Active Services\n${breakdown}` +
               (payoutLines ? `\n## Payout Requests\n${payoutLines}\n\n` : '\n') +
               `> ⚖️ **Compliance Disclosure**: Developer Grants & Tooling Rewards are funded independently from Cerell's Developer Ecosystem Fund. They do not constitute rebates, price concessions, or discounts on third-party vendor retail pricing.`;
               
    return {
      content: [{ type: 'text' as const, text: md }]
    };
  };

  server.tool(
    'check_cashback',
    'View the current developer grant balance and available rewards.',
    {},
    getRewardsDashboard
  );

  server.tool(
    'check_rewards',
    'View the current developer ecosystem grant balance, pending partner verifications, and available rewards.',
    {},
    getRewardsDashboard
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
      method: z.enum(['stripe', 'revolut', 'credits', 'paypal', 'bank_transfer', 'crypto']).describe('Payout rail/method (revolut and credits are 100% free)'),
      revtag: z.string().optional().describe('Revolut @revtag handle (required if method is revolut)'),
    },
    async (args) => {
      const devId = deps.getDevId();
      const payouts = await deps.payouts.getForDev(devId);
      const balance = await deps.cashbackEngine.getBalance(devId, deps.tracker, payouts);
      const min = deps.cashbackEngine.minPayout;
      const amount = Math.round(args.amount * 100) / 100;

      let error: string | null = null;
      if (amount <= 0) {
        error = `Payout amount must be greater than zero.`;
      } else if (min > 0 && amount < min) {
        error = `Minimum payout is $${min.toFixed(2)}.`;
      } else if (amount > balance.available + 1e-9) {
        error = `Requested $${amount.toFixed(2)} exceeds cleared available balance of $${balance.available.toFixed(2)}.` +
          (balance.pendingCashback > 0 ? ` (You have $${balance.pendingCashback.toFixed(2)} in pending cashback awaiting partner verification).` : '');
      } else if (args.method === 'revolut' && !args.revtag) {
        error = `Please provide your Revolut handle via the revtag parameter (e.g. '@devname').`;
      }

      if (error) {
        return { content: [{ type: 'text' as const, text: `❌ ${error}` }], isError: true };
      }

      // Calculate estimated fee and net payout for fee awareness
      let estFee = 0;
      let estNet = amount;
      let feeNote = '';

      if (args.method === 'stripe' || args.method === 'bank_transfer') {
        const hasPaidThisMonth = payouts.some(p => {
          if (p.status === 'rejected' || (p.method !== 'stripe' && p.method !== 'bank_transfer')) return false;
          const d = new Date(p.requestedAt);
          return d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
        });
        const activeMonthlyFee = hasPaidThisMonth ? 0 : 2.00;
        estFee = Number((activeMonthlyFee + 0.25 + (amount * 0.0025)).toFixed(2));
        estNet = Number(Math.max(0, amount - estFee).toFixed(2));
        feeNote = `\n\n💳 **Stripe Rail Fee Awareness**:\n` +
          `- Estimated Processing Fee: **$${estFee.toFixed(2)}** (${hasPaidThisMonth ? "$0.25 + 0.25%" : "$2.00 active monthly account fee + $0.25 + 0.25%"})\n` +
          `- Net Estimated Payout: **$${estNet.toFixed(2)}**` +
          (amount <= 15 ? `\n- ⚠️ **Notice**: For smaller withdrawals, fixed Stripe fees absorb a significant percentage. Tip: Use \`method: "revolut"\` or \`"credits"\` for 100% fee-free disbursements.` : '');
      } else if (args.method === 'revolut') {
        feeNote = `\n\n⚡ **Revolut Rail**: 100% Free & Instant to ${args.revtag} (Zero processing fees). Net Payout: **$${amount.toFixed(2)}**.`;
      } else if (args.method === 'credits') {
        feeNote = `\n\n🎟️ **Tooling Credits Rail**: 100% Net Value Tooling & Cloud Vouchers (Zero fees). Net Value: **$${amount.toFixed(2)}**.`;
      }

      const payoutDetails = args.revtag ? { revtag: args.revtag } : undefined;
      const payout = await deps.payouts.request(devId, amount, args.method, payoutDetails, estFee, estNet);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Payout requested: $${payout.amount.toFixed(2)} via ${payout.method} (id: ${payout.id}). ` +
                `Remaining available balance: $${(balance.available - amount).toFixed(2)}.${feeNote}`,
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

  server.tool(
    'get_portal_link',
    'Generate a secure, authenticated one-click link to access the Developer Portal.',
    {},
    async () => {
      const devId = deps.getDevId();
      const secret = process.env.DEV_SESSION_SECRET ||
                     process.env.CERELL_ENCRYPTION_KEY ||
                     process.env.ADMIN_TOKEN ||
                     'cerell_dev_default_session_secret_2026_x87y';
      const timestamp = Date.now().toString();
      const payload = `${devId}.${timestamp}`;
      const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const token = `${payload}.${hmac}`;
      
      const baseUrl = process.env.PORTAL_BASE_URL || 'http://localhost:3000';
      const link = `${baseUrl}/portal?token=${encodeURIComponent(token)}`;

      return {
        content: [{
          type: 'text' as const,
          text: `🔗 **Developer Portal Access Link**\n\n` +
                `Click below to open your developer wallet:\n` +
                `[Open Developer Portal](${link})\n\n` +
                `*This link is authenticated for \`${devId}\` and valid for 1 hour.*`
        }]
      };
    }
  );
}
