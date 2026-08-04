'use strict';

const {
  canDeleteTenantTemplateWithoutForce,
  isReplaceableTenantTemplateStatus,
} = require('../../lib/whatsapp-template-library-lifecycle');

describe('whatsapp-template-library-lifecycle', () => {
  test('pending and rejected are replaceable', () => {
    expect(isReplaceableTenantTemplateStatus('pending')).toBe(true);
    expect(isReplaceableTenantTemplateStatus('rejected')).toBe(true);
    expect(isReplaceableTenantTemplateStatus('approved')).toBe(false);
  });

  test('local delete without force for draft, pending, rejected', () => {
    expect(canDeleteTenantTemplateWithoutForce({ status: 'draft' })).toBe(true);
    expect(canDeleteTenantTemplateWithoutForce({ status: 'pending' })).toBe(true);
    expect(canDeleteTenantTemplateWithoutForce({ status: 'rejected' })).toBe(true);
    expect(canDeleteTenantTemplateWithoutForce({ status: 'approved' })).toBe(false);
  });
});
