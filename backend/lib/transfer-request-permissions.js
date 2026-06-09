/**
 * Transfer request approval rules (shared by inventory-transfers API).
 *
 * Send-out (initiator = source branch): destination branch approves receipt.
 * Request-in (initiator = destination branch): source branch approves release.
 */

function normalizeBranchId(id) {
  if (id == null || id === '') return '';
  if (typeof id === 'object' && id.$oid) return String(id.$oid);
  if (typeof id === 'object' && typeof id.toString === 'function') return id.toString();
  return String(id).trim();
}

function getInitiatorBranchId(transfer) {
  return normalizeBranchId(transfer.initiatedByBranchId || transfer.fromBranchId);
}

function getApproverBranchId(transfer) {
  const initiator = getInitiatorBranchId(transfer);
  const from = normalizeBranchId(transfer.fromBranchId);
  const to = normalizeBranchId(transfer.toBranchId);
  // Sender initiated → receiver approves incoming stock
  if (initiator === from) return to;
  // Requester at destination → source branch approves release
  return from;
}

function branchEq(a, b) {
  return normalizeBranchId(a) === normalizeBranchId(b);
}

function getTransferPermissions(transfer, currentBranchId) {
  const cur = normalizeBranchId(currentBranchId);
  const pending = transfer.status === 'pending';
  const initiator = getInitiatorBranchId(transfer);
  const approver = getApproverBranchId(transfer);

  return {
    initiatorBranchId: initiator,
    approverBranchId: approver,
    canApprove: pending && branchEq(approver, cur),
    canReject: pending && branchEq(approver, cur),
    canCancel: pending && branchEq(initiator, cur),
    isInProcess: pending && branchEq(initiator, cur),
  };
}

function serializeTransferRow(transfer, currentBranchId) {
  const permissions = getTransferPermissions(transfer, currentBranchId);
  return {
    ...transfer,
    _id: String(transfer._id),
    fromBranchId: normalizeBranchId(transfer.fromBranchId),
    toBranchId: normalizeBranchId(transfer.toBranchId),
    initiatedByBranchId: transfer.initiatedByBranchId
      ? normalizeBranchId(transfer.initiatedByBranchId)
      : null,
    permissions,
  };
}

module.exports = {
  normalizeBranchId,
  getInitiatorBranchId,
  getApproverBranchId,
  getTransferPermissions,
  serializeTransferRow,
  branchEq,
};
