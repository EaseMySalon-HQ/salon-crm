const PETTY_CASH_MOVEMENT_TYPE = 'petty_cash_transfer';

/**
 * Keep PettyCashTransaction in sync when cash leaves the drawer to the petty cash wallet.
 * Balance on Expenses = sum(PettyCashTransaction adds) − petty-cash-wallet expenses.
 */
async function syncPettyCashForCashMovement(models, movement, userId) {
  const { PettyCashTransaction } = models;
  if (!PettyCashTransaction || !movement) return movement;

  const shouldCreditPetty =
    movement.type === PETTY_CASH_MOVEMENT_TYPE &&
    movement.status === 'active' &&
    movement.direction === 'out';

  if (!shouldCreditPetty) {
    if (movement.pettyCashTransactionId) {
      await PettyCashTransaction.findByIdAndDelete(movement.pettyCashTransactionId);
      movement.pettyCashTransactionId = undefined;
      await movement.save();
    }
    return movement;
  }

  if (movement.pettyCashTransactionId) {
    const updated = await PettyCashTransaction.findOneAndUpdate(
      { _id: movement.pettyCashTransactionId, branchId: movement.branchId },
      { $set: { amount: movement.amount, date: movement.date } },
      { new: true }
    );
    if (updated) return movement;
    movement.pettyCashTransactionId = undefined;
  }

  const tx = await PettyCashTransaction.create({
    type: 'add',
    amount: movement.amount,
    date: movement.date,
    createdBy: userId,
    branchId: movement.branchId,
    cashMovementId: movement._id,
  });
  movement.pettyCashTransactionId = tx._id;
  await movement.save();
  return movement;
}

/** Active drawer→petty movements that never got a wallet credit (e.g. before this link existed). */
async function backfillOrphanPettyCashTransfers(models, branchId, userId) {
  const { CashMovement } = models;
  if (!CashMovement) return 0;
  const orphans = await CashMovement.find({
    branchId,
    type: PETTY_CASH_MOVEMENT_TYPE,
    status: 'active',
    direction: 'out',
    $or: [{ pettyCashTransactionId: null }, { pettyCashTransactionId: { $exists: false } }],
  });
  for (const m of orphans) {
    await syncPettyCashForCashMovement(models, m, userId);
  }
  return orphans.length;
}

module.exports = {
  PETTY_CASH_MOVEMENT_TYPE,
  syncPettyCashForCashMovement,
  backfillOrphanPettyCashTransfers,
};
