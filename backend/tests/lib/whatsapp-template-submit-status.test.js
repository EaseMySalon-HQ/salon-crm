'use strict';

function mapGupshupStatusLocal(remoteStatus) {
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
  const mapped = mapGupshupStatusLocal(
    submissionData?.status ||
      submissionData?.template?.status ||
      submissionData?.template?.state ||
      submissionData?.state
  );
  if (mapped === 'approved') return 'approved';
  if (mapped === 'rejected') return 'rejected';
  return 'pending';
}

describe('whatsapp template submit status', () => {
  test('defaults to pending when Gupshup returns no status', () => {
    expect(statusAfterGupshupApply({ id: '123' })).toBe('pending');
  });

  test('maps immediate approval', () => {
    expect(statusAfterGupshupApply({ status: 'APPROVED' })).toBe('approved');
  });

  test('maps immediate rejection', () => {
    expect(statusAfterGupshupApply({ template: { status: 'REJECTED' } })).toBe('rejected');
  });
});
