/**
 * Complete a bill from Service Checkout without navigating to Quick Sale.
 * Mirrors Quick Sale create-checkout logic for appointment-prefilled carts (payment sealed in dialog).
 */

import { format } from "date-fns"
import {
  AppointmentsAPI,
  ClientWalletAPI,
  ClientsAPI,
  MembershipAPI,
  PackagesAPI,
  ProductsAPI,
  RewardPointsAPI,
  SalesAPI,
  SettingsAPI,
  type RewardPointsSettings,
} from "@/lib/api"
import type { Client } from "@/lib/client-store"
import { addReceipt } from "@/lib/data"
import { computeMembershipPlanLineTotal } from "@/lib/membership-tax"
import {
  mergePaymentConfiguration,
  eligibleRedemptionSubtotal,
  type PaymentRedemptionLine,
} from "@/lib/payment-redemption-eligibility"
import { previewRedemptionLive } from "@/lib/reward-points-preview"
import { getLinePreTaxTotal } from "@/lib/staff-line-revenue"
import { buildRecordedPaymentsForCheckout } from "@/lib/quick-sale-recorded-payments"
import { buildSalePaymentModeFromCheckout, buildReceiptPaymentsFromSale } from "@/lib/sale-payment-lines"
import { buildReceiptTotalsBreakdown, itemCatalogPreTax } from "@/lib/receipt-totals-breakdown"
import {
  extractAppointmentIdsFromPayload,
  resolveAppointmentIdsToComplete,
  calendarYmdLocal,
  raiseSaleLinkageSnapshotFromCheckoutState,
  areRaiseSaleLinkageSnapshotsEqual,
  isLikelyMongoObjectId,
  filterWalletsForQuickSaleDisplay,
  pickDefaultClientWalletId,
  pickWalletIdForChangeCredit,
  buildCombinedQuickSaleWalletRow,
} from "@/lib/quick-sale-helpers"

export type ServiceCheckoutTaxSettings = {
  enableTax: boolean
  priceInclusiveOfTax: boolean
  serviceTaxRate: number
  membershipTaxRate: number
  packageTaxRate: number
  prepaidWalletTaxRate: number
  essentialProductRate: number
  intermediateProductRate: number
  standardProductRate: number
  luxuryProductRate: number
  exemptProductRate: number
}

export type CheckoutPaymentMethodChoice = "cash" | "card" | "online" | "wallet" | "reward"

function getCustomerId(customer: Client | null): string | null {
  if (!customer) return null
  return (customer._id || customer.id || null) as string | null
}

function addonLineTaxableBase(unitPrice: number, quantity: number, discountPercent?: number): number {
  const q = Math.max(1, Math.floor(Number(quantity) || 1))
  const disc = Math.min(100, Math.max(0, Number(discountPercent) || 0))
  return unitPrice * q * (1 - disc / 100)
}

function computeLineTotalAndTax(
  baseAmount: number,
  discountPct: number,
  taxRate: number,
  applyTax: boolean,
  priceInclusiveOfTax: boolean
): { total: number; taxAmount: number } {
  const discountedAmount = baseAmount * (1 - (discountPct || 0) / 100)
  if (!applyTax) return { total: discountedAmount, taxAmount: 0 }
  if (priceInclusiveOfTax) {
    const taxAmount = discountedAmount - discountedAmount / (1 + taxRate / 100)
    return { total: discountedAmount, taxAmount }
  }
  const taxAmount = (discountedAmount * taxRate) / 100
  return { total: discountedAmount + taxAmount, taxAmount }
}

function isServiceTaxable(
  serviceItem: { serviceId?: string },
  taxEnable: boolean,
  services: any[]
): boolean {
  if (!taxEnable) return false
  const service = services.find((s) => (s._id || s.id) === serviceItem.serviceId)
  return service?.taxApplicable === true
}

function productTaxRateForProduct(product: any, ts: ServiceCheckoutTaxSettings): number {
  if (!product?.taxCategory) return ts.standardProductRate ?? 18
  switch (product.taxCategory) {
    case "essential":
      return ts.essentialProductRate || 5
    case "intermediate":
      return ts.intermediateProductRate || 12
    case "standard":
      return ts.standardProductRate || 18
    case "luxury":
      return ts.luxuryProductRate || 28
    case "exempt":
      return ts.exemptProductRate || 0
    default:
      return ts.standardProductRate ?? 18
  }
}

function serviceLineTotalsWithItemDiscount(
  item: any,
  services: any[],
  ts: ServiceCheckoutTaxSettings
): { totalWithLineDisc: number; fullLineTotal: number } {
  const priceInclusive = ts.priceInclusiveOfTax !== false
  const taxOn = ts.enableTax !== false
  const baseAmount = item.price * item.quantity
  const itemDiscPct = item.discount || 0
  const rate = ts.serviceTaxRate || 5
  const applyTax = isServiceTaxable(item, taxOn, services)
  const { total: totalWithLineDisc } = computeLineTotalAndTax(
    baseAmount,
    itemDiscPct,
    rate,
    applyTax,
    priceInclusive
  )
  const { total: fullLineTotal } = computeLineTotalAndTax(baseAmount, 0, rate, applyTax, priceInclusive)
  return { totalWithLineDisc, fullLineTotal }
}

function productLineTotalsWithItemDiscount(
  item: any,
  products: any[],
  ts: ServiceCheckoutTaxSettings
): { totalWithLineDisc: number; fullLineTotal: number } {
  const priceInclusive = ts.priceInclusiveOfTax !== false
  const taxOn = ts.enableTax !== false
  const baseAmount = item.price * item.quantity
  const itemDiscPct = item.discount || 0
  const product = products.find((p) => p._id === item.productId || p.id === item.productId)
  const productTaxRate = productTaxRateForProduct(product, ts)
  const applyTax = taxOn
  const { total: totalWithLineDisc } = computeLineTotalAndTax(
    baseAmount,
    itemDiscPct,
    productTaxRate,
    applyTax,
    priceInclusive
  )
  const { total: fullLineTotal } = computeLineTotalAndTax(
    baseAmount,
    0,
    productTaxRate,
    applyTax,
    priceInclusive
  )
  return { totalWithLineDisc, fullLineTotal }
}

function applyCartDiscountToLine(
  item: any,
  lineTotals: { totalWithLineDisc: number; fullLineTotal: number },
  totalPayableAfterLineDisc: number,
  cartDiscountAmount: number
) {
  const { totalWithLineDisc, fullLineTotal } = lineTotals
  if (totalPayableAfterLineDisc <= 0 || cartDiscountAmount <= 0) {
    return { ...item, discount: item.discount || 0, total: totalWithLineDisc }
  }
  const proportionalDiscountValue =
    (totalWithLineDisc / totalPayableAfterLineDisc) * cartDiscountAmount
  const finalTotal = totalWithLineDisc - proportionalDiscountValue
  const effectiveDiscountPct =
    fullLineTotal > 0.005
      ? Math.min(100, Math.max(0, ((fullLineTotal - finalTotal) / fullLineTotal) * 100))
      : item.discount || 0
  return { ...item, discount: effectiveDiscountPct, total: finalTotal }
}

function recalculateServiceProductTotals(
  serviceItems: any[],
  productItems: any[],
  discountValue: number,
  discountPercentage: number,
  services: any[],
  products: any[],
  ts: ServiceCheckoutTaxSettings
): { serviceItems: any[]; productItems: any[] } {
  const sTotals = serviceItems.map((item) => serviceLineTotalsWithItemDiscount(item, services, ts))
  const pTotals = productItems.map((item) => productLineTotalsWithItemDiscount(item, products, ts))
  const totalPayableAfterLineDisc =
    sTotals.reduce((sum, l) => sum + l.totalWithLineDisc, 0) +
    pTotals.reduce((sum, l) => sum + l.totalWithLineDisc, 0)

  let cartDiscountAmount = 0
  if (discountValue > 0) {
    cartDiscountAmount = Math.min(discountValue, totalPayableAfterLineDisc)
  } else if (discountPercentage > 0) {
    cartDiscountAmount = (totalPayableAfterLineDisc * discountPercentage) / 100
  }

  if (cartDiscountAmount <= 0) {
    const nextS = serviceItems.map((item, index) => ({
      ...item,
      discount: item.discount || 0,
      total: sTotals[index]?.totalWithLineDisc ?? 0,
    }))
    const nextP = productItems.map((item, index) => ({
      ...item,
      discount: item.discount || 0,
      total: pTotals[index]?.totalWithLineDisc ?? 0,
    }))
    return { serviceItems: nextS, productItems: nextP }
  }

  const nextS = serviceItems.map((item, index) =>
    applyCartDiscountToLine(
      item,
      sTotals[index] ?? { totalWithLineDisc: 0, fullLineTotal: 0 },
      totalPayableAfterLineDisc,
      cartDiscountAmount
    )
  )
  const nextP = productItems.map((item, index) =>
    applyCartDiscountToLine(
      item,
      pTotals[index] ?? { totalWithLineDisc: 0, fullLineTotal: 0 },
      totalPayableAfterLineDisc,
      cartDiscountAmount
    )
  )
  return { serviceItems: nextS, productItems: nextP }
}

function serviceProductLineDiscountPreTax(
  serviceItems: any[],
  productItems: any[],
  services: any[],
  products: any[],
  ts: ServiceCheckoutTaxSettings
): number {
  const taxOn = ts.enableTax !== false
  const priceInclusive = ts.priceInclusiveOfTax !== false
  const toPreTax = (incl: number, rate: number) =>
    priceInclusive && rate > 0 ? incl / (1 + rate / 100) : incl

  let gross = 0
  let afterLine = 0

  for (const item of serviceItems) {
    const rate = isServiceTaxable(item, taxOn, services) ? ts.serviceTaxRate || 5 : 0
    gross += itemCatalogPreTax({ price: item.price, quantity: item.quantity, taxRate: rate })
    const { totalWithLineDisc } = serviceLineTotalsWithItemDiscount(item, services, ts)
    afterLine += toPreTax(totalWithLineDisc, rate)
  }

  for (const item of productItems) {
    const product = products.find((p) => p._id === item.productId || p.id === item.productId)
    const rate = productTaxRateForProduct(product, ts)
    const applyTax = taxOn && rate > 0
    const effectiveRate = applyTax ? rate : 0
    gross += itemCatalogPreTax({
      price: item.price,
      quantity: item.quantity,
      taxRate: effectiveRate,
    })
    const { totalWithLineDisc } = productLineTotalsWithItemDiscount(item, products, ts)
    afterLine += toPreTax(totalWithLineDisc, effectiveRate)
  }

  return Math.max(0, gross - afterLine)
}

