'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestAlternateTemplateName,
  clearStaleTenantTemplateIds,
  duplicateSubmitAction,
  findRemoteByNameLang,
} = require('../../lib/gupshup-template-tenant-submit-prep');

describe('gupshup-template-tenant-submit-prep', () => {
  test('suggestAlternateTemplateName appends version suffix', () => {
    assert.equal(suggestAlternateTemplateName('ems_receipt'), 'ems_receipt_v2');
    assert.equal(suggestAlternateTemplateName('ems_receipt_v2'), 'ems_receipt_v3');
  });

  test('duplicateSubmitAction allows fresh submit when remote missing', () => {
    assert.equal(duplicateSubmitAction(null), 'submit');
  });

  test('duplicateSubmitAction requires rename for rejected remote', () => {
    assert.equal(duplicateSubmitAction({ status: 'REJECTED' }), 'needs_rename');
  });

  test('duplicateSubmitAction links pending remote', () => {
    assert.equal(duplicateSubmitAction({ status: 'PENDING' }), 'link_existing');
  });

  test('clearStaleTenantTemplateIds drops platform id when not on tenant WABA', () => {
    const tpl = {
      status: 'pending',
      sourcePlatformTemplateId: 'plat-1',
      gupshupTemplateId: 'platform-tpl-99',
      metaTemplateId: 'platform-tpl-99',
    };
    const changed = clearStaleTenantTemplateIds(tpl, {
      remote: null,
      platformGupshupId: 'platform-tpl-99',
    });
    assert.equal(changed, true);
    assert.equal(tpl.gupshupTemplateId, null);
    assert.equal(tpl.metaTemplateId, null);
  });

  test('findRemoteByNameLang matches element name and language', () => {
    const remote = findRemoteByNameLang(
      [{ elementName: 'ems_receipt', languageCode: 'en_US', status: 'PENDING' }],
      'ems_receipt',
      'en_US'
    );
    assert.equal(remote.elementName, 'ems_receipt');
  });
});
