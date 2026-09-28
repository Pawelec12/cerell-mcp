import {
  CommissionConfig,
  CommissionEvent,
  CommissionResult,
  HybridCommission,
  OneTimeCommission,
  RevenueShareCommission,
  TieredCommission,
  TieredLevel,
} from "./types.js";

export class CommissionEngine {
  public calculate(
    commission: CommissionConfig,
    event: CommissionEvent,
    devShareRate: number
  ): CommissionResult {
    const handlers: Record<
      CommissionConfig["type"],
      (config: any, event: CommissionEvent, devShareRate: number) => CommissionResult
    > = {
      revenue_share: this.calculateRevenueShare.bind(this),
      one_time: this.calculateOneTime.bind(this),
      hybrid: this.calculateHybrid.bind(this),
      tiered: this.calculateTiered.bind(this),
    };

    return handlers[commission.type](commission, event, devShareRate);
  }

  private calculateRevenueShare(
    config: RevenueShareCommission,
    event: CommissionEvent,
    devShareRate: number
  ): CommissionResult {
    if (event.type === "signup") {
      return this.createDisqualifiedResult(devShareRate, "Revenue share does not apply to signups");
    }

    if (config.durationMonths !== null && event.monthsSinceSignup > config.durationMonths) {
      return this.createDisqualifiedResult(devShareRate, "Duration expired");
    }

    if (config.basis === "first_month_only" && !event.isFirstMonth) {
       return this.createDisqualifiedResult(devShareRate, "Only applies to first month");
    }

    const partnerPays = event.monthlySpend * config.rate;
    const devCashback = partnerPays * devShareRate;
    const platformMargin = partnerPays - devCashback;

    return {
      partnerPays,
      devCashback,
      platformMargin,
      devShareRate,
      qualifies: true,
      disqualifyReason: null,
    };
  }

  private calculateOneTime(
    config: OneTimeCommission,
    event: CommissionEvent,
    devShareRate: number
  ): CommissionResult {
    if (event.type !== "signup") {
      return this.createDisqualifiedResult(devShareRate, "One-time bounty only applies to signups");
    }

    if (config.qualifyingMinSpend > 0 && event.monthlySpend < config.qualifyingMinSpend) {
      return this.createDisqualifiedResult(
        devShareRate,
        `Did not meet qualifying min spend of ${config.qualifyingMinSpend}`
      );
    }

    const partnerPays = config.amountPerSignup;
    const devCashback = partnerPays * devShareRate;
    const platformMargin = partnerPays - devCashback;

    return {
      partnerPays,
      devCashback,
      platformMargin,
      devShareRate,
      qualifies: true,
      disqualifyReason: null,
    };
  }

  private calculateHybrid(
    config: HybridCommission,
    event: CommissionEvent,
    devShareRate: number
  ): CommissionResult {
    if (event.type === "signup") {
      const partnerPays = config.signupBonus;
      const devCashback = partnerPays * devShareRate;
      const platformMargin = partnerPays - devCashback;
      return {
        partnerPays,
        devCashback,
        platformMargin,
        devShareRate,
        qualifies: true,
        disqualifyReason: null,
      };
    }

    if (event.type === "monthly_spend") {
       return this.calculateRevenueShare(
         { ...config.revenueShare, type: "revenue_share" } as RevenueShareCommission,
         event,
         devShareRate
       );
    }

    return this.createDisqualifiedResult(devShareRate, "Unknown event type");
  }

  private calculateTiered(
    config: TieredCommission,
    event: CommissionEvent,
    devShareRate: number
  ): CommissionResult {
    if (event.type !== "signup") {
      return this.createDisqualifiedResult(devShareRate, "Tiered commission only applies to signups");
    }

    const tier = this.getApplicableTier(config, event.totalPlatformReferrals);
    if (!tier) {
      return this.createDisqualifiedResult(devShareRate, "No applicable tier found");
    }

    const partnerPays = tier.amountPerReferral;
    const devCashback = partnerPays * devShareRate;
    const platformMargin = partnerPays - devCashback;

    return {
      partnerPays,
      devCashback,
      platformMargin,
      devShareRate,
      qualifies: true,
      disqualifyReason: null,
    };
  }

  public simulate(
    commission: CommissionConfig,
    monthlySpend: number,
    months: number,
    devShareRate: number
  ): {
    totalPartnerPays: number;
    totalDevCashback: number;
    totalPlatformMargin: number;
    monthlyBreakdown: CommissionResult[];
  } {
    const monthlyBreakdown: CommissionResult[] = [];
    let totalPartnerPays = 0;
    let totalDevCashback = 0;
    let totalPlatformMargin = 0;

    for (let i = 1; i <= months; i++) {
      let result: CommissionResult;
      
      if (i === 1) {
        // Signup event
        const signupEvent: CommissionEvent = {
          type: "signup",
          monthlySpend,
          monthsSinceSignup: 1,
          totalPlatformReferrals: 1,
          isFirstMonth: true,
        };
        const signupResult = this.calculate(commission, signupEvent, devShareRate);
        
        // Monthly spend event for month 1
        const spendEvent: CommissionEvent = {
          type: "monthly_spend",
          monthlySpend,
          monthsSinceSignup: 1,
          totalPlatformReferrals: 0,
          isFirstMonth: true,
        };
        const spendResult = this.calculate(commission, spendEvent, devShareRate);
        
        // Combine them if both qualify, else take whichever qualifies, or disqualifies
        result = this.combineResults(signupResult, spendResult, devShareRate);
      } else {
        const spendEvent: CommissionEvent = {
          type: "monthly_spend",
          monthlySpend,
          monthsSinceSignup: i,
          totalPlatformReferrals: 0,
          isFirstMonth: false,
        };
        result = this.calculate(commission, spendEvent, devShareRate);
      }

      monthlyBreakdown.push(result);

      if (result.qualifies) {
        totalPartnerPays += result.partnerPays;
        totalDevCashback += result.devCashback;
        totalPlatformMargin += result.platformMargin;
      }
    }

    return {
      totalPartnerPays,
      totalDevCashback,
      totalPlatformMargin,
      monthlyBreakdown,
    };
  }

  public getApplicableTier(config: TieredCommission, totalReferrals: number): TieredLevel | undefined {
    const sortedTiers = [...config.tiers].sort((a, b) => b.minReferrals - a.minReferrals);
    for (const tier of sortedTiers) {
      if (totalReferrals >= tier.minReferrals) {
        return tier;
      }
    }
    return undefined;
  }

  private createDisqualifiedResult(devShareRate: number, reason: string): CommissionResult {
    return {
      partnerPays: 0,
      devCashback: 0,
      platformMargin: 0,
      devShareRate,
      qualifies: false,
      disqualifyReason: reason,
    };
  }
  
  private combineResults(a: CommissionResult, b: CommissionResult, devShareRate: number): CommissionResult {
     if (!a.qualifies && !b.qualifies) {
         return this.createDisqualifiedResult(devShareRate, "Neither signup nor spend qualified");
     }
     
     return {
        partnerPays: a.partnerPays + b.partnerPays,
        devCashback: a.devCashback + b.devCashback,
        platformMargin: a.platformMargin + b.platformMargin,
        devShareRate,
        qualifies: true,
        disqualifyReason: null
     };
  }
}

export const commissionEngine = new CommissionEngine();