let cachedInvoicePrefix: string | null = null

/** Cache invoice prefix when checkout opens so bill number generation needs one API call. */
export function primeCheckoutInvoicePrefix(prefix: string | undefined) {
  const trimmed = String(prefix || "").trim()
  if (trimmed) cachedInvoicePrefix = trimmed
}

async function resolveInvoicePrefix(invoicePrefixOverride?: string): Promise<string> {
  const override = String(invoicePrefixOverride || "").trim()
  if (override) return override
  if (cachedInvoicePrefix) return cachedInvoicePrefix
  try {
    const settingsResponse = await SettingsAPI.getBusinessSettings()
    if (settingsResponse.success && settingsResponse.data) {
      const prefix =
        settingsResponse.data.invoicePrefix || settingsResponse.data.receiptPrefix || "INV"
      cachedInvoicePrefix = prefix
      return prefix
    }
  } catch {
    /* use default */
  }
  return "INV"
}

async function generateReceiptNumber(invoicePrefixOverride?: string): Promise<string> {
  const maxRetries = 3
  let lastError: unknown = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const [incrementResponse, prefix] = await Promise.all([
        SettingsAPI.incrementReceiptNumber(),
        resolveInvoicePrefix(invoicePrefixOverride),
      ])
      if (incrementResponse.success) {
        const newReceiptNumber = incrementResponse.data.receiptNumber
        return `${prefix}-${String(newReceiptNumber).padStart(6, "0")}`
      }
      lastError = new Error(incrementResponse.error || "Failed to increment receipt number")
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * attempt))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to generate receipt number")
}

export type ServiceCheckoutPrefetchedRedemption = {
  rewardPointsSettings?: RewardPointsSettings | null
  loyaltyBalance?: number
  walletSettings?: { allowCouponStacking?: boolean; combineMultipleWallets?: boolean } | null
  clientWalletsUsable?: unknown[]
}

function checkoutNeedsRedemptionContext(opts: {
  paymentMethod: CheckoutPaymentMethodChoice
  tenderSplit?: ServiceCheckoutTenderSplit
  creditBillChangeToWallet?: boolean
  prefetchedRedemption?: ServiceCheckoutPrefetchedRedemption
}): boolean {
  if (opts.prefetchedRedemption) return false
  if (opts.creditBillChangeToWallet) return true
  if (opts.paymentMethod === "wallet" || opts.paymentMethod === "reward") return true
  const ts = opts.tenderSplit
  if (!ts) return false
  if ((ts.walletPayAmount || 0) > 0) return true
  if ((ts.loyaltyPointsInput || 0) > 0) return true
  return false
}

async function loadRedemptionContext(
  cid: string | null,
  needsLoad: boolean,
  prefetched?: ServiceCheckoutPrefetchedRedemption
): Promise<{
  rewardPointsSettings: RewardPointsSettings | null
  loyaltyBalance: number
  walletSettings: { allowCouponStacking?: boolean; combineMultipleWallets?: boolean } | null
  clientWalletsUsable: any[]
}> {
  if (prefetched) {
    return {
      rewardPointsSettings: prefetched.rewardPointsSettings ?? null,
      loyaltyBalance: prefetched.loyaltyBalance ?? 0,
      walletSettings: prefetched.walletSettings ?? null,
      clientWalletsUsable: (prefetched.clientWalletsUsable as any[]) ?? [],
    }
  }
  if (!needsLoad) {
    return {
      rewardPointsSettings: null,
      loyaltyBalance: 0,
      walletSettings: null,
      clientWalletsUsable: [],
    }
  }

  const [rs, ws, cres, wres] = await Promise.all([
    RewardPointsAPI.getSettings(),
    ClientWalletAPI.getSettings(),
    cid && isLikelyMongoObjectId(cid) ? ClientsAPI.getById(cid) : Promise.resolve(null),
    cid && isLikelyMongoObjectId(cid) ? ClientWalletAPI.getClientWallets(cid) : Promise.resolve(null),
  ])

  let loyaltyBalance = 0
  if (cres && "success" in cres && cres.success && cres.data) {
    loyaltyBalance = Number((cres.data as any).rewardPointsBalance) || 0
  }

  let clientWalletsUsable: any[] = []
  if (wres && "success" in wres && wres.success && wres.data?.wallets) {
    clientWalletsUsable = filterWalletsForQuickSaleDisplay(wres.data.wallets as any[])
  }

  return {
    rewardPointsSettings: rs.success && rs.data ? rs.data : null,
    loyaltyBalance,
    walletSettings: ws.success && ws.data ? (ws.data as any) : null,
    clientWalletsUsable,
  }
}

async function runPostCheckoutSideEffects(args: {
  isBillUpdate: boolean
  appointmentLinkageIntact: boolean
  linkedAppointmentId: string | null
  linkedAppointmentIds: string[]
  recordedPaidTotal: number
  calculatedTotal: number
  tip: number
  saleDoc: any
  walletPayAmount: number
  selectedWalletId: string
  customer: Client
  validServiceItems: any[]
  services: any[]
  isGlobalDiscountActive: boolean
  isValueDiscountActive: boolean
  built: { discountPercentage: number; discountValue: number }
  changeToCredit: number
  clientWalletsUsable: any[]
  cid: string | null
  receiptNumber: string
  validPrepaidPlanItems: any[]
  validPackageItems: any[]
  validProductItems: any[]
}) {
  const {
    isBillUpdate,
    appointmentLinkageIntact,
    linkedAppointmentId,
    linkedAppointmentIds,
    recordedPaidTotal,
    calculatedTotal,
    tip,
    saleDoc,
    walletPayAmount,
    selectedWalletId,
    customer,
    validServiceItems,
    services,
    isGlobalDiscountActive,
    isValueDiscountActive,
    built,
    changeToCredit,
    clientWalletsUsable,
    cid,
    receiptNumber,
    validPrepaidPlanItems,
    validPackageItems,
    validProductItems,
  } = args

  const tasks: Promise<unknown>[] = []

  if (
    appointmentLinkageIntact &&
    linkedAppointmentId &&
    (recordedPaidTotal >= calculatedTotal + tip || saleDoc?.status === "completed")
  ) {
    const idsToComplete = resolveAppointmentIdsToComplete(linkedAppointmentIds, linkedAppointmentId)
    tasks.push(
      Promise.all(idsToComplete.map((id) => AppointmentsAPI.update(id, { status: "completed" }))).catch(
        () => undefined
      )
    )
  }

  if (
    !isBillUpdate &&
    walletPayAmount > 0 &&
    selectedWalletId &&
    saleDoc?._id &&
    isLikelyMongoObjectId(getCustomerId(customer) || undefined)
  ) {
    const serviceNames = validServiceItems.map((it: any) => {
      const svc = services.find((s) => (s._id || s.id) === it.serviceId)
      return svc?.name || "Service"
    })
    const couponApplied =
      isGlobalDiscountActive ||
      isValueDiscountActive ||
      built.discountPercentage > 0 ||
      built.discountValue > 0
    tasks.push(
      ClientWalletAPI.redeem({
        walletId: selectedWalletId,
        amount: walletPayAmount,
        saleId: String(saleDoc._id),
        serviceNames,
        couponApplied,
      })
        .then((rw) => {
          if (!rw.success) console.warn("[inline-checkout] wallet redeem:", rw.message)
        })
        .catch((e) => console.warn("[inline-checkout] wallet redeem error", e))
    )
  }

  if (changeToCredit > 0.005 && saleDoc?._id && isLikelyMongoObjectId(cid || undefined)) {
    tasks.push(
      (async () => {
        try {
          if (clientWalletsUsable.length > 0) {
            const walletIdForCredit = pickWalletIdForChangeCredit(clientWalletsUsable, selectedWalletId)
            if (walletIdForCredit) {
              await ClientWalletAPI.creditChange({
                walletId: walletIdForCredit,
                amount: changeToCredit,
                saleId: String(saleDoc._id),
                billNo: receiptNumber,
              })
            }
          } else {
            await ClientWalletAPI.creditChangeOpenWallet({
              clientId: cid!,
              amount: changeToCredit,
              saleId: String(saleDoc._id),
              billNo: receiptNumber,
            })
          }
        } catch (e) {
          console.warn("[inline-checkout] change credit", e)
        }
      })()
    )
  }

  if (!isBillUpdate && validPrepaidPlanItems.length > 0 && saleDoc?._id && isLikelyMongoObjectId(cid || undefined)) {
    tasks.push(
      (async () => {
        try {
          for (const row of validPrepaidPlanItems) {
            const qty = Math.max(1, Math.floor(row.quantity || 1))
            for (let q = 0; q < qty; q++) {
              await ClientWalletAPI.issue({
                clientId: cid!,
                planId: row.planId,
                amountPaid: row.price,
                saleId: String(saleDoc._id),
              })
            }
          }
        } catch (e) {
          console.warn("[inline-checkout] prepaid issue", e)
        }
      })()
    )
  }

  if (!isBillUpdate && validPackageItems.length > 0 && saleDoc?._id && isLikelyMongoObjectId(cid || undefined)) {
    tasks.push(
      (async () => {
        try {
          const paymentTowardGoods = Math.min(recordedPaidTotal, calculatedTotal)
          const paymentRatio =
            calculatedTotal > 0 ? Math.min(1, Math.max(0, paymentTowardGoods / calculatedTotal)) : 1
          for (const row of validPackageItems) {
            const qty = Math.max(1, Math.floor(row.quantity || 1))
            const perUnitPaid = Math.round(((Number(row.price) || 0) * paymentRatio) * 100) / 100
            for (let q = 0; q < qty; q++) {
              await PackagesAPI.sell(row.packageId, {
                client_id: cid!,
                amount_paid: perUnitPaid,
                sold_by_staff_id: row.staffId || undefined,
              })
            }
          }
        } catch (e) {
          console.warn("[inline-checkout] package sell", e)
        }
      })()
    )
  }

  if (validProductItems.length > 0) {
    tasks.push(ProductsAPI.getAll({ limit: 1000 }).catch(() => undefined))
  }

  await Promise.allSettled(tasks)

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("appointments-refresh"))
  }
}

