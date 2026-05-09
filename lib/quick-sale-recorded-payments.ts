/** Split/trim tender lines for Sales API (matches Quick Sale checkout). */

export type RecordedPaymentLine = { type: "cash" | "card" | "online" | "wallet"; amount: number }

export function buildRecordedPaymentsForCheckout(options: {
  cashAmount: number
  cardAmount: number
  onlineAmount: number
  walletPayAmount: number
  saleDueTotal: number
  creditOverpaymentToWallet: boolean
}): {
  payments: RecordedPaymentLine[]
  changeToCredit: number
  recordedPaidTotal: number
} {
  const {
    cashAmount,
    cardAmount,
    onlineAmount,
    walletPayAmount,
    saleDueTotal,
    creditOverpaymentToWallet,
  } = options
  const round2 = (n: number) => Math.round(n * 100) / 100
  const totalPaid = cashAmount + cardAmount + onlineAmount + walletPayAmount
  const change = round2(totalPaid - saleDueTotal)
  const pushPayments = (c: number, ca: number, o: number, w: number) => {
    const out: RecordedPaymentLine[] = []
    if (c > 0.005) out.push({ type: "cash", amount: round2(c) })
    if (ca > 0.005) out.push({ type: "card", amount: round2(ca) })
    if (o > 0.005) out.push({ type: "online", amount: round2(o) })
    if (w > 0.005) out.push({ type: "wallet", amount: round2(w) })
    return out
  }
  if (!creditOverpaymentToWallet || change <= 0.005) {
    const payments = pushPayments(cashAmount, cardAmount, onlineAmount, walletPayAmount)
    return {
      payments,
      changeToCredit: 0,
      recordedPaidTotal: round2(payments.reduce((s, p) => s + p.amount, 0)),
    }
  }
  let excess = change
  let c = cashAmount
  let ca = cardAmount
  let o = onlineAmount
  const w = walletPayAmount
  const take = (amt: number) => {
    const t = Math.min(Math.max(0, amt), excess)
    excess = round2(excess - t)
    return round2(amt - t)
  }
  c = take(c)
  if (excess > 0.005) ca = take(ca)
  if (excess > 0.005) o = take(o)
  const payments = pushPayments(c, ca, o, w)
  const recordedPaidTotal = round2(payments.reduce((s, p) => s + p.amount, 0))
  const changeToCredit = round2(totalPaid - recordedPaidTotal)
  return { payments, changeToCredit, recordedPaidTotal }
}
