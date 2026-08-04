'use strict';

const {
  suggestAlternateTemplateName,
  clearStaleTenantTemplateIds,
  duplicateSubmitAction,
  canReclaimRemoteName,
  duplicateBlockReason,
  remoteApprovalStatus,
  findRemoteByNameLang,
} = require('../../lib/gupshup-template-tenant-submit-prep');

describe('gupshup-template-tenant-submit-prep', () => {
  test('suggestAlternateTemplateName appends version suffix', () => {
    expect(suggestAlternateTemplateName('ems_receipt')).toBe('ems_receipt_v2');
    expect(suggestAlternateTemplateName('ems_receipt_v2')).toBe('ems_receipt_v3');
  });

  test('duplicateSubmitAction allows fresh submit when remote missing', () => {
    expect(duplicateSubmitAction(null)).toBe('submit');
  });

  test('duplicateSubmitAction reclaims the name from a rejected remote', () => {
    expect(duplicateSubmitAction({ status: 'REJECTED' })).toBe('reclaim_name');
  });

  test('duplicateSubmitAction links remotes that are live on Meta', () => {
    expect(duplicateSubmitAction({ status: 'PENDING' })).toBe('link_existing');
    expect(duplicateSubmitAction({ status: 'APPROVED' })).toBe('link_existing');
    expect(duplicateSubmitAction({ status: 'PAUSED' })).toBe('link_existing');
  });

  test('duplicateSubmitAction reclaims names from remotes Meta never accepted', () => {
    // Gupshup keeps FAILED/DELETED rows and they hold the elementName, but they
    // never appear in WhatsApp Manager — linking would strand the row as a draft.
    expect(duplicateSubmitAction({ status: 'FAILED' })).toBe('reclaim_name');
    expect(duplicateSubmitAction({ status: 'DELETED' })).toBe('reclaim_name');
    expect(duplicateSubmitAction({ status: 'DISABLED' })).toBe('reclaim_name');
  });

  test('duplicateSubmitAction never links an unmappable remote status', () => {
    expect(duplicateSubmitAction({ status: 'SOMETHING_NEW' })).toBe('reclaim_name');
    expect(duplicateSubmitAction({})).toBe('reclaim_name');
    expect(remoteApprovalStatus({ status: 'SOMETHING_NEW' })).toBe(null);
  });

  test('canReclaimRemoteName refuses to delete templates that are live on Meta', () => {
    expect(canReclaimRemoteName({ status: 'APPROVED' })).toBe(false);
    expect(canReclaimRemoteName({ status: 'PENDING' })).toBe(false);
    expect(canReclaimRemoteName({ status: 'PAUSED' })).toBe(false);
    expect(canReclaimRemoteName({ status: 'IN_APPEAL' })).toBe(false);
    expect(canReclaimRemoteName(null)).toBe(false);
  });

  test('canReclaimRemoteName allows freeing names Meta never accepted', () => {
    expect(canReclaimRemoteName({ status: 'FAILED' })).toBe(true);
    expect(canReclaimRemoteName({ status: 'REJECTED' })).toBe(true);
    expect(canReclaimRemoteName({ status: 'SOMETHING_NEW' })).toBe(true);
  });

  test('duplicateBlockReason explains a name held by a failed attempt', () => {
    expect(duplicateBlockReason({ status: 'FAILED' })).toMatch(/never accepted/i);
    expect(duplicateBlockReason({ status: 'REJECTED' })).toMatch(/rejected/i);
    expect(duplicateBlockReason({ status: 'APPROVED' })).toMatch(/already registered/i);
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
    expect(changed).toBe(true);
    expect(tpl.gupshupTemplateId).toBe(null);
    expect(tpl.metaTemplateId).toBe(null);
  });

  test('findRemoteByNameLang matches element name and language', () => {
    const remote = findRemoteByNameLang(
      [{ elementName: 'ems_receipt', languageCode: 'en_US', status: 'PENDING' }],
      'ems_receipt',
      'en_US'
    );
    expect(remote.elementName).toBe('ems_receipt');
  });
});