function normalizeCheckoutServiceStaffContributions(
  svcData: Record<string, unknown>,
  staff: any[],
  lineTotal: number
): { staffId: string; staffContributions: any[] } {
  const raw = Array.isArray(svcData.staffContributions)
    ? (svcData.staffContributions as Array<Record<string, unknown>>)
    : []
  if (raw.length > 0) {
    const staffContributions = raw.map((c) => {
      const staffId = String(c.staffId || "")
      const member = staff.find((s) => String(s._id || s.id) === staffId)
      const pct = Number(c.percentage) || (raw.length === 1 ? 100 : 0)
      const amountFromPayload = Number(c.amount)
      return {
        staffId,
        staffName: String(c.staffName || member?.name || "Unassigned Staff"),
        percentage: pct,
        amount: Number.isFinite(amountFromPayload)
          ? amountFromPayload
          : lineTotal > 0
            ? (lineTotal * pct) / 100
            : 0,
      }
    })
    return {
      staffId: String(svcData.staffId || staffContributions[0]?.staffId || ""),
      staffContributions,
    }
  }
  const staffId = String(svcData.staffId || "")
  const staffMember = staff.find((s) => String(s._id || s.id) === staffId)
  if (staffId && staffMember) {
    return {
      staffId,
      staffContributions: [
        {
          staffId,
          staffName: staffMember.name || String(svcData.staffName || ""),
          percentage: 100,
          amount: lineTotal,
        },
      ],
    }
  }
  return { staffId, staffContributions: [] }
}

async function buildSaleLinesFromAppointmentPayload(
  appointmentData: Record<string, unknown>,
  services: any[],
  products: any[],
  staff: any[],
  membershipPlans: any[],
  prepaidPlans: any[],
  catalogPackages: any[],
  ts: ServiceCheckoutTaxSettings
): Promise<{
  serviceItems: any[]
  productItems: any[]
  membershipItems: any[]
  packageItems: any[]
  prepaidPlanItems: any[]
  tip: number
  tipStaffId: string | null
  remarks: string
  discountValue: number
  discountPercentage: number
  lineDiscountPreTax: number
}> {
  const priceInclusive = ts.priceInclusiveOfTax !== false
  const taxOn = ts.enableTax !== false
  const serviceItemsToAdd: any[] = []

  if (appointmentData.services && Array.isArray(appointmentData.services) && appointmentData.services.length > 0) {
    for (const svcData of appointmentData.services as any[]) {
      const service = services.find((s) => (s._id || s.id) === svcData.serviceId)
      if (!service) continue
      const qty = Math.max(1, Math.floor(Number(svcData.quantity) || 1))
      const unitPrice = Number(svcData.price) || Number(service.price) || 0
      const baseAmount = unitPrice * qty
      const discPct = Math.min(100, Math.max(0, Number(svcData.discount) || 0))
      const serviceTaxRate = ts.serviceTaxRate || 5
      const applyTax = isServiceTaxable({ serviceId: service._id || service.id }, taxOn, services)
      const { total: lineTotal } = computeLineTotalAndTax(
        baseAmount,
        discPct,
        serviceTaxRate,
        applyTax,
        priceInclusive
      )
      const { staffId, staffContributions } = normalizeCheckoutServiceStaffContributions(
        svcData,
        staff,
        lineTotal
      )
      serviceItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        serviceId: service._id || service.id,
        staffId,
        quantity: qty,
        price: unitPrice,
        discount: discPct,
        total: lineTotal,
        staffContributions,
        appointmentLineLocked: Boolean(svcData.appointmentLineLocked),
      })
    }
  } else if (appointmentData.serviceId) {
    const service = services.find((s) => (s._id || s.id) === appointmentData.serviceId)
    if (service) {
      const staffMember = staff.find((s) => (s._id || s.id) === appointmentData.staffId)
      const qty = Math.max(1, Math.floor(Number(appointmentData.quantity) || 1))
      const unitPrice = Number(appointmentData.servicePrice) || Number(service.price) || 0
      const baseAmount = unitPrice * qty
      const discPct = Math.min(100, Math.max(0, Number(appointmentData.discount) || 0))
      const serviceTaxRate = ts.serviceTaxRate || 5
      const applyTax = isServiceTaxable({ serviceId: service._id || service.id }, taxOn, services)
      const { total: lineTotal } = computeLineTotalAndTax(
        baseAmount,
        discPct,
        serviceTaxRate,
        applyTax,
        priceInclusive
      )
      serviceItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        serviceId: service._id || service.id,
        staffId: (appointmentData.staffId as string) || "",
        quantity: qty,
        price: unitPrice,
        discount: discPct,
        total: lineTotal,
        staffContributions:
          appointmentData.staffId && staffMember
            ? [
                {
                  staffId: appointmentData.staffId,
                  staffName: staffMember.name || String(appointmentData.staffName || ""),
                  percentage: 100,
                  amount: lineTotal,
                },
              ]
            : [],
        appointmentLineLocked: true,
      })
    }
  }

  const productItemsToAdd: any[] = []
  const productsFromPayload = appointmentData.products
  if (Array.isArray(productsFromPayload) && productsFromPayload.length > 0) {
    for (const pData of productsFromPayload as any[]) {
      const product = products.find((p) => String(p._id || p.id) === String(pData.productId))
      if (!product) continue
      const basePrice = Number(pData.price) || Number(product.price) || 0
      const qty = Math.max(1, Math.floor(Number(pData.quantity) || 1))
      let productTaxRate = 18
      if (product?.taxCategory) {
        switch (product.taxCategory) {
          case "essential":
            productTaxRate = ts.essentialProductRate || 5
            break
          case "intermediate":
            productTaxRate = ts.intermediateProductRate || 12
            break
          case "standard":
            productTaxRate = ts.standardProductRate || 18
            break
          case "luxury":
            productTaxRate = ts.luxuryProductRate || 28
            break
          case "exempt":
            productTaxRate = ts.exemptProductRate || 0
            break
        }
      }
      const applyTax = taxOn
      const baseAmount = basePrice * qty
      const discPct = Math.min(100, Math.max(0, Number(pData.discount) || 0))
      const discountedAmount = baseAmount * (1 - discPct / 100)
      let lineTotal: number
      if (!applyTax || productTaxRate <= 0) {
        lineTotal = discountedAmount
      } else if (priceInclusive) {
        lineTotal = discountedAmount
      } else {
        lineTotal = discountedAmount + (discountedAmount * productTaxRate) / 100
      }
      productItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        productId: product._id || product.id,
        staffId: pData.staffId || "",
        quantity: qty,
        price: basePrice,
        discount: discPct,
        total: lineTotal,
        appointmentLineLocked: true,
      })
    }
  }

  const membershipItemsToAdd: any[] = []
  if (Array.isArray(appointmentData.memberships) && appointmentData.memberships.length > 0) {
    for (const mData of appointmentData.memberships as any[]) {
      const plan = membershipPlans.find((p) => String(p._id || p.id) === String(mData.planId))
      if (!plan) continue
      const unitPrice = Number(mData.price) || Number(plan.price) || 0
      const qty = Math.max(1, Math.floor(Number(mData.quantity) || 1))
      const discPct = Math.min(100, Math.max(0, Number(mData.discount) || 0))
      const base = addonLineTaxableBase(unitPrice, qty, discPct)
      const mRate = ts.membershipTaxRate ?? ts.serviceTaxRate ?? 5
      const { total } = computeMembershipPlanLineTotal(base, {
        membershipTaxRate: mRate,
        enableTax: taxOn,
        priceInclusiveOfTax: priceInclusive,
      })
      membershipItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        planId: String(plan._id || plan.id),
        planName: mData.planName || plan.planName || "Membership",
        price: unitPrice,
        durationInDays: Number(plan.durationInDays) || Number(mData.durationInDays) || 0,
        quantity: qty,
        total,
        staffId: mData.staffId || "",
        discount: discPct,
        appointmentLineLocked: true,
      })
    }
  }

  const packageItemsToAdd: any[] = []
  if (Array.isArray(appointmentData.packages) && appointmentData.packages.length > 0) {
    for (const pkData of appointmentData.packages as any[]) {
      const pkg = catalogPackages.find((p) => String(p._id || p.id) === String(pkData.packageId))
      if (!pkg) continue
      const unitPrice = Number(pkData.price) || Number(pkg.total_price) || 0
      const qty = Math.max(1, Math.floor(Number(pkData.quantity) || 1))
      const discPct = Math.min(100, Math.max(0, Number(pkData.discount) || 0))
      const base = addonLineTaxableBase(unitPrice, qty, discPct)
      const pkgRate = ts.packageTaxRate ?? ts.serviceTaxRate ?? 5
      const { total } = computeMembershipPlanLineTotal(base, {
        membershipTaxRate: pkgRate,
        enableTax: taxOn,
        priceInclusiveOfTax: priceInclusive,
      })
      packageItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        packageId: String(pkg._id || pkg.id),
        packageName: pkData.packageName || pkg.name || "Package",
        price: unitPrice,
        totalSittings: Number(pkg.total_sittings) || Number(pkData.totalSittings) || 0,
        validityDays: Number(pkg.validity_days) || Number(pkData.validityDays) || 0,
        quantity: qty,
        total,
        staffId: pkData.staffId || "",
        discount: discPct,
        appointmentLineLocked: true,
      })
    }
  }

  const prepaidPlanItemsToAdd: any[] = []
  if (Array.isArray(appointmentData.prepaidPlans) && appointmentData.prepaidPlans.length > 0) {
    for (const prData of appointmentData.prepaidPlans as any[]) {
      const wPlan = prepaidPlans.find((p) => String(p._id || p.id) === String(prData.planId))
      if (!wPlan) continue
      const unitPrice = Number(prData.price) || Number(wPlan.payAmount) || 0
      const qty = Math.max(1, Math.floor(Number(prData.quantity) || 1))
      const discPct = Math.min(100, Math.max(0, Number(prData.discount) || 0))
      const base = addonLineTaxableBase(unitPrice, qty, discPct)
      const prepaidRate = ts.prepaidWalletTaxRate ?? ts.serviceTaxRate ?? 5
      const { total } = computeMembershipPlanLineTotal(base, {
        membershipTaxRate: prepaidRate,
        enableTax: taxOn,
        priceInclusiveOfTax: priceInclusive,
      })
      prepaidPlanItemsToAdd.push({
        id: `${Date.now()}-${Math.random()}`,
        planId: String(wPlan._id || wPlan.id),
        planName: prData.planName || wPlan.name || "Prepaid",
        creditAmount: Number(wPlan.creditAmount) || Number(prData.creditAmount) || 0,
        validityDays: Number(wPlan.validityDays) || Number(prData.validityDays) || 0,
        staffId: prData.staffId || "",
        quantity: qty,
        price: unitPrice,
        total,
        discount: discPct,
        appointmentLineLocked: true,
      })
    }
  }

  let mergedRemarks = appointmentData.notes ? String(appointmentData.notes).trim() : ""
  let tip = 0
  let tipStaffId: string | null = null
  const tipsPayload = appointmentData.checkoutTips
  if (Array.isArray(tipsPayload) && tipsPayload.length > 0) {
    const tipEntries = (tipsPayload as any[])
      .map((t) => ({
        staffId: String(t.staffId || ""),
        amount: Math.max(0, Number(t.amount) || 0),
      }))
      .filter((t) => t.staffId && t.amount > 0)
    if (tipEntries.length > 0) {
      tip = tipEntries.reduce((acc, t) => acc + t.amount, 0)
      tipStaffId = tipEntries[0].staffId
    }
  }

  let discountValue = 0
  let discountPercentage = 0
  const cdpct = Number(appointmentData.cartDiscountPercent)
  if (Number.isFinite(cdpct) && cdpct > 0) {
    discountPercentage = Math.min(100, Math.max(0, cdpct))
  } else {
    const cdf = Number(appointmentData.cartDiscountFixed)
    if (Number.isFinite(cdf) && cdf > 0) {
      discountValue = cdf
    }
  }

  let s = serviceItemsToAdd
  let p = productItemsToAdd
  const lineDiscountPreTax = serviceProductLineDiscountPreTax(s, p, services, products, ts)
  if (discountValue > 0 || discountPercentage > 0) {
    const r = recalculateServiceProductTotals(s, p, discountValue, discountPercentage, services, products, ts)
    s = r.serviceItems
    p = r.productItems
  }

  return {
    serviceItems: s,
    productItems: p,
    membershipItems: membershipItemsToAdd,
    packageItems: packageItemsToAdd,
    prepaidPlanItems: prepaidPlanItemsToAdd,
    tip,
    tipStaffId,
    remarks: mergedRemarks,
    discountValue,
    discountPercentage,
    lineDiscountPreTax,
  }
}

