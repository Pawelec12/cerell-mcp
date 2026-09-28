import { test } from "node:test";
import assert from "node:assert/strict";
import { commissionEngine } from "./commission-engine.js";
import type { CommissionConfig, CommissionEvent } from "./types.js";

const cents = (n: number) => Math.round(n * 100) / 100;

const spend = (monthlySpend: number, monthsSinceSignup = 1): CommissionEvent => ({
  type: "monthly_spend",
  monthlySpend,
  monthsSinceSignup,
  totalPlatformReferrals: 1,
  isFirstMonth: monthsSinceSignup === 1,
});

const signup = (monthlySpend: number, totalPlatformReferrals = 1): CommissionEvent => ({
  type: "signup",
  monthlySpend,
  monthsSinceSignup: 1,
  totalPlatformReferrals,
  isFirstMonth: true,
});

const revShare: CommissionConfig = {
  type: "revenue_share", rate: 0.2, basis: "monthly_spend", durationMonths: 12, minPayout: 50,
};

test("revenue_share: splits monthly commission between dev and platform", () => {
  const r = commissionEngine.calculate(revShare, spend(100), 0.6);
  assert.equal(r.qualifies, true);
  assert.equal(cents(r.partnerPays), 20);
  assert.equal(cents(r.devCashback), 12);
  assert.equal(cents(r.platformMargin), 8);
});

test("revenue_share: stops after durationMonths, ignores signups, honours first_month_only", () => {
  assert.equal(commissionEngine.calculate(revShare, spend(100, 13), 0.6).qualifies, false);
  assert.equal(commissionEngine.calculate(revShare, signup(100), 0.6).qualifies, false);
  const firstOnly: CommissionConfig = { ...revShare, basis: "first_month_only" };
  assert.equal(commissionEngine.calculate(firstOnly, spend(100, 1), 0.6).qualifies, true);
  assert.equal(commissionEngine.calculate(firstOnly, spend(100, 2), 0.6).qualifies, false);
  const lifetime: CommissionConfig = { ...revShare, durationMonths: null };
  assert.equal(commissionEngine.calculate(lifetime, spend(100, 240), 0.6).qualifies, true);
});

test("one_time: pays bounty on signup only when qualifying spend is met", () => {
  const bounty: CommissionConfig = {
    type: "one_time", amountPerSignup: 20, qualifyingMinSpend: 10, conditionDescription: "", minPayout: 0,
  };
  const ok = commissionEngine.calculate(bounty, signup(10), 0.5);
  assert.equal(ok.partnerPays, 20);
  assert.equal(ok.devCashback, 10);
  assert.equal(commissionEngine.calculate(bounty, signup(9.99), 0.5).qualifies, false);
  assert.equal(commissionEngine.calculate(bounty, spend(100), 0.5).qualifies, false);
});

test("hybrid: signup bonus on signup, revenue share on monthly spend", () => {
  const hybrid: CommissionConfig = {
    type: "hybrid",
    signupBonus: 10,
    revenueShare: { rate: 0.15, basis: "monthly_spend", durationMonths: 12, minPayout: 0 },
    minPayout: 0,
  };
  assert.equal(commissionEngine.calculate(hybrid, signup(0), 0.6).partnerPays, 10);
  assert.equal(cents(commissionEngine.calculate(hybrid, spend(100), 0.6).partnerPays), 15);
  assert.equal(commissionEngine.calculate(hybrid, spend(100, 13), 0.6).qualifies, false);
});

test("tiered: rate grows with platform referral count", () => {
  const tiered: CommissionConfig = {
    type: "tiered",
    tiers: [
      { minReferrals: 1, amountPerReferral: 20 },
      { minReferrals: 11, amountPerReferral: 30 },
      { minReferrals: 51, amountPerReferral: 50 },
    ],
    minPayout: 0,
  };
  assert.equal(commissionEngine.calculate(tiered, signup(0, 1), 0.6).partnerPays, 20);
  assert.equal(commissionEngine.calculate(tiered, signup(0, 10), 0.6).partnerPays, 20);
  assert.equal(commissionEngine.calculate(tiered, signup(0, 11), 0.6).partnerPays, 30);
  assert.equal(commissionEngine.calculate(tiered, signup(0, 500), 0.6).partnerPays, 50);
  assert.equal(commissionEngine.calculate(tiered, signup(0, 0), 0.6).qualifies, false);

  // simulate() models a single new referral, which is referral #1
  const sim = commissionEngine.simulate(tiered, 50, 3, 0.6);
  assert.equal(sim.totalPartnerPays, 20);
});

test("simulate: Neon $69/mo x 12 months at 20% with 60% dev share", () => {
  const sim = commissionEngine.simulate(revShare, 69, 12, 0.6);
  assert.equal(cents(sim.totalPartnerPays), 165.6);
  assert.equal(cents(sim.totalDevCashback), 99.36);
  assert.equal(cents(sim.totalPlatformMargin), 66.24);
  assert.equal(sim.monthlyBreakdown.length, 12);
});

test("simulate: revenue share stops paying after the duration", () => {
  const sim = commissionEngine.simulate(revShare, 100, 24, 0.5);
  assert.equal(cents(sim.totalPartnerPays), 240);
  assert.equal(sim.monthlyBreakdown.filter((m) => m.qualifies).length, 12);
});
