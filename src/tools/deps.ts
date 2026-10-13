import type { PartnerRegistry } from '../partners/base.js';
import type { InfraStateGraph } from '../graph.js';
import type { AffiliateTracker, CashbackEngine } from '../affiliate.js';
import type { AuthManager } from '../auth.js';
import type { DevPayoutStore } from '../payouts.js';

export interface ToolDeps {
  getDevId: () => string;
  graph: InfraStateGraph;
  registry: PartnerRegistry;
  tracker: AffiliateTracker;
  cashbackEngine: CashbackEngine;
  auth: AuthManager;
  payouts: DevPayoutStore;
}
