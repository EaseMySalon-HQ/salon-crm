'use strict';

const { normalizeGupshupTemplateRecord } = require('../../lib/gupshup-template-apply-fields');

function mapGupshupStatus(remoteStatus) {
  const s = String(remoteStatus || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
      return 'approved';
    case 'REJECTED':
      return 'rejected';
    case 'PENDING':
    case 'SUBMITTED':
      return 'pending';
    default:
      return null;
  }
}

function statusAfterGupshupApply(submissionData) {
  const normalized = normalizeGupshupTemplateRecord(submissionData);
  const mapped = mapGupshupStatus(normalized.status);
  if (mapped === 'approved') return 'approved';
  if (mapped === 'rejected') return 'rejected';
  if (mapped === 'pending') return 'pending';
  if (normalized.id) return 'pending';
  return 'draft';
}

describe('whatsapp template submit status', () => {
  test('does not treat Gupshup envelope success as template pending', () => {
    expect(statusAfterGupshupApply({ status: 'success' })).toBe('draft');
  });

  test('pending when Gupshup returns success envelope with template id only', () => {
    expect(statusAfterGupshupApply({ status: 'success', template: { id: '123' } })).toBe('pending');
  });

  test('maps immediate approval', () => {
    expect(statusAfterGupshupApply({ status: 'APPROVED' })).toBe('approved');
  });

  test('maps immediate rejection', () => {
    expect(statusAfterGupshupApply({ template: { status: 'REJECTED' } })).toBe('rejected');
  });
});
