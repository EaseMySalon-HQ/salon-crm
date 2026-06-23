'use strict';

const mongoose = require('mongoose');
const { applyInitialBusinessPlan } = require('../../lib/apply-initial-business-plan');

test('applyInitialBusinessPlan sets pro monthly with renewal date', () => {
  const business = {};
  const result = applyInitialBusinessPlan(business, {
    planId: 'pro',
    billingPeriod: 'monthly',
  });

  expect(result.planId).toBe('pro');
  expect(result.billingPeriod).toBe('monthly');
  expect(business.plan.planId).toBe('pro');
  expect(business.plan.billingPeriod).toBe('monthly');
  expect(business.plan.renewalDate).toBeInstanceOf(Date);
  expect(business.plan.isTrial).toBe(false);
});

test('buildLeadTrialPlanPayload sets 7-day pro trial', () => {
  const { buildLeadTrialPlanPayload, LEAD_TRIAL_DAYS } = require('../../lib/apply-initial-business-plan');
  const payload = buildLeadTrialPlanPayload('pro');
  expect(payload.planId).toBe('pro');
  expect(payload.isTrial).toBe(true);
  expect(payload.trialEndsAt).toBeInstanceOf(Date);
  const daysDiff = Math.round(
    (payload.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  expect(daysDiff).toBe(LEAD_TRIAL_DAYS);
});

test('applyLeadTrialPlan sets pro trial without renewal date', () => {
  const { applyLeadTrialPlan } = require('../../lib/apply-initial-business-plan');
  const business = {};
  applyLeadTrialPlan(business, 'pro');
  expect(business.plan.planId).toBe('pro');
  expect(business.plan.isTrial).toBe(true);
  expect(business.plan.trialEndsAt).toBeInstanceOf(Date);
  expect(business.plan.renewalDate).toBeNull();
});

test('applyInitialBusinessPlan rejects invalid plan id', () => {
  expect(() => applyInitialBusinessPlan({}, { planId: 'invalid-plan' })).toThrow(/Invalid plan/i);
});
