import { DeveloperStats, DevPartnerStat, PartnerConfig } from "./types.js";
import { AffiliateEvent } from "./payout-manager.js";

// Basic definition for ServiceNode to satisfy signature
export interface ServiceNode {
  id: string;
  partner: string;
  category: string;
  name: string;
  plan: string;
  monthlySpend: number;
  createdAt: string;
}

export class DeveloperAnalytics {
  public aggregateDevStats(
    devId: string,
    events: AffiliateEvent[],
    services: ServiceNode[],
    partners: PartnerConfig[]
  ): DeveloperStats {
    const devEvents = events.filter((e) => e.devId === devId);
    const devServices = services.filter((s) => s.partner); // Assume services imply partner relation
    
    const partnerMap = new Map<string, DevPartnerStat>();
    
    let totalMonthlySpend = 0;
    let totalCashbackEarned = 0;
    let platformRevenueGenerated = 0;
    
    // Process services for monthly spend and plans
    for (const service of devServices) {
      if (!partnerMap.has(service.partner)) {
        const partnerInfo = partners.find(p => p.id === service.partner);
        partnerMap.set(service.partner, {
          partnerId: service.partner,
          partnerName: partnerInfo ? partnerInfo.name : service.partner,
          plan: service.plan,
          monthlySpend: 0,
          cashbackEarned: 0,
          monthsActive: 0, // Simplified calculation for demo
        });
      }
      
      const pStat = partnerMap.get(service.partner)!;
      pStat.monthlySpend += service.monthlySpend;
      
      // Compute rough months active based on service creation
      const created = new Date(service.createdAt);
      const now = new Date();
      const diffMonths = (now.getFullYear() - created.getFullYear()) * 12 + now.getMonth() - created.getMonth();
      pStat.monthsActive = Math.max(pStat.monthsActive, diffMonths + 1);
    }
    
    for (const event of devEvents) {
      totalCashbackEarned += event.cashbackAmount;
      platformRevenueGenerated += (event.estimatedRevenue - event.cashbackAmount);

      if (!partnerMap.has(event.partner)) {
        const partnerInfo = partners.find(p => p.id === event.partner);
        partnerMap.set(event.partner, {
          partnerId: event.partner,
          partnerName: partnerInfo ? partnerInfo.name : event.partner,
          plan: "unknown",
          monthlySpend: 0,
          cashbackEarned: 0,
          monthsActive: 1,
        });
      }
      partnerMap.get(event.partner)!.cashbackEarned += event.cashbackAmount;
    }
    
    totalMonthlySpend = Array.from(partnerMap.values()).reduce((sum, p) => sum + p.monthlySpend, 0);
    
    // Find earliest event or service
    let joinedAt = new Date().toISOString();
    if (devEvents.length > 0) {
      joinedAt = devEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0].timestamp;
    }
    
    const now = new Date();
    const joinDate = new Date(joinedAt);
    let monthsActive = (now.getFullYear() - joinDate.getFullYear()) * 12 + now.getMonth() - joinDate.getMonth() + 1;
    if (monthsActive <= 0) monthsActive = 1;
    
    const estimatedLTV = (platformRevenueGenerated / monthsActive) * 12;

    return {
      devId,
      joinedAt,
      linkedPartners: partnerMap.size,
      totalMonthlySpend,
      totalCashbackEarned,
      platformRevenueGenerated,
      estimatedLTV,
      partnerBreakdown: Array.from(partnerMap.values()),
    };
  }

  public getTopDevelopers(
    allDevStats: DeveloperStats[],
    limit: number,
    sortBy: "spend" | "revenue" | "cashback"
  ): DeveloperStats[] {
    const sorted = [...allDevStats].sort((a, b) => {
      if (sortBy === "spend") {
        return b.totalMonthlySpend - a.totalMonthlySpend;
      } else if (sortBy === "revenue") {
        return b.platformRevenueGenerated - a.platformRevenueGenerated;
      } else {
        return b.totalCashbackEarned - a.totalCashbackEarned;
      }
    });
    
    return sorted.slice(0, limit);
  }

  public getConversionRate(totalSignups: number, activeDevs: number): number {
    if (totalSignups === 0) return 0;
    return (activeDevs / totalSignups) * 100;
  }

  public getChurnRate(previousActive: number, currentActive: number, newSignups: number): number {
    if (previousActive === 0) return 0;
    const churned = previousActive + newSignups - currentActive;
    return (churned / previousActive) * 100;
  }

  public getARPU(totalRevenue: number, activeDeveloperCount: number): number {
    if (activeDeveloperCount === 0) return 0;
    return totalRevenue / activeDeveloperCount;
  }
}

export const developerAnalytics = new DeveloperAnalytics();
