/**
 * Cash register: checkout `payments` vs due `paymentHistory` (see backend twin).
 */

type SaleLike = {
  payments?: Array<{ mode?: string; type?: string; amount?: number }>
  paymentHistory?: Array<{ method?: string; amount?: number; date?: string | Date }>
  paymentMode?: string
  paymentStatus?: { paidAmount?: number }
  netTotal?: number
  grossTotal?: number
}

function sumPaymentHistoryByMethod(
  sale: SaleLike,
  { cash = false, cardOnline = false }: { cash?: boolean; cardOnline?: boolean }
): number {
  let total = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    const method = String(ph.method || "").toLowerCase()
    if (cash && method === "cash") total += Number(ph.amount) || 0
    else if (cardOnline && (method === "card" || method === "online")) {
      total += Number(ph.amount) || 0
    }
  }
  return total
}

function sumPaymentsCardOnline(sale: SaleLike): number {
  let total = 0
  for (const p of sale.payments || []) {
    const mode = p.mode || p.type || ""
    if (mode === "Card" || mode === "Online") {
      total += Number(p.amount) || 0
      continue
    }
    const m = String(mode).toLowerCase()
    if (m.includes("card")) total += Number(p.amount) || 0
    else if (m.includes("online") || m.includes("upi")) total += Number(p.amount) || 0
  }
  return total
}

function sumPaymentsCash(sale: SaleLike): number {
  let total = 0
  for (const p of sale.payments || []) {
    const m = String(p.mode || p.type || "").toLowerCase()
    if (m.includes("cash") && !m.includes("card") && !m.includes("online")) {
      total += Number(p.amount) || 0
    }
  }
  return total
}

export function checkoutCardOnlineAmount(sale: SaleLike): number {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCardOnline(sale)
    const historyDup = sumPaymentHistoryByMethod(sale, { cardOnline: true })
    return Math.max(0, fromPayments - historyDup)
  }

  const pm = sale.paymentMode || ""
  if (pm === "Card" || pm === "Online") {
    const paid =
      typeof sale.paymentStatus?.paidAmount === "number"
        ? Math.max(0, sale.paymentStatus.paidAmount)
        : Number(sale.grossTotal || 0) || 0
    const historyDup = sumPaymentHistoryByMethod(sale, { cardOnline: true })
    return Math.max(0, paid - historyDup)
  }
  return 0
}

export function checkoutCashAmount(sale: SaleLike): number {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCash(sale)
    const historyDup = sumPaymentHistoryByMethod(sale, { cash: true })
    return Math.max(0, fromPayments - historyDup)
  }

  const pm = String(sale.paymentMode || "").toLowerCase()
  if (pm.includes("cash") && !pm.includes("card") && !pm.includes("online")) {
    const paid =
      typeof sale.paymentStatus?.paidAmount === "number"
        ? Math.max(0, sale.paymentStatus.paidAmount)
        : Number(sale.grossTotal || 0) || 0
    const historyDup = sumPaymentHistoryByMethod(sale, { cash: true })
    return Math.max(0, paid - historyDup)
  }
  return 0
}

export function paymentHistoryCardOnlineOnDay(
  sale: SaleLike,
  dayString: string,
  toDateStringIST: (d: Date | string) => string
): number {
  let total = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    const method = String(ph.method || "").toLowerCase()
    if (method !== "card" && method !== "online") continue
    const phDay = ph.date ? toDateStringIST(ph.date) : ""
    if (phDay === dayString) total += Number(ph.amount) || 0
  }
  return total
}

export function paymentHistoryCardOnlineInRange(
  sale: SaleLike,
  fromDay: string,
  toDay: string,
  toDateStringIST: (d: Date | string) => string
): number {
  let total = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    const method = String(ph.method || "").toLowerCase()
    if (method !== "card" && method !== "online") continue
    const phDay = ph.date ? toDateStringIST(ph.date) : ""
    if (phDay && phDay >= fromDay && phDay <= toDay) total += Number(ph.amount) || 0
  }
  return total
}

export function paymentHistoryCashInRange(
  sale: SaleLike,
  fromDay: string,
  toDay: string,
  toDateStringIST: (d: Date | string) => string
): number {
  let total = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    if (String(ph.method || "").toLowerCase() !== "cash") continue
    const phDay = ph.date ? toDateStringIST(ph.date) : ""
    if (phDay && phDay >= fromDay && phDay <= toDay) total += Number(ph.amount) || 0
  }
  return total
}

function sumPaymentsCardOnlineBreakdown(sale: SaleLike) {
  let card = 0
  let online = 0
  for (const p of sale.payments || []) {
    const mode = p.mode || p.type || ""
    const amt = Number(p.amount) || 0
    if (mode === "Card") card += amt
    else if (mode === "Online") online += amt
    else {
      const m = String(mode).toLowerCase()
      if (m.includes("card")) card += amt
      else if (m.includes("online") || m.includes("upi")) online += amt
    }
  }
  return { card, online }
}

function sumPaymentHistoryCardOnlineBreakdown(sale: SaleLike) {
  let card = 0
  let online = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    const method = String(ph.method || "").toLowerCase()
    const amt = Number(ph.amount) || 0
    if (method === "card") card += amt
    else if (method === "online") online += amt
  }
  return { card, online }
}

export function checkoutCardOnlineBreakdown(sale: SaleLike) {
  if (sale.payments && sale.payments.length > 0) {
    const fromPayments = sumPaymentsCardOnlineBreakdown(sale)
    const historyDup = sumPaymentHistoryCardOnlineBreakdown(sale)
    return {
      card: Math.max(0, fromPayments.card - historyDup.card),
      online: Math.max(0, fromPayments.online - historyDup.online),
    }
  }
  const pm = String(sale.paymentMode || "").toLowerCase()
  const paid =
    typeof sale.paymentStatus?.paidAmount === "number"
      ? Math.max(0, sale.paymentStatus.paidAmount)
      : Number(sale.grossTotal || 0) || 0
  const historyDup = sumPaymentHistoryCardOnlineBreakdown(sale)
  if (pm.includes("card")) {
    return { card: Math.max(0, paid - historyDup.card - historyDup.online), online: 0 }
  }
  if (pm.includes("online") || pm.includes("upi")) {
    return { card: 0, online: Math.max(0, paid - historyDup.online - historyDup.card) }
  }
  return { card: 0, online: 0 }
}

export function paymentHistoryCardOnlineBreakdownInRange(
  sale: SaleLike,
  fromDay: string,
  toDay: string,
  toDateStringIST: (d: Date | string) => string
) {
  let card = 0
  let online = 0
  for (const ph of sale.paymentHistory || []) {
    if (!ph) continue
    const method = String(ph.method || "").toLowerCase()
    const phDay = ph.date ? toDateStringIST(ph.date) : ""
    if (!phDay || phDay < fromDay || phDay > toDay) continue
    const amt = Number(ph.amount) || 0
    if (method === "card") card += amt
    else if (method === "online") online += amt
  }
  return { card, online }
}
