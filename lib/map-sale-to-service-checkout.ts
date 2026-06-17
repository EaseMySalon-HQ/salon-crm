import type {
  CheckoutCartDiscountMode,
  CheckoutTipLine,
  ServiceCheckoutLine,
  ServiceCheckoutMembershipLine,
  ServiceCheckoutPackageLine,
  ServiceCheckoutPrepaidLine,
  ServiceCheckoutProductLine,
} from "@/components/appointments/service-checkout-dialog"

export type BillEditCheckoutInitialState = {
  lines: ServiceCheckoutLine[]
  productLines: ServiceCheckoutProductLine[]
  membershipLines: ServiceCheckoutMembershipLine[]
  prepaidLines: ServiceCheckoutPrepaidLine[]
  packageLines: ServiceCheckoutPackageLine[]
  checkoutTipLines: CheckoutTipLine[]
  checkoutCartDiscountType: CheckoutCartDiscountMode
  checkoutCartDiscountValue: number
  checkoutSaleNote: string
  initialTender: {
    cash: number
    card: number
    online: number
    wallet: number
    loyaltyPoints: number
    walletId?: string
  }
  /** Amount already collected on this bill (from paymentStatus or payment lines). */
  recordedPaidAmount: number
  appointmentDate: Date
  appointmentTime: string
  notes: string
}

function normalizeId(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id ?? "")
  }
  return String(value)
}

function parseMembershipDuration(name: string): number {
  const match = name.match(/\((\d+)\s*days?\)/i)
  return match ? Number(match[1]) || 0 : 0
}

function stripMembershipSuffix(name: string): string {
  return name.replace(/\s*\(\d+\s*days?\)\s*$/i, "").trim()
}

function stripPackageSittings(name: string): string {
  return name.replace(/\s*\(\d+\s*sittings?\)\s*$/i, "").trim()
}

function parsePackageSittings(name: string): number {
  const match = name.match(/\((\d+)\s*sittings?\)/i)
  return match ? Number(match[1]) || 0 : 0
}

function stripPrepaidPrefix(name: string): string {
  return name.replace(/^Prepaid wallet —\s*/i, "").trim()
}