export type CompleteServiceCheckoutInlineResult =
  | { ok: true; billNo: string; saleId: string }
  | { ok: false; error: string }

export type ServiceCheckoutTenderSplit = {
  cashAmount: number
  cardAmount: number
  onlineAmount: number
  walletPayAmount: number
  loyaltyPointsInput: number
  selectedWalletId: string
}

export type BillEditRefundProcessing = {
  amount: number
  mode: "wallet" | "cash"
  returnedProducts: { productId: string; name: string; quantity: number }[]
}

export async function completeServiceCheckoutInline(opts: {
  saleData: Record<string, unknown>
  /** Ignored when `tenderSplit` is set (amounts come from split). */
  paymentMethod?: CheckoutPaymentMethodChoice
  tenderSplit?: ServiceCheckoutTenderSplit
  customer: Client
  staff: any[]
  catalogServices: any[]
  catalogProducts: any[]
  catalogMembershipPlans: any[]
  catalogPrepaidPlans: any[]
  catalogPackages: any[]
  checkoutTaxSettings: ServiceCheckoutTaxSettings
  checkoutPaymentConfiguration: unknown
  /** After staff confirms in UI: credit cash overpayment to prepaid (cash-only tenders; server enforces). */
  creditBillChangeToWallet?: boolean
  /** When set, updates an existing sale instead of creating a new bill. */
  existingSaleId?: string
  existingBillNo?: string
  editReason?: string
  /** Product-return refund when revised bill total is below amount already paid. */
  refundProcessing?: BillEditRefundProcessing
  /** Original paid amount before refund (bill edit). */
  originalRecordedPaid?: number
  /** Payment-step data already loaded in checkout — skips duplicate wallet/reward API calls. */
  prefetchedRedemption?: ServiceCheckoutPrefetchedRedemption
  invoicePrefix?: string
}): Promise<CompleteServiceCheckoutInlineResult> {
  const {
    saleData: appointmentData,
    paymentMethod: paymentMethodOpt,
    tenderSplit,
    customer,
    staff,
    catalogServices: services,
    catalogProducts: products,
    catalogMembershipPlans,
    catalogPrepaidPlans,
    catalogPackages: catalogPackagesInput,
    checkoutTaxSettings: ts,
    checkoutPaymentConfiguration: payRaw,
    creditBillChangeToWallet: creditBillChangeOpt,
    existingSaleId,
    existingBillNo,
    editReason,
    refundProcessing,
    originalRecordedPaid,
    prefetchedRedemption,
    invoicePrefix,
  } = opts

  const isBillUpdate = Boolean(existingSaleId?.trim())
  const isRefundBillEdit = isBillUpdate && !!refundProcessing

  const paymentMethod: CheckoutPaymentMethodChoice = paymentMethodOpt ?? "cash"

  try {
    let membershipPlans = catalogMembershipPlans
    let prepaidPlans = catalogPrepaidPlans
    let catalogPackages = catalogPackagesInput

    const catalogLoads: Promise<void>[] = []
    if (
      Array.isArray(appointmentData.memberships) &&
      appointmentData.memberships.length > 0 &&
      membershipPlans.length === 0
    ) {
      catalogLoads.push(
        MembershipAPI.getPlans({ isActive: true }).then((plansRes) => {
          if (plansRes.success && Array.isArray(plansRes.data)) {
            membershipPlans = plansRes.data.filter((p: any) => p.isActive !== false)
          }
        })
      )
    }
    if (
      Array.isArray(appointmentData.prepaidPlans) &&
      appointmentData.prepaidPlans.length > 0 &&
      prepaidPlans.length === 0
    ) {
      catalogLoads.push(
        ClientWalletAPI.listPlans({ status: "active" }).then((pwRes) => {
          if (pwRes.success && pwRes.data?.plans) {
            prepaidPlans = pwRes.data.plans
          }
        })
      )
    }
    if (
      Array.isArray(appointmentData.packages) &&
      appointmentData.packages.length > 0 &&
      catalogPackages.length === 0
    ) {
      catalogLoads.push(
        PackagesAPI.list({ status: "ACTIVE", limit: 500 }).then((pkgRes) => {
          if (pkgRes.success && pkgRes.data?.packages) {
            catalogPackages = pkgRes.data.packages
          }
        })
      )
    }
    if (catalogLoads.length > 0) {
      await Promise.all(catalogLoads)
    }

    const built = await buildSaleLinesFromAppointmentPayload(
      appointmentData,
      services,
      products,
      staff,
      membershipPlans,
      prepaidPlans,
      catalogPackages,
      ts
    )

    const serviceItems = built.serviceItems
    const productItems = built.productItems
    const membershipItems = built.membershipItems
    const packageItems = built.packageItems
    const prepaidPlanItems = built.prepaidPlanItems
    const tip = built.tip
    const tipStaffId = built.tipStaffId
    const remarks = built.remarks
    const isValueDiscountActive = built.discountValue > 0
    const isGlobalDiscountActive = built.discountPercentage > 0

    const validServiceItems = serviceItems.filter((item) => item.serviceId)
    const validProductItems = productItems.filter((item) => item.productId)
    const validPrepaidPlanItems = prepaidPlanItems.filter((p) => p.planId)
    const validPackageItems = packageItems.filter((p) => p.packageId)

    if (
      validServiceItems.length === 0 &&
      validProductItems.length === 0 &&
      membershipItems.filter((m) => m.planId).length === 0 &&
      validPackageItems.length === 0 &&
      validPrepaidPlanItems.length === 0
    ) {
      return { ok: false, error: "No billable lines" }
    }

    for (const productItem of validProductItems) {
      const product = products.find((p) => p._id === productItem.productId || p.id === productItem.productId)
      if (product && product.stock < productItem.quantity) {
        return {
          ok: false,
          error: `${product.name}: insufficient stock (${product.stock} available)`,
        }
      }
    }

    const serviceTotal = serviceItems.reduce((sum, item) => sum + item.total, 0)
    const productTotal = productItems.reduce((sum, item) => sum + item.total, 0)
    const subtotal = serviceTotal + productTotal
    const membershipTotal = membershipItems.reduce((sum, item) => sum + item.total, 0)
    const packageTotal = packageItems.reduce((sum, item) => sum + item.total, 0)
    const prepaidPlanTotal = prepaidPlanItems.reduce((sum, item) => sum + item.total, 0)
    const baseTotalForSale = subtotal + membershipTotal + packageTotal + prepaidPlanTotal
    const roundedBaseTotalForSale = Math.round(baseTotalForSale)
    const roundOff = roundedBaseTotalForSale - baseTotalForSale

    let cartDiscountInclTax = 0
    let cartDiscountLabel = "Cart Discount"
    if (built.discountValue > 0) {
      cartDiscountInclTax = built.discountValue
    } else if (built.discountPercentage > 0) {
      cartDiscountInclTax =
        (baseTotalForSale * built.discountPercentage) / (100 - built.discountPercentage)
      cartDiscountLabel = `Cart Discount (${built.discountPercentage}%)`
    }

    const payCfgMerged = mergePaymentConfiguration(payRaw as any)
    const allowBillingRedemption = payCfgMerged.billingRedemption.allowRedemptionInBilling !== false

    const globalCartDiscountActive = built.discountValue > 0 || built.discountPercentage > 0
    const lineDiscounted = (item: {
      discount?: number
      isMembershipFree?: boolean
      membershipDiscountPercent?: number
    }) =>
      globalCartDiscountActive ||
      (item.discount ?? 0) > 0 ||
      !!item.isMembershipFree ||
      (item.membershipDiscountPercent ?? 0) > 0

    const redemptionLineItems: PaymentRedemptionLine[] = []
    for (const it of serviceItems) {
      if (!it.serviceId) continue
      redemptionLineItems.push({
        type: "service",
        total: Number(it.total) || 0,
        discount: it.discount ?? 0,
        isMembershipFree: it.isMembershipFree,
        membershipDiscountPercent: it.membershipDiscountPercent,
        isDiscounted: lineDiscounted(it),
      })
    }
    for (const it of productItems) {
      if (!it.productId) continue
      redemptionLineItems.push({
        type: "product",
        total: Number(it.total) || 0,
        discount: it.discount ?? 0,
        isDiscounted: lineDiscounted(it),
      })
    }
    for (const it of membershipItems) {
      if (!it.planId) continue
      redemptionLineItems.push({
        type: "membership",
        total: Number(it.total) || 0,
        isDiscounted: globalCartDiscountActive,
      })
    }
    for (const it of packageItems) {
      if (!it.packageId) continue
      redemptionLineItems.push({
        type: "package",
        total: Number(it.total) || 0,
        isDiscounted: globalCartDiscountActive,
      })
    }
    for (const it of prepaidPlanItems) {
      if (!it.planId) continue
      redemptionLineItems.push({ type: "prepaid_wallet", total: Number(it.total) || 0 })
    }

    const eligibleWalletSubtotal =
      allowBillingRedemption && payCfgMerged.walletRedemption.enabled !== false
        ? eligibleRedemptionSubtotal(redemptionLineItems, payCfgMerged, "wallet")
        : 0
    const eligibleRewardSubtotalRounded =
      allowBillingRedemption && payCfgMerged.rewardPointRedemption.enabled !== false
        ? Math.round(eligibleRedemptionSubtotal(redemptionLineItems, payCfgMerged, "reward"))
        : 0

    const cid = getCustomerId(customer)
    const needsRedemptionLoad = checkoutNeedsRedemptionContext({
      paymentMethod,
      tenderSplit,
      creditBillChangeToWallet: creditBillChangeOpt,
      prefetchedRedemption,
    })
    const {
      rewardPointsSettings,
      loyaltyBalance,
      walletSettings,
      clientWalletsUsable: loadedClientWalletsUsable,
    } = await loadRedemptionContext(cid, needsRedemptionLoad, prefetchedRedemption)
    let clientWalletsUsable = loadedClientWalletsUsable

    let clientWallets = clientWalletsUsable
    if (walletSettings?.combineMultipleWallets && clientWalletsUsable.length > 1) {
      clientWallets = [buildCombinedQuickSaleWalletRow(clientWalletsUsable)]
    }
    let selectedWalletId = pickDefaultClientWalletId(clientWalletsUsable)

    const hasWalletRedemptionSlot =
      allowBillingRedemption &&
      payCfgMerged.walletRedemption.enabled !== false &&
      clientWallets.length > 0 &&
      eligibleWalletSubtotal > 0

    const hasRewardRedemptionSlot =
      allowBillingRedemption &&
      payCfgMerged.rewardPointRedemption.enabled !== false &&
      rewardPointsSettings?.enabled &&
      !!cid &&
      isLikelyMongoObjectId(cid || undefined) &&
      loyaltyBalance > 0 &&
      eligibleRewardSubtotalRounded > 0

    const finalizeRewardFromCheckout =
      appointmentData.appointmentPricingFinalized === true &&
      (tenderSplit
        ? (tenderSplit.loyaltyPointsInput || 0) > 0
        : paymentMethod === "reward")

    const hasRewardRedemptionSlotForUi =
      !!hasRewardRedemptionSlot &&
      (appointmentData.appointmentPricingFinalized !== true || finalizeRewardFromCheckout)

    const hasAnyBillLineForRedemption = redemptionLineItems.length > 0
    const rewardRedemptionBlockedByItems =
      allowBillingRedemption &&
      hasAnyBillLineForRedemption &&
      eligibleRewardSubtotalRounded <= 0 &&
      payCfgMerged.rewardPointRedemption.enabled !== false

    let loyaltyPointsRedeemedSave = 0
    let loyaltyDiscountAmountSave = 0

    if (tenderSplit) {
      if (
        (tenderSplit.loyaltyPointsInput || 0) > 0 &&
        rewardPointsSettings?.enabled &&
        hasRewardRedemptionSlotForUi &&
        !rewardRedemptionBlockedByItems &&
        cid &&
        isLikelyMongoObjectId(cid) &&
        payCfgMerged.rewardPointRedemption.enabled !== false &&
        loyaltyBalance > 0
      ) {
        const capSubtotal = allowBillingRedemption ? eligibleRewardSubtotalRounded : roundedBaseTotalForSale
        const prev = previewRedemptionLive(
          rewardPointsSettings as any,
          capSubtotal,
          tenderSplit.loyaltyPointsInput,
          loyaltyBalance
        )
        if (prev.ok && prev.pointsToRedeem > 0) {
          loyaltyPointsRedeemedSave = prev.pointsToRedeem
          loyaltyDiscountAmountSave = prev.discountRupees
        } else if (!prev.ok) {
          return {
            ok: false,
            error: prev.error || "Invalid reward points for this bill.",
          }
        }
      }
    } else if (paymentMethod === "reward") {
      if (
        rewardPointsSettings?.enabled &&
        hasRewardRedemptionSlotForUi &&
        !rewardRedemptionBlockedByItems &&
        cid &&
        isLikelyMongoObjectId(cid) &&
        payCfgMerged.rewardPointRedemption.enabled !== false &&
        loyaltyBalance > 0
      ) {
        const capSubtotal = allowBillingRedemption ? eligibleRewardSubtotalRounded : roundedBaseTotalForSale
        const prev = previewRedemptionLive(rewardPointsSettings as any, capSubtotal, 9e9, loyaltyBalance)
        if (prev.ok && prev.pointsToRedeem > 0) {
          loyaltyPointsRedeemedSave = prev.pointsToRedeem
          loyaltyDiscountAmountSave = prev.discountRupees
        } else {
          return {
            ok: false,
            error: prev.error || "Could not apply reward points to this bill.",
          }
        }
      } else {
        return {
          ok: false,
          error: rewardRedemptionBlockedByItems
            ? "Reward points cannot be applied to these bill items."
            : "Reward points are not available for this checkout.",
        }
      }
    }

    const calculatedTotal = Math.max(0, roundedBaseTotalForSale - loyaltyDiscountAmountSave)
    const saleDueTotal = calculatedTotal + tip
    const roundedTotal = saleDueTotal

    let cashAmount = 0
    let cardAmount = 0
    let onlineAmount = 0
    let walletPayAmount = 0

    const applyCash = (due: number) => {
      const d = Math.max(0, due)
      cashAmount = d
      cardAmount = 0
      onlineAmount = 0
    }

    if (tenderSplit) {
      cashAmount = Math.max(0, Number(tenderSplit.cashAmount) || 0)
      cardAmount = Math.max(0, Number(tenderSplit.cardAmount) || 0)
      onlineAmount = Math.max(0, Number(tenderSplit.onlineAmount) || 0)
      walletPayAmount = Math.max(0, Number(tenderSplit.walletPayAmount) || 0)
      const tw = String(tenderSplit.selectedWalletId || "").trim()
      if (tw) {
        selectedWalletId = tw
      }
    } else if (paymentMethod === "cash") {
      walletPayAmount = 0
      applyCash(roundedTotal)
    } else if (paymentMethod === "card") {
      walletPayAmount = 0
      cashAmount = 0
      onlineAmount = 0
      cardAmount = Math.max(0, roundedTotal)
    } else if (paymentMethod === "online") {
      walletPayAmount = 0
      cashAmount = 0
      cardAmount = 0
      onlineAmount = Math.max(0, roundedTotal)
    } else if (paymentMethod === "wallet") {
      if (
        !hasWalletRedemptionSlot ||
        payCfgMerged.walletRedemption.enabled === false ||
        !selectedWalletId ||
        !clientWallets?.length
      ) {
        walletPayAmount = 0
        applyCash(roundedTotal)
      } else {
        const w = clientWallets.find((x: any) => String(x._id) === String(selectedWalletId))
        const wAmt = w
          ? Math.min(Number(w.remainingBalance), Math.max(0, Math.min(roundedTotal, eligibleWalletSubtotal)))
          : 0
        walletPayAmount = wAmt
        applyCash(Math.max(0, roundedTotal - wAmt))
      }
    } else if (paymentMethod === "reward") {
      walletPayAmount = 0
      if (loyaltyPointsRedeemedSave > 0) {
        applyCash(Math.max(0, saleDueTotal))
      } else {
        applyCash(roundedTotal)
      }
    }

    const totalPaid = cashAmount + cardAmount + onlineAmount + walletPayAmount
    const PAY_EPS = 0.01
    const isCashOnlyCheckout =
      cashAmount >= PAY_EPS &&
      Math.abs(cardAmount) < PAY_EPS &&
      Math.abs(onlineAmount) < PAY_EPS &&
      Math.abs(walletPayAmount) < PAY_EPS

    /** Unpaid and partial billing are allowed; checkout UI confirms before saving with zero tender. */

    if (walletPayAmount > 0) {
      if (!allowBillingRedemption) {
        return { ok: false, error: "Wallet redemption is disabled in payment configuration." }
      }
      if (!selectedWalletId) {
        return { ok: false, error: "No prepaid wallet available for this client." }
      }
      const wSel = clientWallets.find((x: any) => String(x._id) === selectedWalletId)
      if (!wSel) {
        return { ok: false, error: "Selected wallet is no longer available." }
      }
      if (walletPayAmount > Number(wSel.remainingBalance) + 1e-6) {
        return { ok: false, error: "Wallet amount exceeds balance." }
      }
      const maxWalletForBill = Math.min(roundedTotal, eligibleWalletSubtotal)
      if (walletPayAmount > maxWalletForBill + 1e-6) {
        return { ok: false, error: "Wallet amount exceeds allowed bill amount." }
      }
      const hasBillDiscount = isValueDiscountActive || isGlobalDiscountActive
      const combinedSources = (wSel as { _combinedSources?: any[] })._combinedSources
      const stackingOk =
        payCfgMerged.walletRedemption.allowOnDiscountedItems !== false ||
        walletSettings?.allowCouponStacking ||
        (Array.isArray(combinedSources) && combinedSources.length > 0
          ? combinedSources.every((sw) => sw.planSnapshot?.allowCouponStacking)
          : wSel.planSnapshot?.allowCouponStacking)
      if (hasBillDiscount && !stackingOk) {
        return {
          ok: false,
          error:
            "Wallet cannot be used with bill discounts unless redemption on discounted items is enabled (Prepaid wallet settings).",
        }
      }
    }

    if (loyaltyPointsRedeemedSave > 0 && !allowBillingRedemption) {
      return { ok: false, error: "Reward redemption is disabled in payment configuration." }
    }

    const wantBillChangeCredit = creditBillChangeOpt === true
    const creditChangeEffective =
      wantBillChangeCredit && isCashOnlyCheckout && totalPaid > roundedTotal + 1e-6

    if (creditChangeEffective && (!cid || !isLikelyMongoObjectId(cid))) {
      return {
        ok: false,
        error: "Select a saved customer to credit change to the prepaid wallet.",
      }
    }

    if (creditChangeEffective && clientWalletsUsable.length > 0) {
      const widPick = pickWalletIdForChangeCredit(clientWalletsUsable, selectedWalletId)
      if (!widPick) {
        return {
          ok: false,
          error: "Could not pick a wallet for the credit. Refresh and try again.",
        }
      }
    }

    const { payments, changeToCredit, recordedPaidTotal } = isRefundBillEdit
      ? {
          payments: [] as { type: string; amount: number }[],
          changeToCredit: 0,
          recordedPaidTotal: Math.max(0, Number(originalRecordedPaid) || 0),
        }
      : buildRecordedPaymentsForCheckout({
          cashAmount,
          cardAmount,
          onlineAmount,
          walletPayAmount,
          saleDueTotal,
          creditOverpaymentToWallet: creditChangeEffective,
        })

    if (
      !isRefundBillEdit &&
      creditChangeEffective &&
      totalPaid > saleDueTotal + 1e-6 &&
      Math.abs(recordedPaidTotal - saleDueTotal) > 0.02
    ) {
      return {
        ok: false,
        error:
          "The overpayment must be reducible from cash, card, or online — not from prepaid wallet redemption. Lower the wallet amount on the bill or pay the exact total.",
      }
    }

    if (!isRefundBillEdit && totalPaid > roundedTotal + 0.05) {
      if (!creditChangeEffective) {
        if (!isCashOnlyCheckout) {
          return {
            ok: false,
            error:
              "Change can be credited to prepaid only when the bill is paid entirely in cash. Remove card, online, or wallet payment, or reduce tender amounts to match the bill total.",
          }
        }
        return {
          ok: false,
          error:
            "Total paid exceeds the amount due. Reduce cash to the bill total, or confirm crediting the change to the prepaid wallet.",
        }
      }
    }

    const { primaryId, linkedIds } = extractAppointmentIdsFromPayload(appointmentData)
    let linkageBaseline: ReturnType<typeof raiseSaleLinkageSnapshotFromCheckoutState> | null = null
    if (primaryId) {
      const dateYmd =
        appointmentData.date != null && appointmentData.date !== ""
          ? calendarYmdLocal(new Date(String(appointmentData.date)))
          : calendarYmdLocal(new Date())
      linkageBaseline = raiseSaleLinkageSnapshotFromCheckoutState({
        clientId: String(appointmentData.clientId ?? "").trim(),
        dateYYYYMMDD: dateYmd,
        remarksNormalized: String(appointmentData.notes ?? "").trim(),
        serviceLines: validServiceItems.map((si: any) => ({
          serviceId: String(si.serviceId ?? ""),
          staffId: String(si.staffId ?? ""),
          quantity: Math.max(1, Math.floor(Number(si.quantity) || 1)),
        })),
        extraProducts: validProductItems.length,
        extraMemberships: membershipItems.filter((m) => m.planId).length,
        extraPackages: validPackageItems.length,
        extraPrepaid: validPrepaidPlanItems.length,
      })
    }

    const linkedAppointmentId = primaryId ?? null
    const linkedAppointmentIds = linkedIds

    const membershipLineCountCheckout = membershipItems.filter((m) => m.planId).length
    const packageLineCountCheckout = validPackageItems.length
    const checkoutSnap = raiseSaleLinkageSnapshotFromCheckoutState({
      clientId: String(getCustomerId(customer) || "").trim(),
      dateYYYYMMDD: calendarYmdLocal(
        appointmentData.date ? new Date(String(appointmentData.date)) : new Date()
      ),
      remarksNormalized: String(remarks || "").trim(),
      serviceLines: validServiceItems.map((item: any) => ({
        serviceId: String(item.serviceId || ""),
        staffId: String(item.staffId || ""),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      })),
      extraProducts: validProductItems.length,
      extraMemberships: membershipLineCountCheckout,
      extraPackages: packageLineCountCheckout,
      extraPrepaid: validPrepaidPlanItems.length,
    })

    let appointmentLinkageIntact = true
    let raiseSaleLinkageVoided = false
    if (linkedAppointmentId && linkageBaseline !== null) {
      appointmentLinkageIntact = areRaiseSaleLinkageSnapshotsEqual(linkageBaseline, checkoutSnap)
      raiseSaleLinkageVoided = !appointmentLinkageIntact
    }
    const effectiveAppointmentId = appointmentLinkageIntact ? linkedAppointmentId || undefined : undefined

    let calculatedTax = 0
    let taxBreakdown: any = {
      cgst: 0,
      sgst: 0,
      igst: 0,
      serviceTax: 0,
      serviceRate: 5,
      productTaxByRate: {} as Record<string, number>,
    }
    const priceInclusive = ts.priceInclusiveOfTax !== false
    const taxOn = ts.enableTax !== false

    const serviceTax = taxOn
      ? validServiceItems.reduce((sum, item) => {
          if (!isServiceTaxable(item, taxOn, services)) return sum
          const baseAmount = item.price * item.quantity
          const serviceTaxRate = ts.serviceTaxRate || 5
          const { taxAmount } = computeLineTotalAndTax(
            baseAmount,
            item.discount ?? 0,
            serviceTaxRate,
            true,
            priceInclusive
          )
          return sum + taxAmount
        }, 0)
      : 0

    const productTaxByRate: Record<string, number> = {}
    const productTax = taxOn
      ? validProductItems.reduce((sum, item) => {
          const baseAmount = item.price * item.quantity
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          let productTaxRate = 18
          if (product?.taxCategory) {
            switch (product.taxCategory) {
              case "essential":
                productTaxRate = ts.essentialProductRate || 5
                break
              case "intermediate":
                productTaxRate = ts.intermediateProductRate || 12
                break
              case "standard":
                productTaxRate = ts.standardProductRate || 18
                break
              case "luxury":
                productTaxRate = ts.luxuryProductRate || 28
                break
              case "exempt":
                productTaxRate = ts.exemptProductRate || 0
                break
            }
          }
          const { taxAmount } = computeLineTotalAndTax(
            baseAmount,
            item.discount ?? 0,
            productTaxRate,
            taxOn,
            priceInclusive
          )
          const key = String(productTaxRate)
          productTaxByRate[key] = (productTaxByRate[key] || 0) + taxAmount
          return sum + taxAmount
        }, 0)
      : 0

    const membershipTaxCheckout = taxOn
      ? membershipItems
          .filter((m) => m.planId)
          .reduce((sum, m) => {
            const baseAmount = m.price * m.quantity
            const membershipTaxRate = ts.membershipTaxRate ?? ts.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(
              baseAmount,
              m.discount ?? 0,
              membershipTaxRate,
              membershipTaxRate > 0,
              priceInclusive
            )
            return sum + taxAmount
          }, 0)
      : 0

    const packageTaxCheckout = taxOn
      ? packageItems
          .filter((p) => p.packageId)
          .reduce((sum, p) => {
            const baseAmount = p.price * p.quantity
            const packageTaxRate = ts.packageTaxRate ?? ts.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(
              baseAmount,
              p.discount ?? 0,
              packageTaxRate,
              packageTaxRate > 0,
              priceInclusive
            )
            return sum + taxAmount
          }, 0)
      : 0

    const prepaidTaxCheckout = taxOn
      ? prepaidPlanItems
          .filter((p) => p.planId)
          .reduce((sum, p) => {
            const baseAmount = p.price * p.quantity
            const prepaidTaxRate = ts.prepaidWalletTaxRate ?? ts.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(
              baseAmount,
              p.discount ?? 0,
              prepaidTaxRate,
              prepaidTaxRate > 0,
              priceInclusive
            )
            return sum + taxAmount
          }, 0)
      : 0

    calculatedTax = serviceTax + productTax + membershipTaxCheckout + packageTaxCheckout + prepaidTaxCheckout
    taxBreakdown = {
      cgst: calculatedTax / 2,
      sgst: calculatedTax / 2,
      igst: 0,
      serviceTax: serviceTax,
      membershipTax: membershipTaxCheckout,
      membershipRate: ts.membershipTaxRate ?? ts.serviceTaxRate ?? 5,
      packageTax: packageTaxCheckout,
      packageRate: ts.packageTaxRate ?? ts.serviceTaxRate ?? 5,
      prepaidWalletTax: prepaidTaxCheckout,
      prepaidWalletTaxRate: ts.prepaidWalletTaxRate ?? ts.serviceTaxRate ?? 5,
      serviceRate: ts.serviceTaxRate || 5,
      productTaxByRate,
    }

    const receiptItems: any[] = [
      ...validServiceItems.map((item: any) => {
        const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
        const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
        let staffContributions = item.staffContributions
        if (!staffContributions && item.staffId) {
          const preTax = getLinePreTaxTotal({
            price: item.price,
            quantity: item.quantity,
            discount: item.discount ?? 0,
            total: item.total,
            taxRate: isServiceTaxable(item, taxOn, services) ? ts.serviceTaxRate || 5 : 0,
          })
          staffContributions = [
            {
              staffId: item.staffId,
              staffName: staffMember?.name || "Unassigned Staff",
              percentage: 100,
              amount: preTax,
            },
          ]
        }
        const serviceTaxRate = ts.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item, taxOn, services)
        const baseAmount = item.price * item.quantity
        const { taxAmount } = computeLineTotalAndTax(
          baseAmount,
          item.discount ?? 0,
          serviceTaxRate,
          applyTax,
          priceInclusive
        )
        return {
          id: item.id,
          name: service?.name || "Unknown Service",
          type: "service",
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          discountType: "percentage",
          staffId: item.staffId,
          staffName: staffMember?.name || "Unassigned Staff",
          total: item.total,
          staffContributions,
          hsnSacCode: (service as any)?.hsnSacCode || "",
          taxAmount,
          cgst: taxAmount / 2,
          sgst: taxAmount / 2,
          totalWithTax: item.total,
          priceExcludingGST: (item.total - (taxAmount || 0)) / (item.quantity || 1),
          taxRate: applyTax ? serviceTaxRate : 0,
          isMembershipFree: item.isMembershipFree ?? false,
          membershipDiscountPercent: item.membershipDiscountPercent ?? 0,
        }
      }),
      ...validProductItems.map((item: any) => {
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
        let productTaxRate = 18
        if (product?.taxCategory) {
          switch (product.taxCategory) {
            case "essential":
              productTaxRate = ts.essentialProductRate || 5
              break
            case "intermediate":
              productTaxRate = ts.intermediateProductRate || 12
              break
            case "standard":
              productTaxRate = ts.standardProductRate || 18
              break
            case "luxury":
              productTaxRate = ts.luxuryProductRate || 28
              break
            case "exempt":
              productTaxRate = ts.exemptProductRate || 0
              break
          }
        }
        const applyTax = taxOn && productTaxRate > 0
        const baseAmount = item.price * item.quantity
        const { taxAmount } = computeLineTotalAndTax(
          baseAmount,
          item.discount ?? 0,
          productTaxRate,
          applyTax,
          priceInclusive
        )
        return {
          id: item.id,
          name: product?.name || "Unknown Product",
          type: "product",
          quantity: item.quantity,
          price: item.price,
          discount: item.discount,
          discountType: "percentage",
          staffId: item.staffId,
          staffName: staffMember?.name || "Unassigned Staff",
          total: item.total,
          hsnSacCode: (product as any)?.hsnSacCode || "",
          taxAmount,
          cgst: taxAmount / 2,
          sgst: taxAmount / 2,
          totalWithTax: item.total,
          priceExcludingGST: (item.total - (taxAmount || 0)) / (item.quantity || 1),
          taxRate: applyTax ? productTaxRate : 0,
        }
      }),
      ...membershipItems
        .filter((m) => m.planId)
        .map((m) => ({
          id: m.id,
          name: `${m.planName} (${m.durationInDays} days)`,
          type: "membership" as const,
          quantity: m.quantity,
          price: m.price,
          discount: 0,
          discountType: "percentage" as const,
          hsnSacCode: "",
          staffId: m.staffId || staff[0]?._id || staff[0]?.id || "",
          staffName: (m.staffId ? staff.find((s) => (s._id || s.id) === m.staffId)?.name : null) || staff[0]?.name || "Unassigned Staff",
          total: m.total,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          totalWithTax: m.total,
        })),
      ...packageItems
        .filter((p) => p.packageId)
        .map((p) => ({
          id: p.id,
          name: `${p.packageName}${p.totalSittings ? ` (${p.totalSittings} sittings)` : ""}`,
          type: "package" as const,
          quantity: p.quantity,
          price: p.price,
          discount: 0,
          discountType: "percentage" as const,
          hsnSacCode: "",
          staffId: p.staffId || staff[0]?._id || staff[0]?.id || "",
          staffName: (p.staffId ? staff.find((s) => (s._id || s.id) === p.staffId)?.name : null) || staff[0]?.name || "Unassigned Staff",
          total: p.total,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          totalWithTax: p.total,
        })),
      ...prepaidPlanItems
        .filter((p) => p.planId)
        .map((p) => ({
          id: p.id,
          name: `Prepaid wallet — ${p.planName}`,
          type: "prepaid_wallet" as const,
          quantity: p.quantity,
          price: p.price,
          discount: 0,
          discountType: "percentage" as const,
          hsnSacCode: "",
          staffId: p.staffId || staff[0]?._id || staff[0]?.id || "",
          staffName: (p.staffId ? staff.find((s) => (s._id || s.id) === p.staffId)?.name : null) || staff[0]?.name || "Unassigned Staff",
          total: p.total,
          taxAmount: 0,
          cgst: 0,
          sgst: 0,
          totalWithTax: p.total,
        })),
    ]

    receiptItems.forEach((item) => {
      if (item.type === "membership") {
        const membershipTaxRate = ts.membershipTaxRate ?? ts.serviceTaxRate ?? 5
        const applyTax = taxOn && membershipTaxRate > 0
        const baseAmount = item.price * item.quantity
        const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, membershipTaxRate, applyTax, priceInclusive)
        item.taxAmount = taxAmount
        item.cgst = taxAmount / 2
        item.sgst = taxAmount / 2
        item.totalWithTax = item.total
        item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
        ;(item as any).taxRate = applyTax ? membershipTaxRate : 0
      } else if (item.type === "package") {
        const packageTaxRate = ts.packageTaxRate ?? ts.serviceTaxRate ?? 5
        const applyTax = taxOn && packageTaxRate > 0
        const baseAmount = item.price * item.quantity
        const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, packageTaxRate, applyTax, priceInclusive)
        item.taxAmount = taxAmount
        item.cgst = taxAmount / 2
        item.sgst = taxAmount / 2
        item.totalWithTax = item.total
        item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
        ;(item as any).taxRate = applyTax ? packageTaxRate : 0
      } else if (item.type === "prepaid_wallet") {
        const prepaidTaxRate = ts.prepaidWalletTaxRate ?? ts.serviceTaxRate ?? 5
        const applyTax = taxOn && prepaidTaxRate > 0
        const baseAmount = item.price * item.quantity
        const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, prepaidTaxRate, applyTax, priceInclusive)
        item.taxAmount = taxAmount
        item.cgst = taxAmount / 2
        item.sgst = taxAmount / 2
        item.totalWithTax = item.total
        item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
        ;(item as any).taxRate = applyTax ? prepaidTaxRate : 0
      }
    })

    const subtotalExcludingTaxForReceipt = receiptItems.reduce(
      (sum, item) => sum + (item.total - ((item as any).taxAmount || 0)),
      0
    )
    const totalsBreakdown = buildReceiptTotalsBreakdown({
      items: receiptItems,
      tax: calculatedTax,
      totalInclTaxBeforeLoyalty: calculatedTotal + loyaltyDiscountAmountSave,
      roundOff,
      loyaltyDiscountAmount: loyaltyDiscountAmountSave,
      tip,
      cartDiscountAmount: cartDiscountInclTax,
      cartDiscountLabel,
      lineDiscountAmount: built.lineDiscountPreTax,
      subtotalPreTax: subtotalExcludingTaxForReceipt,
    })

    const primaryStaff =
      receiptItems.length > 0
        ? { staffId: receiptItems[0].staffId, staffName: receiptItems[0].staffName }
        : null

    const receiptNumber = isBillUpdate
      ? String(existingBillNo || appointmentData.billNo || "").trim()
      : await generateReceiptNumber(invoicePrefix)
    if (isBillUpdate && !receiptNumber) {
      return { ok: false, error: "Bill number is missing for update" }
    }
    const tipStaff = tipStaffId ? staff.find((s) => (s._id || s.id) === tipStaffId) : null

    const salePayload: Record<string, unknown> = {
      billNo: receiptNumber,
      customerId: getCustomerId(customer),
      customerName: customer!.name,
      customerPhone: customer!.phone,
      customerEmail: customer?.email || "",
      items: [
        ...validServiceItems.map((item: any) => {
          const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          const receiptItem = receiptItems.find((r) => r.id === item.id)
          const itemTax = receiptItem?.taxAmount ?? 0
          return {
            serviceId: item.serviceId,
            productId: null,
            name: service?.name || "Unknown Service",
            type: "service" as const,
            quantity: item.quantity,
            price: item.price,
            priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
            total: item.total,
            discount: item.discount ?? 0,
            staffId: item.staffId || "",
            staffName: staffMember?.name || "",
            staffContributions: item.staffContributions || [],
            isMembershipFree: item.isMembershipFree ?? false,
            membershipDiscountPercent: item.membershipDiscountPercent ?? 0,
            hsnSacCode: (service as any)?.hsnSacCode || "",
            taxRate: (receiptItem as any)?.taxRate ?? 0,
          }
        }),
        ...validProductItems.map((item: any) => {
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          const receiptItem = receiptItems.find((r) => r.id === item.id)
          const itemTax = receiptItem?.taxAmount ?? 0
          return {
            productId: item.productId,
            serviceId: null,
            name: product?.name || "Unknown Product",
            type: "product" as const,
            quantity: item.quantity,
            price: item.price,
            priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
            total: item.total,
            discount: item.discount ?? 0,
            staffId: item.staffId || "",
            staffName: staffMember?.name || "",
            staffContributions: item.staffContributions || [],
            hsnSacCode: (product as any)?.hsnSacCode || "",
            taxRate: (receiptItem as any)?.taxRate ?? 0,
          }
        }),
        ...membershipItems
          .filter((m) => m.planId)
          .map((m) => {
            const receiptItem = receiptItems.find((r) => r.id === m.id)
            const itemTax = receiptItem?.taxAmount ?? 0
            const staffMember = staff.find((s) => s._id === m.staffId || s.id === m.staffId)
            return {
              serviceId: null,
              productId: null,
              name: `${m.planName} (${m.durationInDays} days)`,
              type: "membership" as const,
              quantity: m.quantity,
              price: m.price,
              priceExcludingGST: (m.total - itemTax) / (m.quantity || 1),
              total: m.total,
              discount: 0,
              staffId: m.staffId || "",
              staffName: staffMember?.name || staff[0]?.name || "",
              staffContributions: [],
              hsnSacCode: "",
              taxRate: (receiptItem as any)?.taxRate ?? 0,
            }
          }),
        ...validPackageItems.map((p) => {
          const receiptItem = receiptItems.find((r) => r.id === p.id)
          const itemTax = receiptItem?.taxAmount ?? 0
          const staffMember = staff.find((s) => s._id === p.staffId || s.id === p.staffId)
          return {
            serviceId: null,
            productId: null,
            packageId: p.packageId,
            name: `${p.packageName}${p.totalSittings ? ` (${p.totalSittings} sittings)` : ""}`,
            type: "package" as const,
            quantity: p.quantity,
            price: p.price,
            priceExcludingGST: (p.total - itemTax) / (p.quantity || 1),
            total: p.total,
            discount: p.discount ?? 0,
            staffId: p.staffId || "",
            staffName: staffMember?.name || staff[0]?.name || "",
            staffContributions: [],
            hsnSacCode: "",
            taxRate: (receiptItem as any)?.taxRate ?? 0,
          }
        }),
        ...validPrepaidPlanItems.map((p) => {
          const receiptItem = receiptItems.find((r) => r.id === p.id)
          const itemTax = receiptItem?.taxAmount ?? 0
          const staffMember = staff.find((s) => s._id === p.staffId || s.id === p.staffId)
          return {
            serviceId: null,
            productId: null,
            prepaidPlanId: p.planId,
            name: `Prepaid wallet — ${p.planName}`,
            type: "prepaid_wallet" as const,
            quantity: p.quantity,
            price: p.price,
            priceExcludingGST: (p.total - itemTax) / (p.quantity || 1),
            total: p.total,
            discount: 0,
            staffId: p.staffId || "",
            staffName: staffMember?.name || staff[0]?.name || "",
            staffContributions: [],
            hsnSacCode: "",
            taxRate: (receiptItem as any)?.taxRate ?? 0,
          }
        }),
      ],
      netTotal: calculatedTotal + tip,
      taxAmount: calculatedTax,
      grossTotal: calculatedTotal,
      tip,
      tipStaffId: tipStaffId || undefined,
      tipStaffName: tipStaff?.name || undefined,
      discount: isValueDiscountActive ? built.discountValue : isGlobalDiscountActive ? built.discountPercentage : 0,
      discountType: isValueDiscountActive ? "fixed" : "percentage",
      paymentStatus: {
        totalAmount: calculatedTotal + tip,
        paidAmount: isRefundBillEdit
          ? Math.max(0, Number(originalRecordedPaid) || recordedPaidTotal)
          : recordedPaidTotal,
        remainingAmount:
          calculatedTotal +
          tip -
          (isRefundBillEdit
            ? Math.max(0, Number(originalRecordedPaid) || recordedPaidTotal)
            : recordedPaidTotal),
        dueDate: new Date(),
      },
      status:
        calculatedTotal + tip <= 0
          ? "completed"
          : recordedPaidTotal === 0
            ? "unpaid"
            : recordedPaidTotal < calculatedTotal + tip
              ? "partial"
              : "completed",
      paymentMode: buildSalePaymentModeFromCheckout({
        payments,
        loyaltyPointsRedeemed: loyaltyPointsRedeemedSave,
        loyaltyDiscountAmount: loyaltyDiscountAmountSave,
      }),
      payments: payments.map((p) => ({
        mode: p.type.charAt(0).toUpperCase() + p.type.slice(1),
        amount: p.amount,
      })),
      staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
      staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
      notes: remarks || "",
      appointmentId: effectiveAppointmentId,
      date: (appointmentData.date ? new Date(String(appointmentData.date)) : new Date()).toISOString(),
      time: format(new Date(), "HH:mm"),
      ...(membershipItems.filter((m) => m.planId).length > 0 && {
        planToAssignId: membershipItems.find((m) => m.planId)?.planId,
        membershipPlanPrice: membershipTotal,
      }),
      taxBreakdown: {
        serviceTax: taxBreakdown.serviceTax,
        serviceRate: taxBreakdown.serviceRate,
        productTaxByRate: taxBreakdown.productTaxByRate,
      },
      receiptTotalsBreakdown: totalsBreakdown,
      loyaltyPointsRedeemed: loyaltyPointsRedeemedSave,
      loyaltyDiscountAmount: loyaltyDiscountAmountSave,
      // Walk-in / Quick Sale checkout: sale cards only — never also create synthetic
      // walk-in Appointment rows (multi-staff standalone sale).
      suppressStandaloneWalkInCalendarCards: true,
      ...(raiseSaleLinkageVoided
        ? {
            voidBookingAppointmentIds: resolveAppointmentIdsToComplete(linkedAppointmentIds, linkedAppointmentId),
          }
        : {}),
    }

    const updateBody: Record<string, unknown> = {
      ...salePayload,
      editReason: (editReason || "Bill edited via checkout").trim(),
    }
    if (isRefundBillEdit && refundProcessing) {
      delete updateBody.payments
      const paid = Math.max(0, Number(originalRecordedPaid) || 0)
      const newTotal = calculatedTotal + tip
      const computedRefund = Math.max(0, Math.round((paid - newTotal) * 100) / 100)
      if (computedRefund <= 0.005) {
        return { ok: false, error: "No refund is due on this bill." }
      }
      updateBody.refundProcessing = {
        ...refundProcessing,
        amount: computedRefund,
        editReason: (editReason || "Product return refund").trim(),
      }
    }

    const result = isBillUpdate
      ? await SalesAPI.update(String(existingSaleId), updateBody)
      : await SalesAPI.create(salePayload as any)
    if (!result.success) {
      return { ok: false, error: result.error || "Failed to create sale" }
    }

    const saleDoc = result.data

    addReceipt({
      id: Date.now().toString(),
      receiptNumber,
      clientId: getCustomerId(customer),
      clientName: customer!.name,
      clientPhone: customer!.phone,
      date: (appointmentData.date ? new Date(String(appointmentData.date)) : new Date()).toISOString(),
      time: format(new Date(), "HH:mm"),
      items: receiptItems,
      subtotal,
      subtotalExcludingTax: subtotalExcludingTaxForReceipt,
      tip,
      discount: isValueDiscountActive ? built.discountValue : isGlobalDiscountActive ? built.discountPercentage : 0,
      discountType: isValueDiscountActive ? "fixed" : "percentage",
      tax: calculatedTax,
      roundOff,
      total: calculatedTotal + tip,
      totalsBreakdown,
      loyaltyDiscountAmount: loyaltyDiscountAmountSave,
      taxBreakdown,
      payments: buildReceiptPaymentsFromSale({
        date: (appointmentData.date ? new Date(String(appointmentData.date)) : new Date()).toISOString(),
        payments: payments.map((p) => ({ mode: p.type, amount: p.amount })),
        loyaltyPointsRedeemed: loyaltyPointsRedeemedSave,
        loyaltyDiscountAmount: loyaltyDiscountAmountSave,
      }),
      staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
      staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
      tipStaffId: tipStaffId || undefined,
      tipStaffName: tipStaff?.name || undefined,
      notes: remarks,
      shareToken: (saleDoc as any)?.shareToken,
    } as any)

    void runPostCheckoutSideEffects({
      isBillUpdate,
      appointmentLinkageIntact,
      linkedAppointmentId,
      linkedAppointmentIds,
      recordedPaidTotal,
      calculatedTotal,
      tip,
      saleDoc,
      walletPayAmount,
      selectedWalletId,
      customer: customer!,
      validServiceItems,
      services,
      isGlobalDiscountActive,
      isValueDiscountActive,
      built,
      changeToCredit,
      clientWalletsUsable,
      cid,
      receiptNumber,
      validPrepaidPlanItems,
      validPackageItems,
      validProductItems,
    })

    return { ok: true, billNo: receiptNumber, saleId: String(saleDoc._id) }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Checkout failed"
    return { ok: false, error: msg }
  }
}

/** @internal Exported for unit tests */
export { recalculateServiceProductTotals }
