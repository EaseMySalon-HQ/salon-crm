'use strict';

const {
  canTenantSubmitTemplate,
  isTransactionalLibraryTemplate,
} = require('../../lib/whatsapp-template-submit-eligibility');

describe('whatsapp-template-submit-eligibility', () => {
  test('draft and rejected templates are always submittable', () => {
    expect(canTenantSubmitTemplate({ status: 'draft' })).toBe(true);
    expect(canTenantSubmitTemplate({ status: 'rejected' })).toBe(true);
  });

  test('pending promotional library template cannot be resubmitted', () => {
    expect(
      canTenantSubmitTemplate({
        status: 'pending',
        sourcePlatformTemplateId: 'plat-1',
        category: 'MARKETING',
      })
    ).toBe(false);
  });

  test('pending transactional library template can be resubmitted', () => {
    expect(
      canTenantSubmitTemplate({
        status: 'pending',
        sourcePlatformTemplateId: 'plat-1',
        category: 'UTILITY',
      })
    ).toBe(true);
  });

  test('pending own template cannot be resubmitted', () => {
    expect(canTenantSubmitTemplate({ status: 'pending', category: 'UTILITY' })).toBe(false);
  });

  test('approved templates cannot be submitted', () => {
    expect(
      canTenantSubmitTemplate({
        status: 'approved',
        sourcePlatformTemplateId: 'plat-1',
        category: 'UTILITY',
      })
    ).toBe(false);
  });

  test('isTransactionalLibraryTemplate requires platform import and UTILITY', () => {
    expect(isTransactionalLibraryTemplate({ sourcePlatformTemplateId: 'x', category: 'UTILITY' })).toBe(
      true
    );
    expect(isTransactionalLibraryTemplate({ sourcePlatformTemplateId: 'x', category: 'MARKETING' })).toBe(
      false
    );
    expect(isTransactionalLibraryTemplate({ category: 'UTILITY' })).toBe(false);
  });
});
