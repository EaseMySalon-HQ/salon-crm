export type ClientWalletLedgerStatus = "Credit" | "Debit"

export type ClientWalletLedgerRow = {
  _id: string
  createdAt: string
  billNo: string | null
  amount: number
  statusLabel: ClientWalletLedgerStatus
  walletPlan: string
  description: string
}

/**
 * Ledger shows only Credit or Debit (no "Adjustment").
 * Backend may store type `adjustment` for manual balance changes — infer from description
 * (`Manual credit` / `Manual debit`) when present.
 */
export function clientWalletTxnToDebitCredit(tx: {
  type?: string
  description?: string
}): ClientWalletLedgerStatus {
  const t = String(tx.type || "").toLowerCase()
  if (t === "debit") return "Debit"
  if (t === "credit" || t === "refund_credit") return "Credit"
  if (t === "adjustment") {
    const desc = String(tx.description || "").toLowerCase()
    if (desc.includes("debit")) return "Debit"
    if (desc.includes("credit")) return "Credit"
  }
  return "Debit"
}

/**
 * UI label: only "Credit" or "Debit" (never "adjustment" or other API enums).
 * Use for table badges so legacy rows or raw types never show as "Adjustment".
 */
export function walletActivityStatusDisplay(raw: unknown): ClientWalletLedgerStatus {
  const s = String(raw ?? "").trim().toLowerCase()
  if (s === "credit" || s === "refund_credit") return "Credit"
  return "Debit"
}

export function saleRefToBillNo(saleId: unknown): string | null {
  if (!saleId) return null
  if (typeof saleId === "object" && saleId !== null && "billNo" in saleId) {
    const bn = (saleId as { billNo?: string }).billNo
    return bn != null && String(bn) !== "" ? String(bn) : null
  }
  return null
}

export function flattenClientWalletLedger(
  wallets: any[] | undefined,
  transactionsByWallet: Record<string, any[]> | undefined
): ClientWalletLedgerRow[] {
  const by = transactionsByWallet || {}
  const rows: ClientWalletLedgerRow[] = []
  for (const w of wallets || []) {
    const wid = String(w._id)
    const ps = w.planSnapshot
    const plan =
      ps?.openedFromBillChangeCredit === true || ps?.billChangeCashCreditNonExpiring === true
        ? "Bill change credit"
        : ps?.planName || "Wallet"
    for (const tx of by[wid] || []) {
      rows.push({
        _id: String(tx._id),
        createdAt: tx.createdAt || new Date().toISOString(),
        billNo: saleRefToBillNo(tx.saleId),
        amount: Number(tx.amount) || 0,
        statusLabel: clientWalletTxnToDebitCredit(tx),
        walletPlan: plan,
        description: String(tx.description || "").trim(),
      })
    }
  }
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return rows
}