export function mapSaleToServiceCheckoutInitialState(sale: Record<string, unknown>): BillEditCheckoutInitialState {
  const items = Array.isArray(sale.items) ? sale.items : []
  const lines: ServiceCheckoutLine[] = []
  const productLines: ServiceCheckoutProductLine[] = []
  const membershipLines: ServiceCheckoutMembershipLine[] = []
  const prepaidLines: ServiceCheckoutPrepaidLine[] = []
  const packageLines: ServiceCheckoutPackageLine[] = []

  items.forEach((raw, index) => {
    const item = raw as Record<string, unknown>
    const type = String(item.type || "")
    const staffId = normalizeId(item.staffId)
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const price = Number(item.price) || 0
    const discount = Number(item.discount) || 0
    const name = String(item.name || "")

    if (type === "service") {
      const rawContribs = Array.isArray(item.staffContributions)
        ? (item.staffContributions as Array<Record<string, unknown>>)
        : []
      const staffContributions =
        rawContribs.length > 0
          ? rawContribs.map((c) => ({
              staffId: normalizeId(c.staffId),
              staffName: String(c.staffName || item.staffName || ""),
              percentage: Number(c.percentage) || 0,
              amount: Number(c.amount) || 0,
            }))
          : staffId
            ? [{ staffId, staffName: String(item.staffName || ""), percentage: 100, amount: 0 }]
            : []
      lines.push({
        id: `svc-${index}-${normalizeId(item.serviceId) || index}`,
        serviceId: normalizeId(item.serviceId),
        staffId: staffId || staffContributions[0]?.staffId || "",
        staffContributions,
        name,
        duration: Number(item.duration) || 60,
        price,
        quantity,
        discountValue: discount,
        discountIsPercent: true,
      })
      return
    }

    if (type === "product") {
      productLines.push({
        id: `prod-${index}-${normalizeId(item.productId) || index}`,
        productId: normalizeId(item.productId),
        staffId,
        name,
        price,
        quantity,
        discountValue: discount,
        discountIsPercent: true,
      })
      return
    }

    if (type === "membership") {
      const planId = normalizeId(sale.planToAssignId) || normalizeId(item.planId)
      membershipLines.push({
        id: `mem-${index}-${planId || index}`,
        planId,
        staffId,
        planName: stripMembershipSuffix(name),
        price,
        durationInDays: parseMembershipDuration(name),
        quantity,
        discountValue: discount,
        discountIsPercent: true,
      })
      return
    }

    if (type === "prepaid_wallet") {
      prepaidLines.push({
        id: `prepaid-${index}-${normalizeId(item.prepaidPlanId) || index}`,
        planId: normalizeId(item.prepaidPlanId),
        staffId,
        planName: stripPrepaidPrefix(name),
        creditAmount: 0,
        validityDays: 0,
        price,
        quantity,
        discountValue: discount,
        discountIsPercent: true,
      })
      return
    }

    if (type === "package") {
      packageLines.push({
        id: `pkg-${index}-${normalizeId(item.packageId) || index}`,
        packageId: normalizeId(item.packageId),
        staffId,
        packageName: stripPackageSittings(name),
        price,
        totalSittings: parsePackageSittings(name),
        validityDays: 0,
        quantity,
        discountValue: discount,
        discountIsPercent: true,
      })
    }
  })

  const checkoutTipLines: CheckoutTipLine[] = []
  const tipLinesRaw = sale.tipLines
  if (Array.isArray(tipLinesRaw) && tipLinesRaw.length > 0) {
    tipLinesRaw.forEach((raw, idx) => {
      const tl = raw as Record<string, unknown>
      const staffId = normalizeId(tl.staffId)
      const amount = Number(tl.amount) || 0
      if (staffId && amount > 0) {
        checkoutTipLines.push({
          id: `tip-${idx}`,
          staffId,
          amount,
        })
      }
    })
  } else if (Number(sale.tip) > 0) {
    checkoutTipLines.push({
      id: "tip-0",
      staffId: normalizeId(sale.tipStaffId),
      amount: Number(sale.tip) || 0,
    })
  }

  let checkoutCartDiscountType: CheckoutCartDiscountMode = "fixed"
  let checkoutCartDiscountValue = 0
  const discount = Number(sale.discount) || 0
  const discountType = String(sale.discountType || "percentage").toLowerCase()
  if (discount > 0) {
    if (discountType === "fixed") {
      checkoutCartDiscountType = "fixed"
      checkoutCartDiscountValue = discount
    } else {
      checkoutCartDiscountType = "percentage"
      checkoutCartDiscountValue = discount <= 100 ? discount : 0
    }
  }

  const initialTender = {
    cash: 0,
    card: 0,
    online: 0,
    wallet: 0,
    loyaltyPoints: Number(sale.loyaltyPointsRedeemed) || 0,
    walletId: "",
  }

  if (Array.isArray(sale.payments)) {
    sale.payments.forEach((raw) => {
      const payment = raw as Record<string, unknown>
      const mode = String(payment.mode || payment.type || "").toLowerCase()
      const amount = Number(payment.amount) || 0
      if (mode.includes("cash")) initialTender.cash += amount
      else if (mode.includes("card")) initialTender.card += amount
      else if (mode.includes("online") || mode.includes("upi")) initialTender.online += amount
      else if (mode.includes("wallet")) initialTender.wallet += amount
    })
  }

  const tenderTotal =
    initialTender.cash + initialTender.card + initialTender.online + initialTender.wallet
  const paymentStatus = sale.paymentStatus as { paidAmount?: unknown } | undefined
  const paidFromStatus = Number(paymentStatus?.paidAmount)
  const recordedPaidAmount =
    typeof paidFromStatus === "number" && !Number.isNaN(paidFromStatus) && paidFromStatus >= 0
      ? paidFromStatus
      : tenderTotal

  const saleDate = sale.date ? new Date(String(sale.date)) : new Date()

  return {
    lines,
    productLines,
    membershipLines,
    prepaidLines,
    packageLines,
    checkoutTipLines,
    checkoutCartDiscountType,
    checkoutCartDiscountValue,
    checkoutSaleNote: String(sale.notes || ""),
    initialTender,
    recordedPaidAmount,
    appointmentDate: Number.isNaN(saleDate.getTime()) ? new Date() : saleDate,
    appointmentTime: String(sale.time || ""),
    notes: String(sale.notes || ""),
  }
}
