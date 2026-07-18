'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isPlatformLeadWelcomeEnabled,
  normalizePlatformLeadPhone,
  resolveLeadFirstName,
} = require('../../lib/send-platform-lead-welcome-whatsapp');
const { buildVariableMappingForSlot } = require('../../lib/platform-template-variable-mapping');
const { PLATFORM_TEMPLATE_CATALOG } = require('../../lib/gupshup-platform-template-catalog');

describe('send-platform-lead-welcome-whatsapp', () => {
  it('normalizes 10-digit Indian phone to 91 prefix', () => {
    assert.equal(normalizePlatformLeadPhone('9876543210'), '919876543210');
    assert.equal(normalizePlatformLeadPhone('09876543210'), '919876543210');
    assert.equal(normalizePlatformLeadPhone('+91 98765 43210'), '919876543210');
  });

  it('uses firstName from lead, falling back to first token of name', () => {
    assert.equal(resolveLeadFirstName({ firstName: 'Priya', name: 'Priya Sharma' }), 'Priya');
    assert.equal(resolveLeadFirstName({ name: 'Rahul Verma' }), 'Rahul');
    assert.equal(resolveLeadFirstName({ name: '' }), 'there');
  });

  it('is enabled when WhatsApp and platform lead welcome toggles are on', () => {
    assert.equal(
      isPlatformLeadWelcomeEnabled({
        notifications: {
          whatsapp: {
            enabled: true,
            platformLeadWelcomeNotifications: { enabled: true },
          },
        },
      }),
      true
    );
    assert.equal(
      isPlatformLeadWelcomeEnabled({
        notifications: {
          whatsapp: {
            enabled: true,
            platformLeadWelcomeNotifications: { enabled: false },
          },
        },
      }),
      false
    );
  });

  it('platform lead welcome catalog entry has single name placeholder', () => {
    const entry = PLATFORM_TEMPLATE_CATALOG.find((e) => e.slotKey === 'platformLeadWelcome');
    assert.ok(entry);
    assert.equal(entry.exampleParams.length, 1);
    assert.match(entry.content, /\{\{1\}\}/);
    assert.doesNotMatch(entry.content, /\{\{2\}\}/);

    const mapping = buildVariableMappingForSlot('platformLeadWelcome', {
      body: { text: entry.content },
    });
    assert.deepEqual(mapping, { body_1: 'firstName' });
  });
});
