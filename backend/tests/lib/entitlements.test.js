const test = require('node:test');
const assert = require('node:assert/strict');

const { getEffectiveFeatures, hasFeature } = require('../../lib/entitlements');

function makeBusiness(overrides = {}) {
  return {
    plan: {
      planId: 'pro',
      overrides: {},
      ...overrides.plan,
    },
  };
}

test('getEffectiveFeatures returns plan defaults when no overrides', () => {
  const business = makeBusiness();
  const features = getEffectiveFeatures(business);
  assert.ok(features.includes('whatsapp_integration'));
  assert.ok(features.includes('multi_location'));
});

test('getEffectiveFeatures adds promotional grants', () => {
  const business = makeBusiness({
    plan: {
      planId: 'starter',
      overrides: {
        features: ['reward_points'],
      },
    },
  });
  const features = getEffectiveFeatures(business);
  assert.ok(!features.includes('whatsapp_integration'));
  assert.ok(features.includes('reward_points'));
});

test('getEffectiveFeatures removes admin-disabled plan features', () => {
  const business = makeBusiness({
    plan: {
      planId: 'pro',
      overrides: {
        disabledFeatures: ['whatsapp_integration', 'multi_location'],
      },
    },
  });
  const features = getEffectiveFeatures(business);
  assert.ok(!features.includes('whatsapp_integration'));
  assert.ok(!features.includes('multi_location'));
  assert.ok(features.includes('analytics'));
});

test('getEffectiveFeatures ignores expired promotional grants but keeps disabled features', () => {
  const business = makeBusiness({
    plan: {
      planId: 'starter',
      overrides: {
        features: ['reward_points'],
        disabledFeatures: ['crm'],
        expiresAt: new Date('2020-01-01'),
      },
    },
  });
  const features = getEffectiveFeatures(business);
  assert.ok(!features.includes('reward_points'));
  assert.ok(!features.includes('crm'));
  assert.ok(features.includes('appointments'));
});

test('hasFeature respects disabled overrides', () => {
  const business = makeBusiness({
    plan: {
      planId: 'pro',
      overrides: {
        disabledFeatures: ['whatsapp_integration'],
      },
    },
  });
  assert.equal(hasFeature(business, 'whatsapp_integration'), false);
  assert.equal(hasFeature(business, 'analytics'), true);
});
