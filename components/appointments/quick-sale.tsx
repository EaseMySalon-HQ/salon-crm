"use client"

import type React from "react"

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search,
  Plus,
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  Eye,
  X,
  CreditCard,
  Smartphone,
  Banknote,
  Loader2,
  CalendarIcon,
  Receipt,
  CalendarDays,
  FileText,
  StickyNote,
  Minus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit,
  RefreshCw,
  Package as PackageIcon,
  AlertCircle,
  Wallet,
  Gift,
} from "lucide-react"
import { Calendar as DatePicker } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { ReceiptDialog } from "@/components/receipts/receipt-dialog"
import { PostPaymentReceiptModal } from "@/components/receipts/post-payment-receipt-modal"
import { PaymentCollectionModal } from "@/components/reports/payment-collection-modal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
  addReceipt,
  getReceiptsByClient,
  type PaymentMethod,
  type Receipt as ReceiptRecord,
  getAllReceipts,
} from "@/lib/data"
import { ReceiptPreview } from "@/components/receipts/receipt-preview"
import { receiptPreviewReceiptFromSaleApi } from "@/lib/receipt-preview-from-sale-api"
import {
  ServicesAPI,
  ProductsAPI,
  StaffAPI,
  SalesAPI,
  UsersAPI,
  SettingsAPI,
  ReceiptsAPI,
  StaffDirectoryAPI,
  AppointmentsAPI,
  BlockTimeAPI,
  MembershipAPI,
  PackagesAPI,
  ClientWalletAPI,
  ClientsAPI,
  RewardPointsAPI,
} from "@/lib/api"
import { previewRedemptionLive } from "@/lib/reward-points-preview"
import {
  mergePaymentConfiguration,
  eligibleRedemptionSubtotal,
} from "@/lib/payment-redemption-eligibility"
import type { RewardPointsSettings } from "@/lib/api"
import { clientStore, type Client } from "@/lib/client-store"
import { MultiStaffSelector, type StaffContribution } from "@/components/ui/multi-staff-selector"
import { getLinePreTaxTotal } from "@/lib/staff-line-revenue"
import { TaxCalculator, createTaxCalculator, type TaxSettings, type BillItem } from "@/lib/tax-calculator"
import { computeMembershipPlanLineTotal } from "@/lib/membership-tax"
import { computePackageLineTotal } from "@/lib/package-tax"
import { useRouter } from "next/navigation"
import { formatPaymentRecordedDateLabel, getSalePaymentLinesWithDates } from "@/lib/sale-payment-lines"
import {
  decodeQuickSaleAppointmentParam,
  extractAppointmentIdsFromPayload,
  resolveAppointmentIdsToComplete,
} from "@/lib/quick-sale-helpers"
import type { ClientWalletLedgerRow } from "@/lib/client-wallet-ledger"
import { flattenClientWalletLedger, walletActivityStatusDisplay } from "@/lib/client-wallet-ledger"

// Mock data for customers
// const mockCustomers = [
//   {
//     id: "1",
//     name: "Shubham Anand",
//     phone: "6360019041",
//     email: "shubham@example.com",
//     status: "active",
//     visits: 12,
//     totalSpent: 15600,
//     lastVisit: "2024-01-25",
//     bills: [
//       {
//         id: "R001",
//         date: "2024-01-25",
//         time: "14:30",
//         total: 850,
//         paymentMethod: "Cash",
//         items: [
//           { name: "Hair Cut", price: 500, staff: "John Doe" },
//           { name: "Hair Wash", price: 200, staff: "John Doe" },
//           { name: "Hair Oil", price: 150, staff: "John Doe" },
//         ],
//         notes: "Regular customer, prefers short cut",
//       },
//       {
//         id: "R002",
//         date: "2024-01-10",
//         time: "16:15",
//         total: 1200,
//         paymentMethod: "Card",
//         items: [
//           { name: "Hair Cut", price: 500, staff: "Jane Smith" },
//           { name: "Beard Trim", price: 300, staff: "Jane Smith" },
//           { name: "Face Massage", price: 400, staff: "Jane Smith" },
//         ],
//         notes: "Requested specific styling",
//       },
//     ],
//   },
//   {
//     id: "2",
//     name: "Priya Sharma",
//     phone: "9876543210",
//     email: "priya@example.com",
//     status: "active",
//     visits: 8,
//     totalSpent: 12400,
//     lastVisit: "2024-01-20",
//     bills: [],
//   },
//   {
//     id: "3",
//     name: "Rahul Kumar",
//     phone: "8765432109",
//     email: "rahul@example.com",
//     status: "inactive",
//     visits: 3,
//     totalSpent: 2100,
//     lastVisit: "2023-12-15",
//     bills: [],
//   },
// ]

// Mock data for services and products
// const mockServices = [
//   { id: "1", name: "Hair Cut", price: 500, duration: 30 },
//   { id: "2", name: "Hair Wash", price: 200, duration: 15 },
//   { id: "3", name: "Beard Trim", price: 300, duration: 20 },
//   { id: "4", name: "Face Massage", price: 400, duration: 45 },
// ]

// const mockProducts = [
//   { id: "1", name: "Hair Oil", price: 150, stock: 25 },
//   { id: "2", name: "Shampoo", price: 250, stock: 15 },
//   { id: "3", name: "Hair Gel", price: 180, stock: 30 },
//   { id: "4", name: "Face Cream", price: 320, stock: 12 },
// ]

// interface CartItem {
//   id: string
//   name: string
//   price: number
//   quantity: number
//   type: "service" | "product"
// }

interface ServiceItem {
  id: string
  serviceId: string
  staffId: string // Legacy field for backward compatibility
  staffContributions?: Array<{
    staffId: string
    staffName: string
    percentage: number
    amount: number
  }>
  quantity: number
  price: number
  discount: number
  total: number
  isMembershipFree?: boolean
  membershipDiscountPercent?: number
  /** Covered by prepaid package — show 100% discount, not ₹0 list price with 0% off */
  isPackageRedemption?: boolean
}

interface ProductItem {
  id: string
  productId: string
  staffId: string
  quantity: number
  price: number
  discount: number
  total: number
}

interface MembershipItem {
  id: string
  planId: string
  planName: string
  price: number
  durationInDays: number
  quantity: number
  total: number
  staffId: string
}

interface PackageItem {
  id: string
  packageId: string
  packageName: string
  totalSittings: number
  price: number
  quantity: number
  total: number
  staffId: string
}

/** Client prepaid wallet plan sold as a POS line (same bill as services/products). */
interface PrepaidPlanItem {
  id: string
  planId: string
  planName: string
  creditAmount: number
  validityDays: number
  staffId: string
  quantity: number
  price: number
  total: number
}

type BillingMode = "create" | "edit" | "exchange"

function isLikelyMongoObjectId(id: string | null | undefined): boolean {
  return !!id && /^[a-f\d]{24}$/i.test(String(id))
}

/** Unique staff names on a sale (header + line items + multi-staff contributions). */
function collectStaffNamesFromSale(sale: any): string {
  const names = new Set<string>()
  const add = (s: unknown) => {
    const t = String(s ?? "").trim()
    if (t && t.toLowerCase() !== "unassigned staff") names.add(t)
  }
  add(sale?.staffName)
  for (const it of sale?.items || []) {
    add(it?.staffName)
    for (const sc of it?.staffContributions || []) add(sc?.staffName)
  }
  return names.size > 0 ? [...names].join(", ") : "—"
}

/** Bill number for `/billing/[billNo]` (same editor as Reports → Edit bill). */
function quickSaleBillNoForBillingRoute(bill: {
  receiptNumber?: string
  billNo?: string
  id?: string
}) {
  return String(bill.receiptNumber ?? bill.billNo ?? bill.id ?? "").trim()
}

function mapSaleToCustomerBill(sale: any) {
  return {
    id: sale._id || sale.id,
    receiptNumber: sale.billNo,
    date: sale.date,
    time: sale.time || "00:00",
    total: sale.grossTotal || sale.netTotal || 0,
    payments:
      sale.payments || [
        {
          type: String(sale.paymentMode || "cash").toLowerCase(),
          amount: sale.grossTotal || sale.netTotal || 0,
        },
      ],
    paymentHistory: sale.paymentHistory || [],
    items: sale.items || [],
    notes: sale.notes || "",
    clientName: sale.customerName,
    staffName: sale.staffName || "Unassigned Staff",
    staffNames: collectStaffNamesFromSale(sale),
    isEdited: sale.isEdited,
    editedAt: sale.editedAt,
  }
}

/** Parse time string (e.g. "HH:mm", "9:00am") to minutes since midnight */
function parseTimeToMinutes(time: string): number {
  if (!time) return 0
  const cleaned = time.replace(/\s*(am|pm)/i, "").trim()
  const parts = cleaned.split(":")
  const h = parseInt(parts[0] || "0", 10)
  const m = parseInt(parts[1] || "0", 10)
  const isPm = /pm/i.test(time) && h < 12
  const hour = isPm ? h + 12 : /am/i.test(time) && h === 12 ? 0 : h
  return hour * 60 + m
}

/** Check if a block time applies on the given date (handles recurring) */
function blockAppliesOnDate(block: { startDate: string; endDate?: string | null; recurringFrequency?: string }, dateStr: string): boolean {
  const rec = block.recurringFrequency || "none"
  if (rec === "none") return block.startDate === dateStr
  const end = block.endDate
  if (!end || dateStr < block.startDate || dateStr > end) return false
  if (rec === "daily") return true
  if (rec === "weekly") {
    return new Date(block.startDate + "T00:00:00").getDay() === new Date(dateStr + "T00:00:00").getDay()
  }
  if (rec === "monthly") {
    return new Date(block.startDate + "T00:00:00").getDate() === new Date(dateStr + "T00:00:00").getDate()
  }
  return false
}

/** Get staff IDs that are available for a slot [startM, startM + duration] on dateStr.
 * When considerAllAppointments is true (from linked appointment), check all non-cancelled appointments for conflicts.
 * For walk-in QuickSale: "arrived" and "service_started" do NOT block - staff may have rest periods or gaps where they can take other work. */
function getAvailableStaffIds(
  dateStr: string,
  timeStr: string,
  durationMinutes: number,
  appointments: any[],
  blockTimes: any[],
  allStaffIds: string[],
  considerAllAppointments = false
): string[] {
  const startM = parseTimeToMinutes(timeStr)
  const endM = startM + durationMinutes
  const busyStaffIds = new Set<string>()

  for (const apt of appointments) {
    if (apt.status === "cancelled") continue
    // For walk-in QuickSale, don't block by appointments - staff can take other work during rest periods or gaps.
    if (!considerAllAppointments) continue
    const aptStartM = parseTimeToMinutes(apt.time || "0:00")
    const aptDuration = apt.duration ?? 60
    const aptEndM = aptStartM + aptDuration
    if (aptEndM <= startM || aptStartM >= endM) continue // no overlap
    const staffId = apt.staffId?._id || apt.staffId?.id || apt.staffId
    if (staffId) busyStaffIds.add(String(staffId))
    for (const a of apt.staffAssignments || []) {
      const sid = a.staffId?._id || a.staffId?.id || a.staffId
      if (sid) busyStaffIds.add(String(sid))
    }
  }

  // Block times that apply on this date
  for (const block of blockTimes) {
    if (!blockAppliesOnDate(block, dateStr)) continue
    const blockStaffId = block.staffId?._id || block.staffId?.id || block.staffId
    if (!blockStaffId) continue
    const blockStartM = parseTimeToMinutes(block.startTime || "0:00")
    const blockEndM = parseTimeToMinutes(block.endTime || "23:59")
    if (blockEndM <= startM || blockStartM >= endM) continue
    busyStaffIds.add(String(blockStaffId))
  }

  return allStaffIds.filter((id) => !busyStaffIds.has(String(id)))
}

function walletExpiryEndMs(w: any): number {
  const raw = w?.effectiveExpiryDate ?? w?.expiryDate
  if (!raw) return 0
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

function pickWalletIdForChangeCredit(usableWallets: any[], selectedWalletId: string): string | null {
  if (!usableWallets?.length) return null
  if (selectedWalletId) {
    const hit = usableWallets.find((w) => String(w._id) === String(selectedWalletId))
    if (hit) return String(hit._id)
  }
  const sorted = [...usableWallets].sort((a, b) => walletExpiryEndMs(a) - walletExpiryEndMs(b))
  return sorted[0] ? String(sorted[0]._id) : null
}

/** When customer overpays and change is credited to wallet, trim recorded payments to sale due total (cash → card → online). */
function buildRecordedPaymentsForCheckout(options: {
  cashAmount: number
  cardAmount: number
  onlineAmount: number
  walletPayAmount: number
  saleDueTotal: number
  creditOverpaymentToWallet: boolean
}): {
  payments: PaymentMethod[]
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
    const out: PaymentMethod[] = []
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

/**
 * Active prepaid wallets with usable balance for Quick Sale (payment picker + header balance).
 * Uses effective or plan expiry, case-insensitive status, and a short grace window for clock/API skew.
 */
function filterWalletsForQuickSaleDisplay(wallets: any[] | undefined, nowMs: number = Date.now()): any[] {
  if (!wallets?.length) return []
  const GRACE_MS = 120_000
  return wallets.filter((w) => {
    if (String(w.status || "").toLowerCase() !== "active") return false
    if (Number(w.remainingBalance) <= 0) return false
    const end = walletExpiryEndMs(w)
    if (!end) return false
    return end >= nowMs - GRACE_MS
  })
}

/** Prefer soonest-expiring wallet so staff rarely need to pick when multiple exist. */
function pickDefaultClientWalletId(wallets: any[]): string {
  if (!wallets?.length) return ""
  const sorted = [...wallets].sort((a, b) => walletExpiryEndMs(a) - walletExpiryEndMs(b))
  return String(sorted[0]._id)
}

/** Single display row for combined-wallet mode; redeem still uses primary _id + server FIFO. */
function buildCombinedQuickSaleWalletRow(usable: any[]) {
  const sorted = [...usable].sort((a, b) => walletExpiryEndMs(a) - walletExpiryEndMs(b))
  const sum = sorted.reduce((s, w) => s + (Number(w.remainingBalance) || 0), 0)
  const primary = sorted[0]
  return {
    ...primary,
    _id: primary._id,
    remainingBalance: sum,
    effectiveExpiryDate: primary.effectiveExpiryDate,
    planSnapshot: {
      ...(primary.planSnapshot || {}),
      planName: "Combined prepaid balance",
    },
    _combinedSources: sorted,
  }
}

/** Bill activity list: "dd MMM yyyy · HH:mm" (uses bill.time when parseable, else from date). */
function formatCustomerBillDateTimeLine(bill: { date?: string; time?: string }): string {
  const d = bill.date ? new Date(bill.date) : null
  if (!d || Number.isNaN(d.getTime())) {
    return [bill.date, bill.time].filter(Boolean).join(" · ") || "—"
  }
  const dateStr = format(d, "dd MMM yyyy")
  const rawT = bill.time != null ? String(bill.time).trim() : ""
  let timeStr: string
  if (rawT) {
    const m = rawT.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
    timeStr = m ? `${m[1].padStart(2, "0")}:${m[2]}` : rawT
  } else {
    timeStr = format(d, "HH:mm")
  }
  return `${dateStr} · ${timeStr}`
}

interface QuickSaleProps {
  mode?: BillingMode
  initialSale?: any
  billLoading?: boolean
}

export function QuickSale({ mode = "create", initialSale, billLoading = false }: QuickSaleProps = {}) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null)
  const [linkedAppointmentIds, setLinkedAppointmentIds] = useState<string[]>([])
  const [linkedAppointmentTime, setLinkedAppointmentTime] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Client | null>(null)
  const [customerSearch, setCustomerSearch] = useState("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([])
  /** Set after computeLineTotalAndTax each render; membership effect reads .current after paint. */
  const applyMembershipPricingRef = useRef<(items: ServiceItem[]) => ServiceItem[]>((items) => items)
  const [productItems, setProductItems] = useState<ProductItem[]>([])
  const [discountValue, setDiscountValue] = useState(0)
  const [discountPercentage, setDiscountPercentage] = useState(0)
  const [giftVoucher, setGiftVoucher] = useState("")
  const [tip, setTip] = useState(0)
  const [tipStaffId, setTipStaffId] = useState<string | null>(null)
  const [isGlobalDiscountActive, setIsGlobalDiscountActive] = useState(false)
  const [isValueDiscountActive, setIsValueDiscountActive] = useState(false)
  const [cashAmount, setCashAmount] = useState(0)
  const [cardAmount, setCardAmount] = useState(0)
  const [onlineAmount, setOnlineAmount] = useState(0)
  /** Client prepaid wallet (salon service credit) applied toward this bill */
  const [walletPayAmount, setWalletPayAmount] = useState(0)
  const [selectedWalletId, setSelectedWalletId] = useState<string>("")
  const [rewardPointsSettings, setRewardPointsSettings] = useState<RewardPointsSettings | null>(null)
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState(0)
  /** When wallet and reward cannot stack, user picks one redemption method for this bill. */
  const [exclusiveRedemptionMethod, setExclusiveRedemptionMethod] = useState<"wallet" | "reward" | null>(null)
  const [clientWalletsRaw, setClientWalletsRaw] = useState<any[]>([])
  const [clientWalletSettings, setClientWalletSettings] = useState<{
    allowCouponStacking?: boolean
    combineMultipleWallets?: boolean
  } | null>(null)
  /** Prepaid wallet plans — loaded when "Add Prepaid Plans" panel is open */
  const [prepaidWalletPlansForIssue, setPrepaidWalletPlansForIssue] = useState<any[]>([])
  const [loadingPrepaidWalletPlans, setLoadingPrepaidWalletPlans] = useState(false)
  const [prepaidPlanItems, setPrepaidPlanItems] = useState<PrepaidPlanItem[]>([])
  const [walletLedgerOpen, setWalletLedgerOpen] = useState(false)
  const [walletLedgerLoading, setWalletLedgerLoading] = useState(false)
  const [walletLedgerRows, setWalletLedgerRows] = useState<ClientWalletLedgerRow[]>([])
  const [remarks, setRemarks] = useState("")
  const [isOldQuickSale, setIsOldQuickSale] = useState(false)
  const [currentReceipt, setCurrentReceipt] = useState<any | null>(null)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  /** After checkout: in-modal receipt + timed redirect (replaces opening /receipt in a new tab). */
  const [postPaymentModal, setPostPaymentModal] = useState<{
    receipt: any
    returnPath: string
  } | null>(null)
  /** Bill activity panel: Eye opens same ReceiptPreview as post-checkout "View invoice", not /receipt. */
  const [historyInvoicePreviewOpen, setHistoryInvoicePreviewOpen] = useState(false)
  const [historyInvoicePreviewReceipt, setHistoryInvoicePreviewReceipt] = useState<ReceiptRecord | null>(null)
  const [historyInvoicePreviewSettings, setHistoryInvoicePreviewSettings] = useState<any>(null)
  const [historyInvoicePreviewLoading, setHistoryInvoicePreviewLoading] = useState(false)
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Search states for service items dropdown
  const [serviceDropdownSearch, setServiceDropdownSearch] = useState("")
  const [productDropdownSearch, setProductDropdownSearch] = useState("")
  const [activeServiceDropdown, setActiveServiceDropdown] = useState<string | null>(null)
  const [activeProductDropdown, setActiveProductDropdown] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false)
  /** Side panel: notes (default) vs bill list — inline next to snapshot, no modal */
  const [billActivityModalTab, setBillActivityModalTab] = useState<"notes" | "bills">("notes")
  const [customerBills, setCustomerBills] = useState<any[]>([])
  const [customerBillsLoading, setCustomerBillsLoading] = useState(false)
  const [showDuesDialog, setShowDuesDialog] = useState(false)
  const [unpaidBills, setUnpaidBills] = useState<any[]>([])
  const [showDuesPaymentModal, setShowDuesPaymentModal] = useState(false)
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<any>(null)
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  })
  const customerSearchRef = useRef<HTMLDivElement>(null)
  /** Measured height of the Customer Snapshot card — side panel matches this when visible (md+ row). */
  const customerSnapshotCardRef = useRef<HTMLDivElement>(null)
  const [snapshotSidePanelHeightPx, setSnapshotSidePanelHeightPx] = useState<number | null>(null)
  const [showBillDetailsDialog, setShowBillDetailsDialog] = useState(false)
  const [selectedBill, setSelectedBill] = useState<any>(null)
  const [confirmUnpaid, setConfirmUnpaid] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCreditChangeConfirm, setShowCreditChangeConfirm] = useState(false)
  /** When opening wallet-change confirm from edit-reason dialog, pass reason into checkout */
  const [creditCheckoutReasonOverride, setCreditCheckoutReasonOverride] = useState<string | null>(null)
  const [showTipModal, setShowTipModal] = useState(false)
  const [tempTipAmount, setTempTipAmount] = useState(0)
  const [editReason, setEditReason] = useState("")
  const [showEditReasonModal, setShowEditReasonModal] = useState(false)
  const [tempEditReason, setTempEditReason] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)

  // Membership state (for customer with active membership)
  const [membershipData, setMembershipData] = useState<{
    subscription: any
    plan: any
    usageSummary: Array<{ serviceId: string; serviceName: string; used: number; limit: number; remaining: number }>
  } | null>(null)

  // Plans for membership section (fetched when customer selected)
  const [plans, setPlans] = useState<Array<{ _id: string; id?: string; planName: string; price: number; durationInDays: number }>>([])

  // Add Items section: membership | package | gift-voucher | prepaid (none selected by default)
  const [addItemSection, setAddItemSection] = useState<'gift-voucher' | 'prepaid' | null>(null)

  // Membership items (rows added from Membership section)
  const [membershipItems, setMembershipItems] = useState<MembershipItem[]>([])
  const [packageItems, setPackageItems] = useState<PackageItem[]>([])
  const [packagesCatalog, setPackagesCatalog] = useState<any[]>([])
  /** Set when opening Quick Sale from client panel package redemption; triggers post-checkout redeem API. */
  const [pendingPackageRedemption, setPendingPackageRedemption] = useState<{
    clientPackageId: string
    serviceIds: string[]
  } | null>(null)

  // State for services and products from API
  const [services, setServices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [businessSettings, setBusinessSettings] = useState<any>(null)
  const [posSettings, setPOSSettings] = useState<any>(null)
  const [paymentSettings, setPaymentSettings] = useState<any>(null)

  // Filtered services and products for dropdown search (search by name or category)
  const filteredServicesForDropdown = services.filter(service => {
    const q = serviceDropdownSearch.toLowerCase().trim()
    if (!q) return true
    const nameMatch = service.name?.toLowerCase().includes(q)
    const categoryMatch = service.category?.toLowerCase().includes(q)
    return nameMatch || categoryMatch
  })

  // Group filtered services by category for dropdown display
  const servicesByCategory = filteredServicesForDropdown.reduce<Record<string, typeof filteredServicesForDropdown>>((acc, service) => {
    const cat = service.category?.trim() || "Uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(service)
    return acc
  }, {})
  const categoryOrder = Object.keys(servicesByCategory).sort((a, b) => a.localeCompare(b))

  // Filtered products (search by name or category)
  const filteredProductsForDropdown = products.filter(product => {
    const q = productDropdownSearch.toLowerCase().trim()
    if (!q) return true
    const nameMatch = product.name?.toLowerCase().includes(q)
    const categoryMatch = product.category?.toLowerCase().includes(q)
    return nameMatch || categoryMatch
  })

  // Group filtered products by category for dropdown display
  const productsByCategory = filteredProductsForDropdown.reduce<Record<string, typeof filteredProductsForDropdown>>((acc, product) => {
    const cat = product.category?.trim() || "Uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(product)
    return acc
  }, {})
  const productCategoryOrder = Object.keys(productsByCategory).sort((a, b) => a.localeCompare(b))

  // Add item to cart function
  const addToCart = (item: any, type: "service" | "product") => {
    const priceInclusiveOfTax = paymentSettings?.priceInclusiveOfTax !== false
    const computeLineTotalAndTaxForAdd = (
      baseAmount: number,
      discountPct: number,
      taxRate: number,
      applyTax: boolean
    ): number => {
      const discountedAmount = baseAmount * (1 - (discountPct || 0) / 100)
      if (!applyTax) return discountedAmount
      if (priceInclusiveOfTax) return discountedAmount
      return discountedAmount + (discountedAmount * taxRate) / 100
    }

    if (type === "service") {
      const basePrice = item.price || 0
      let discount = 0
      let total = basePrice
      let isMembershipFree = false
      let membershipDiscountPercent = 0

      if (membershipData?.plan && membershipData?.usageSummary) {
        const svcId = String(item._id || item.id)
        const usage = membershipData.usageSummary.find((u: any) => String(u.serviceId || u.serviceId?._id) === svcId)
        const plan = membershipData.plan
        if (usage && usage.remaining > 0) {
          discount = 100
          total = 0
          isMembershipFree = true
          membershipDiscountPercent = 100
        } else if (plan?.discountPercentage > 0) {
          discount = plan.discountPercentage
          membershipDiscountPercent = plan.discountPercentage
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = item.taxApplicable && taxSettings?.enableTax !== false
          total = computeLineTotalAndTaxForAdd(basePrice, discount, serviceTaxRate, applyTax)
        }
      } else {
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = item.taxApplicable && taxSettings?.enableTax !== false
        total = computeLineTotalAndTaxForAdd(basePrice, 0, serviceTaxRate, applyTax)
      }

      const newItem: ServiceItem = {
        id: Date.now().toString(),
        serviceId: item._id || item.id,
        staffId: "",
        quantity: 1,
        price: basePrice,
        discount,
        total,
        isMembershipFree,
        membershipDiscountPercent,
      }
      setServiceItems([...serviceItems, newItem])
    } else if (type === "product") {
      const basePrice = item.price || 0
      const productForTax = products.find((p) => (p._id || p.id) === (item._id || item.id)) || item
      let productTaxRate = 18
      if (productForTax?.taxCategory && taxSettings) {
        switch (productForTax.taxCategory) {
          case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
          case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
          case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
          case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
          case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
        }
      }
      const applyTax = taxSettings?.enableTax !== false
      const total = computeLineTotalAndTaxForAdd(basePrice, 0, productTaxRate, applyTax)
      const newItem: ProductItem = {
        id: Date.now().toString(),
        productId: item._id || item.id,
        staffId: "",
        quantity: 1,
        price: basePrice,
        discount: 0,
        total,
      }
      setProductItems([...productItems, newItem])
    }
    
    // Clear search after adding
          // Clear search when item is added
          if (type === "service") {
            setServiceDropdownSearch("")
          } else {
            setProductDropdownSearch("")
          }
  }
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null)
  const [taxCalculator, setTaxCalculator] = useState<TaxCalculator | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [loadingClients, setLoadingClients] = useState(true)
  const [catalogLoadError, setCatalogLoadError] = useState(false)
  const [catalogRetryKey, setCatalogRetryKey] = useState(0)
  const [appointmentsForDate, setAppointmentsForDate] = useState<any[]>([])
  const [blockTimesForDate, setBlockTimesForDate] = useState<any[]>([])
  const [, setTimeTick] = useState(0)

  // Refresh availability every minute (billing uses current time)
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  // Close service/product dropdowns when clicking outside
  useEffect(() => {
    if (!activeServiceDropdown && !activeProductDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (target instanceof Element && target.closest('[data-quicksale-dropdown]')) return
      setActiveServiceDropdown(null)
      setActiveProductDropdown(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [activeServiceDropdown, activeProductDropdown])

  const dateStr = format(selectedDate, "yyyy-MM-dd")
  const currentTimeStr = format(new Date(), "HH:mm")
  const allStaffIds = staff.map((s) => String(s._id || s.id)).filter(Boolean)

  /** Available staff for a given duration. When from linked appointment, uses appointment time + offset and considers all appointments. */
  const getAvailableStaffForSlot = (
    durationMinutes: number,
    slotTimeStr?: string,
    slotDateStr?: string,
    considerAll = false
  ) => {
    return getAvailableStaffIds(
      slotDateStr ?? dateStr,
      slotTimeStr ?? currentTimeStr,
      durationMinutes,
      appointmentsForDate,
      blockTimesForDate,
      allStaffIds,
      considerAll
    )
  }

  /** Staff list filtered by availability. Services are sequential: Service 0 at base, Service 1 at base+dur0, Service 2 at base+dur0+dur1, etc. */
  const getAvailableStaffList = (
    durationMinutes: number,
    includeIds?: string[],
    serviceIndex?: number
  ) => {
    let slotTimeStr = currentTimeStr
    let considerAll = false
    const baseTime = linkedAppointmentTime ?? currentTimeStr
    if (serviceIndex != null) {
      if (serviceIndex === 0) {
        slotTimeStr = baseTime
      } else {
        let cumulativeM = 0
        for (let i = 0; i < serviceIndex; i++) {
          const item = serviceItems[i]
          const raw = item?.serviceId
        const sid = typeof raw === "object" && raw && "_id" in raw ? (raw as { _id: string })._id : raw
          const svc = sid ? services.find((s) => (s._id || s.id) === sid) : null
          cumulativeM += svc?.duration ?? 60
        }
        const baseM = parseTimeToMinutes(baseTime)
        const slotM = baseM + cumulativeM
        slotTimeStr = `${Math.floor(slotM / 60)}:${String(slotM % 60).padStart(2, "0")}`
      }
    }
    if (linkedAppointmentId && linkedAppointmentTime) considerAll = true
    const availableIds = getAvailableStaffForSlot(durationMinutes, slotTimeStr, dateStr, considerAll)
    const includeSet = new Set(includeIds?.map(String) || [])
    const dayOfWeek = selectedDate.getDay() // 0 = Sunday, 6 = Saturday
    return staff.filter((s) => {
      const id = String(s._id || s.id)
      // Exclude staff marked as absent (Full Day Off) for this day in work schedule
      const daySchedule = (s.workSchedule || []).find((d: { day: number; enabled?: boolean }) => d.day === dayOfWeek)
      if (daySchedule && daySchedule.enabled === false) return false
      return availableIds.includes(id) || includeSet.has(id)
    })
  }

  // Fetch services, products, staff, clients, and business settings from API
  useEffect(() => {
    setCatalogLoadError(false)

    const fetchServices = async () => {
      try {
        console.log('Fetching services from API...')
        const response = await ServicesAPI.getAll({ limit: 1000 }) // Fetch up to 1000 services
        console.log('Services API response:', response)
        if (response.success) {
          setServices(response.data || [])
          console.log('Services loaded:', response.data?.length || 0)
        }
      } catch (error: any) {
        console.error('Failed to fetch services:', error)
        const st = error?.response?.status
        if (st !== 401 && st !== 403) setCatalogLoadError(true)
      } finally {
        setLoadingServices(false)
      }
    }

    const fetchProducts = async () => {
      try {
        console.log('Fetching products from API...')
        const response = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
        console.log('Products API response:', response)
        if (response.success) {
          // Filter out service-only products (only show retail and both)
          const sellableProducts = (response.data || []).filter((product: any) => {
            const productType = product.productType || 'retail'
            return productType === 'retail' || productType === 'both'
          })
          setProducts(sellableProducts)
          console.log('Products loaded:', response.data?.length || 0)
          console.log('Sellable products (retail + both):', sellableProducts.length)
        } else {
          console.log('Products API returned unsuccessful response:', response)
          setProducts([])
        }
      } catch (error) {
        console.error('Failed to fetch products:', error)
        setProducts([]) // Ensure products array is empty on error
      } finally {
        setLoadingProducts(false)
      }
    }

    const fetchStaff = async () => {
      try {
        console.log('Fetching staff from API...')
        const response = await StaffDirectoryAPI.getAll()
        console.log('Staff API response:', response)
        if (response.success) {
          // Filter for active staff members with appointment scheduling enabled
          const staffMembers = response.data.filter((user: any) => {
            const hasValidId = user._id || user.id
            const isActiveStaff = (user.role === 'staff' || user.role === 'manager' || user.role === 'admin') && 
              user.isActive === true && 
              user.allowAppointmentScheduling === true
            console.log(`User ${user.name}: ID=${hasValidId}, Active=${isActiveStaff}, AppointmentScheduling=${user.allowAppointmentScheduling}`)
            return hasValidId && isActiveStaff
          })
          setStaff(staffMembers)
          console.log('Active staff loaded:', staffMembers.length)
          console.log('Active staff members:', staffMembers.map(s => ({ name: s.name, id: s._id || s.id, allowAppointmentScheduling: s.allowAppointmentScheduling })))
        } else {
          console.error('Staff API returned error:', response.error)
        }
      } catch (error: any) {
        console.error('Failed to fetch staff:', error)
        const st = error?.response?.status
        if (st !== 401 && st !== 403) setCatalogLoadError(true)
      } finally {
        setLoadingStaff(false)
      }
    }

    const fetchBusinessSettings = async () => {
      try {
        console.log('Fetching business settings from API...')
        const response = await SettingsAPI.getBusinessSettings()
        console.log('Business settings API response:', response)
        if (response.success) {
          setBusinessSettings(response.data)
          console.log('Business settings loaded:', response.data)
        }
      } catch (error) {
        console.error('Failed to fetch business settings:', error)
      }
    }

    const fetchPOSSettings = async () => {
      try {
        console.log('Fetching POS settings from API...')
        const response = await SettingsAPI.getPOSSettings()
        console.log('POS settings API response:', response)
        if (response.success) {
          setPOSSettings(response.data)
          console.log('POS settings loaded:', response.data)
          console.log('Invoice prefix from POS settings:', response.data.invoicePrefix)
        } else {
          console.error('POS settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch POS settings:', error)
      }
    }

    const fetchPaymentSettings = async () => {
      try {
        console.log('Fetching payment settings from API...')
        const response = await SettingsAPI.getPaymentSettings()
        console.log('Payment settings API response:', response)
        if (response.success) {
          setPaymentSettings(response.data)
          console.log('Payment settings loaded:', response.data)
        } else {
          console.error('Payment settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch payment settings:', error)
      }
    }

    const fetchTaxSettings = async () => {
      try {
        console.log('Fetching tax settings from API...')
        const response = await SettingsAPI.getPaymentSettings()
        console.log('Tax settings API response:', response)
        if (response.success) {
          const taxSettingsData: TaxSettings = {
            enableTax: response.data.enableTax !== false,
            taxType: response.data.taxType || 'gst',
            serviceTaxRate: response.data.serviceTaxRate || 5,
            membershipTaxRate:
              response.data.membershipTaxRate ?? response.data.serviceTaxRate ?? 5,
            packageTaxRate: response.data.packageTaxRate ?? response.data.serviceTaxRate ?? 5,
            prepaidWalletTaxRate:
              response.data.prepaidWalletTaxRate ?? response.data.serviceTaxRate ?? 5,
            essentialProductRate: response.data.essentialProductRate || 5,
            intermediateProductRate: response.data.intermediateProductRate || 12,
            standardProductRate: response.data.standardProductRate || 18,
            luxuryProductRate: response.data.luxuryProductRate || 28,
            exemptProductRate: response.data.exemptProductRate || 0,
            cgstRate: response.data.cgstRate || 9,
            sgstRate: response.data.sgstRate || 9,
          }
          setTaxSettings(taxSettingsData)
          setTaxCalculator(createTaxCalculator(taxSettingsData))
          console.log('Tax settings loaded:', taxSettingsData)
        } else {
          console.error('Tax settings API returned error:', response.error)
        }
      } catch (error) {
        console.error('Failed to fetch tax settings:', error)
      }
    }

    const fetchClients = async () => {
      try {
        console.log('Fetching clients from API...')
        await clientStore.loadClients()
        const allClients = clientStore.getClients()
        setClients(allClients)
        console.log('Clients loaded:', allClients.length)
      } catch (error) {
        console.error('Failed to fetch clients:', error)
      } finally {
        setLoadingClients(false)
      }
    }

    const fetchPackagesCatalog = async () => {
      try {
        const response = await PackagesAPI.getAll({ status: "ACTIVE", limit: 500 })
        if (response.success) {
          setPackagesCatalog(response.data?.packages || [])
        }
      } catch (error) {
        console.error('Failed to fetch packages:', error)
      }
    }

    fetchServices()
    fetchProducts()
    fetchPackagesCatalog()
    fetchStaff()
    fetchBusinessSettings()
    fetchPOSSettings()
    fetchPaymentSettings()
    fetchTaxSettings()
    fetchClients()
  }, [catalogRetryKey])

  // Fetch appointments and block times for selected date (for staff availability)
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    let cancelled = false
    const load = async () => {
      try {
        const [aptRes, blockRes] = await Promise.all([
          AppointmentsAPI.getAll({ date: dateStr, limit: 500 }),
          BlockTimeAPI.getAll({ startDate: dateStr, endDate: dateStr }),
        ])
        if (cancelled) return
        setAppointmentsForDate(aptRes?.success && aptRes?.data ? aptRes.data : [])
        setBlockTimesForDate(blockRes?.success && blockRes?.data ? blockRes.data : [])
      } catch (e) {
        if (!cancelled) {
          setAppointmentsForDate([])
          setBlockTimesForDate([])
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedDate])

  // Subscribe to client store changes
  useEffect(() => {
    const unsubscribe = clientStore.subscribe(() => {
      const updatedClients = clientStore.getClients()
      setClients(updatedClients)
    })

    return unsubscribe
  }, [])

  // Initialize from initialSale when in edit/exchange mode
  // Use loading flags (not length checks) so initialization runs even when business has empty catalogs
  useEffect(() => {
    const catalogsLoaded = !loadingServices && !loadingProducts && !loadingStaff && !loadingClients
    if ((mode === "edit" || mode === "exchange") && initialSale && !isInitialized && catalogsLoaded) {
      console.log("Initializing QuickSale from initialSale:", initialSale)
      
      // Set customer
      if (initialSale.customerId || initialSale.customerName) {
        const customer = clients.find(c => 
          (c._id || c.id) === initialSale.customerId ||
          c.name === initialSale.customerName
        )
        if (customer) {
          setSelectedCustomer(customer)
          setCustomerSearch(customer.name)

          // Fetch and populate real stats (visits, revenue, last visit, dues)
          const customerId = getCustomerId(customer)
          if (customerId) {
            fetchCustomerStats(customerId)
          }
        } else if (initialSale.customerName) {
          // Create a temporary client object if not found
          setSelectedCustomer({
            _id: initialSale.customerId || "",
            id: initialSale.customerId || "",
            name: initialSale.customerName,
            phone: initialSale.customerPhone || "",
            email: initialSale.customerEmail || "",
          } as Client)
          setCustomerSearch(initialSale.customerName)
        }
      }

      // Set date
      if (initialSale.date) {
        setSelectedDate(new Date(initialSale.date))
      }

      // Set items
      const serviceItemsData: ServiceItem[] = []
      const productItemsData: ProductItem[] = []
      const prepaidPlanItemsData: PrepaidPlanItem[] = []

      if (initialSale.items && Array.isArray(initialSale.items)) {
        const normalizeId = (id: any) => (id != null ? String(id) : "")
        const normalizeName = (n: any) => (n || "").trim().toLowerCase()

        initialSale.items.forEach((item: any, index: number) => {
          if (item.type === "service") {
            const service = services.find(s =>
              normalizeId(s._id || s.id) === normalizeId(item.serviceId) ||
              normalizeName(s.name) === normalizeName(item.name)
            )
            if (service) {
              serviceItemsData.push({
                id: `service-${index}`,
                serviceId: service._id || service.id,
                staffId: item.staffId || "",
                staffContributions: item.staffContributions || [],
                quantity: item.quantity || 1,
                price: item.price || 0,
                discount: item.discount || 0,
                total: item.total || (item.price || 0) * (item.quantity || 1),
              })
            }
          } else if (item.type === "product") {
            const product = products.find(p =>
              normalizeId(p._id || p.id) === normalizeId(item.productId) ||
              normalizeName(p.name) === normalizeName(item.name)
            )
            if (product) {
              productItemsData.push({
                id: `product-${index}`,
                productId: product._id || product.id,
                staffId: item.staffId || "",
                quantity: item.quantity || 1,
                price: item.price || 0,
                discount: item.discount || 0,
                total: item.total || (item.price || 0) * (item.quantity || 1),
              })
            }
          } else if (item.type === "prepaid_wallet" || item.type === "prepaid") {
            const pid = item.prepaidPlanId ? normalizeId(item.prepaidPlanId) : ""
            prepaidPlanItemsData.push({
              id: `prepaid-${index}`,
              planId: pid,
              planName: String(item.name || "").replace(/^Prepaid wallet —\s*/i, "") || "",
              creditAmount: 0,
              validityDays: 0,
              staffId: item.staffId || "",
              quantity: item.quantity || 1,
              price: item.price || 0,
              total: item.total || (item.price || 0) * (item.quantity || 1),
            })
          }
        })
      }

      setServiceItems(serviceItemsData)
      setProductItems(productItemsData)
      setPrepaidPlanItems(prepaidPlanItemsData)

      // Set discount (percentage = global %, fixed = amount in currency)
      if (initialSale.discount && initialSale.discount > 0) {
        const dType = (initialSale.discountType || "percentage").toLowerCase()
        if (dType === "percentage") {
          // Sanity: percentage should be 0-100; if >100 likely legacy bug (amount stored as %)
          const val = Number(initialSale.discount)
          if (val <= 100) {
            setDiscountPercentage(val)
            setIsGlobalDiscountActive(true)
          } else {
            setDiscountValue(val)
            setIsValueDiscountActive(true)
          }
        } else {
          setDiscountValue(Number(initialSale.discount))
          setIsValueDiscountActive(true)
        }
      }

      // Set notes
      if (initialSale.notes) {
        setRemarks(initialSale.notes)
      }

      const lpInit = Number(initialSale.loyaltyPointsRedeemed) || 0
      const ldInit = Number(initialSale.loyaltyDiscountAmount) || 0
      if (lpInit > 0 || ldInit > 0) {
        setLoyaltyPointsInput(lpInit)
      }

      // Set payment amounts (if any)
      if (initialSale.payments && Array.isArray(initialSale.payments)) {
        let cash = 0
        let card = 0
        let online = 0
        
        initialSale.payments.forEach((payment: any) => {
          const mode = (payment.mode || payment.type || "").toLowerCase()
          const amount = payment.amount || 0
          if (mode.includes("cash")) cash += amount
          else if (mode.includes("card")) card += amount
          else if (mode.includes("online") || mode.includes("upi")) online += amount
        })
        
        setCashAmount(cash)
        setCardAmount(card)
        setOnlineAmount(online)
      }

      // Set tip amount and tip staff (if any)
      if (initialSale.tip && initialSale.tip > 0) {
        setTip(Number(initialSale.tip))
        const tipStaff = initialSale.tipStaffId
        const tipStaffIdStr = typeof tipStaff === "object" && tipStaff?._id ? tipStaff._id : String(tipStaff || "")
        if (tipStaffIdStr) {
          setTipStaffId(tipStaffIdStr)
        }
      }

      // Set linked appointment
      if (initialSale.appointmentId) {
        setLinkedAppointmentId(initialSale.appointmentId)
      }

      setIsInitialized(true)
      console.log("QuickSale initialized from initialSale")
    }
  }, [mode, initialSale, isInitialized, services, products, staff, clients, loadingServices, loadingProducts, loadingStaff, loadingClients])

  // Pre-fill form from appointment data in URL
  useEffect(() => {
    const appointmentParam = searchParams.get('appointment')
    if (!appointmentParam || services.length === 0 || clients.length === 0 || staff.length === 0) return

    const prefillAppointmentData = async () => {
      try {
        const rawAppointment = decodeQuickSaleAppointmentParam(appointmentParam)
        if (!rawAppointment) return
        console.log('Pre-filling from appointment:', rawAppointment)

        const { primaryId, linkedIds } = extractAppointmentIdsFromPayload(rawAppointment)
        if (primaryId) setLinkedAppointmentId(primaryId)
        if (linkedIds.length > 0) setLinkedAppointmentIds(linkedIds)

        const appointmentData = rawAppointment as any
        if (appointmentData.time) {
          setLinkedAppointmentTime(appointmentData.time)
        }

        // Find and set the client
        if (appointmentData.clientId) {
          const client = clients.find(c => c._id === appointmentData.clientId || c.id === appointmentData.clientId)
          if (client) {
            setSelectedCustomer(client)
            setCustomerSearch(client.name)
            console.log('Pre-filled client:', client.name)
            
            // Fetch customer statistics (visits, revenue, last visit)
            const customerId = client._id || client.id
            if (customerId) {
              await fetchCustomerStats(customerId)
              console.log('Fetched customer stats for pre-filled client')
            }
          } else if (appointmentData.clientName) {
            // Client not in list (e.g. from new appointment form before sync) - use passed data
            setSelectedCustomer({
              _id: appointmentData.clientId,
              id: appointmentData.clientId,
              name: appointmentData.clientName,
              phone: appointmentData.clientPhone || "",
              email: appointmentData.clientEmail || "",
            } as Client)
            setCustomerSearch(appointmentData.clientName)
          }
        }

        // Set date and notes from new appointment form
        if (appointmentData.date) {
          setSelectedDate(new Date(appointmentData.date))
        }
        if (appointmentData.notes) {
          setRemarks(appointmentData.notes)
        }

        // Find and add service(s) - support both single service (from calendar) and multiple (from new appointment form)
        const serviceItemsToAdd: ServiceItem[] = []

        if (appointmentData.services && Array.isArray(appointmentData.services) && appointmentData.services.length > 0) {
          // Multiple services from new appointment form
          for (const svcData of appointmentData.services) {
            const service = services.find(s =>
              (s._id || s.id) === svcData.serviceId
            )
            if (service) {
              const staffMember = staff.find(s =>
                (s._id || s.id) === svcData.staffId
              )
              serviceItemsToAdd.push({
                id: Date.now().toString() + Math.random(),
                serviceId: service._id || service.id,
                staffId: svcData.staffId || "",
                quantity: 1,
                price: svcData.price ?? service.price ?? 0,
                discount: 0,
                total: svcData.price ?? service.price ?? 0,
                staffContributions: (svcData.staffId && staffMember) ? [{
                  staffId: svcData.staffId,
                  staffName: staffMember.name || svcData.staffName || "",
                  percentage: 100,
                  amount: svcData.price ?? service.price ?? 0
                }] : []
              })
              console.log("Pre-filled service:", service.name)
            }
          }
        } else if (appointmentData.serviceId) {
          // Single service from calendar / existing appointment
          const service = services.find(s =>
            (s._id || s.id) === appointmentData.serviceId
          )
          if (service) {
            const staffMember = staff.find(s =>
              (s._id || s.id) === appointmentData.staffId
            )
            serviceItemsToAdd.push({
              id: Date.now().toString(),
              serviceId: service._id || service.id,
              staffId: appointmentData.staffId || "",
              quantity: 1,
              price: service.price || appointmentData.servicePrice || 0,
              discount: 0,
              total: service.price || appointmentData.servicePrice || 0,
              staffContributions: (appointmentData.staffId && staffMember) ? [{
                staffId: appointmentData.staffId,
                staffName: staffMember.name || appointmentData.staffName || "",
                percentage: 100,
                amount: service.price || appointmentData.servicePrice || 0
              }] : []
            })
            console.log("Pre-filled service:", service.name)
          }
        }

        if (serviceItemsToAdd.length > 0) {
          setServiceItems(serviceItemsToAdd)
        }

        // Clear the URL parameter after reading it
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('appointment')
          window.history.replaceState({}, '', url.toString())
        }
      } catch (error) {
        console.error('Failed to parse appointment data:', error)
      }
    }
    
    // Call the async function
    prefillAppointmentData()
  }, [searchParams, services, clients, staff])

  // Pre-fill form from lead data in URL
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    if (!leadParam || services.length === 0 || clients.length === 0 || staff.length === 0) return

    const prefillLeadData = async () => {
      try {
        // Decode the base64 lead data
        const leadData = JSON.parse(atob(leadParam))
        console.log('Pre-filling from lead:', leadData)

        // Try to find existing client by phone or name
        let client = clients.find(c => 
          c.phone === leadData.clientPhone || 
          c.name?.toLowerCase() === leadData.clientName?.toLowerCase()
        )

        if (client) {
          // Client exists, set it
          setSelectedCustomer(client)
          setCustomerSearch(client.name)
          console.log('Pre-filled existing client:', client.name)
          
          // Fetch customer statistics
          const customerId = client._id || client.id
          if (customerId) {
            await fetchCustomerStats(customerId)
            console.log('Fetched customer stats for pre-filled client')
          }
        } else {
          // Client doesn't exist, pre-fill the search with lead info
          setCustomerSearch(`${leadData.clientName} (${leadData.clientPhone})`)
          console.log('Pre-filled customer search with lead info')
        }

        // Add services from lead's interested services
        if (leadData.services && leadData.services.length > 0) {
          const serviceItemsToAdd: ServiceItem[] = []
          
          for (const serviceData of leadData.services) {
            const service = services.find(s => 
              (s._id || s.id) === serviceData.serviceId
            )
            
            if (service) {
              // Find staff member if available
              const staffMember = leadData.staffId 
                ? staff.find(s => (s._id || s.id) === leadData.staffId)
                : null
              
              const newServiceItem: ServiceItem = {
                id: Date.now().toString() + Math.random(),
                serviceId: service._id || service.id,
                staffId: leadData.staffId || "",
                quantity: 1,
                price: service.price || 0,
                discount: 0,
                total: service.price || 0,
                staffContributions: (leadData.staffId && staffMember) ? [{
                  staffId: leadData.staffId,
                  staffName: staffMember.name || '',
                  percentage: 100,
                  amount: service.price || 0
                }] : []
              }
              
              serviceItemsToAdd.push(newServiceItem)
              console.log('Pre-filled service:', service.name)
            }
          }
          
          if (serviceItemsToAdd.length > 0) {
            setServiceItems(serviceItemsToAdd)
          }
        }

        // Clear the URL parameter after reading it
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('lead')
          window.history.replaceState({}, '', url.toString())
        }
      } catch (error) {
        console.error('Failed to parse lead data:', error)
      }
    }
    
    // Call the async function
    prefillLeadData()
  }, [searchParams, services, clients, staff])

  // Pre-fill from client panel: package service redemption (₹0 — prepaid with package)
  useEffect(() => {
    const raw = searchParams.get("packageRedeem")
    if (!raw || services.length === 0 || clients.length === 0 || staff.length === 0) return

    const prefillPackageRedeem = async () => {
      try {
        const data = JSON.parse(atob(decodeURIComponent(raw))) as {
          clientId: string
          clientPackageId: string
          serviceIds: string[]
          staffId?: string | null
          packageName?: string
        }
        if (!data.clientId || !data.clientPackageId || !Array.isArray(data.serviceIds)) return

        const client = clients.find(
          c => String(c._id || c.id) === String(data.clientId)
        )
        if (client) {
          setSelectedCustomer(client)
          setCustomerSearch(client.name)
          const customerId = client._id || client.id
          if (customerId) await fetchCustomerStats(String(customerId))
        }

        const staffIdStr = data.staffId ? String(data.staffId) : ""
        const staffMember = staffIdStr
          ? staff.find(s => String(s._id || s.id) === staffIdStr)
          : null
        const firstStaff = staff[0]
        const staffToUse = staffMember
          ? staffIdStr
          : firstStaff
            ? String(firstStaff._id || firstStaff.id)
            : ""

        const serviceItemsToAdd: ServiceItem[] = []
        for (const sid of data.serviceIds) {
          const service = services.find(s => String(s._id || s.id) === String(sid))
          if (!service) continue
          const sidFinal = String(service._id || service.id)
          const basePrice = Number(service.price) || 0
          serviceItemsToAdd.push({
            id: `${Date.now()}-${Math.random()}`,
            serviceId: sidFinal,
            staffId: staffToUse,
            quantity: 1,
            price: basePrice,
            discount: 100,
            total: 0,
            isPackageRedemption: true,
            staffContributions:
              staffToUse && staffMember
                ? [
                    {
                      staffId: staffToUse,
                      staffName: staffMember.name || "",
                      percentage: 100,
                      amount: 0,
                    },
                  ]
                : staffToUse && firstStaff && String(firstStaff._id || firstStaff.id) === staffToUse
                  ? [
                      {
                        staffId: staffToUse,
                        staffName: firstStaff.name || "",
                        percentage: 100,
                        amount: 0,
                      },
                    ]
                  : [],
          })
        }

        if (serviceItemsToAdd.length > 0) {
          setServiceItems(serviceItemsToAdd)
          setRemarks(
            `Package redemption — ${data.packageName?.trim() || "Package"} (prepaid)`
          )
          setPendingPackageRedemption({
            clientPackageId: String(data.clientPackageId),
            serviceIds: data.serviceIds.map(s => String(s)),
          })
          setCashAmount(0)
          setCardAmount(0)
          setOnlineAmount(0)
          setTip(0)
          setTipStaffId(null)
        }

        if (typeof window !== "undefined") {
          const url = new URL(window.location.href)
          url.searchParams.delete("packageRedeem")
          window.history.replaceState({}, "", url.toString())
        }
      } catch (error) {
        console.error("Failed to parse packageRedeem data:", error)
      }
    }

    prefillPackageRedeem()
  }, [searchParams, services, clients, staff])

  // Open Quick Sale for client wallet issue: /quick-sale?clientId=...&prepaidWallet=1
  useEffect(() => {
    const cid = searchParams.get("clientId")
    const openPrepaid = searchParams.get("prepaidWallet") === "1"
    if (!cid || !isLikelyMongoObjectId(cid)) return

    const run = async () => {
      try {
        let client = clients.find((c) => String(c._id || c.id) === String(cid))
        if (!client) {
          const res = await ClientsAPI.getById(cid)
          if (res.success && res.data) client = res.data as Client
        }
        if (client) {
          setSelectedCustomer(client as Client)
          setCustomerSearch(client.name || "")
          const customerId = client._id || client.id
          if (customerId) await fetchCustomerStats(String(customerId))
        }
        if (openPrepaid) {
          setAddItemSection("prepaid")
        }
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href)
          url.searchParams.delete("clientId")
          url.searchParams.delete("prepaidWallet")
          window.history.replaceState({}, "", url.toString())
        }
      } catch (e) {
        console.error("Quick Sale clientId prefill:", e)
      }
    }

    void run()
  }, [searchParams, clients])

  useEffect(() => {
    if (addItemSection !== "prepaid") return
    let cancelled = false
    setLoadingPrepaidWalletPlans(true)
    ClientWalletAPI.listPlans({ status: "active" })
      .then((res) => {
        if (cancelled) return
        setPrepaidWalletPlansForIssue(res.success && res.data?.plans ? res.data.plans : [])
      })
      .catch(() => {
        if (!cancelled) setPrepaidWalletPlansForIssue([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPrepaidWalletPlans(false)
      })
    return () => {
      cancelled = true
    }
  }, [addItemSection])

  // One empty prepaid row when the panel opens (so "Add Prepaid Plans" is immediately actionable)
  useEffect(() => {
    if (addItemSection !== "prepaid") return
    setPrepaidPlanItems((rows) => {
      if (rows.length > 0) return rows
      return [
        {
          id: `${Date.now()}-prepaid`,
          planId: "",
          planName: "",
          creditAmount: 0,
          validityDays: 0,
          staffId: "",
          quantity: 1,
          price: 0,
          total: 0,
        },
      ]
    })
  }, [addItemSection])

  // In production, prefill data should come from URL params or API
  // No localStorage dependency for critical business functionality

  // Once services load, trigger price/total autofill (package redemption: every row; else legacy: first row only)
  useEffect(() => {
    if (services.length === 0 || serviceItems.length === 0) return
    for (const row of serviceItems) {
      if (!row.serviceId || !row.isPackageRedemption) continue
      const svc = services.find((s) => s._id === row.serviceId || s.id === row.serviceId)
      if (svc) updateServiceItem(row.id, "serviceId" as any, row.serviceId)
    }
    const first = serviceItems[0]
    if (first?.serviceId && !first.isPackageRedemption) {
      const svc = services.find((s) => s._id === first.serviceId || s.id === first.serviceId)
      if (svc) updateServiceItem(first.id, "serviceId" as any, first.serviceId)
    }
  }, [services])

  // Filter customers based on search (matches from start)
  const filteredCustomers = clients.filter(
    (client) =>
      client.name.toLowerCase().startsWith(customerSearch.toLowerCase()) ||
      client.phone.startsWith(customerSearch) ||
      (client.email && client.email.toLowerCase().startsWith(customerSearch.toLowerCase())),
  )

  // Get the correct customer ID (handles both id and _id properties)
  const getCustomerId = (customer: Client | null): string | null => {
    if (!customer) {
      console.log('❌ No customer provided to getCustomerId')
      return null
    }
    
    const id = customer._id || customer.id || null
    console.log('🔍 Customer object:', customer)
    console.log('🔑 Customer ID (_id):', customer._id)
    console.log('🔑 Customer ID (id):', customer.id)
    console.log('🔑 Final ID resolved:', id)
    
    return id
  }

  const openClientWalletLedger = async () => {
    const cid = getCustomerId(selectedCustomer)
    if (!cid || !isLikelyMongoObjectId(cid)) {
      toast({
        title: "Client required",
        description: "Choose a saved client from the directory to view prepaid wallet activity.",
        variant: "destructive",
      })
      return
    }
    setWalletLedgerOpen(true)
    setWalletLedgerLoading(true)
    setWalletLedgerRows([])
    try {
      const res = await ClientWalletAPI.getClientWallets(cid)
      if (!res.success || !res.data) {
        toast({ title: res.message || "Could not load wallet", variant: "destructive" })
        return
      }
      setWalletLedgerRows(
        flattenClientWalletLedger(res.data.wallets, res.data.transactionsByWallet)
      )
    } catch {
      toast({ title: "Could not load wallet activity", variant: "destructive" })
    } finally {
      setWalletLedgerLoading(false)
    }
  }

  // Handle customer selection with statistics fetch
  const handleCustomerSelect = async (customer: Client) => {
    console.log('🔍 Customer selected:', customer)
    console.log('🔑 Customer ID (id):', customer.id)
    console.log('🔑 Customer ID (_id):', customer._id)
    console.log('🔑 Final ID to use:', getCustomerId(customer))
    
    // Validate that the customer has a valid ID
    const customerId = getCustomerId(customer)
    if (!customerId) {
      console.error('❌ Customer selected but no valid ID found:', customer)
      toast({
        title: "Invalid Customer",
        description: "Selected customer has no valid ID. Please try selecting again.",
        variant: "destructive",
      })
      return
    }
    
    setSelectedCustomer(customer)
    setCustomerSearch(customer.name)
    setShowCustomerDropdown(false)
    
    // Fetch customer statistics when customer is selected
    await fetchCustomerStats(customerId)
  }

  // Handle customer search input
  const handleCustomerSearchChange = (value: string) => {
    // Check if the value contains only digits (phone number search)
    // If it's all digits, restrict to 10 digits
    if (value.length > 0 && /^\d+$/.test(value)) {
      // Only allow digits and limit to 10
      const phoneValue = value.replace(/\D/g, '').slice(0, 10)
      setCustomerSearch(phoneValue)
    } else if (value.length === 0) {
      // Allow empty string
      setCustomerSearch(value)
    } else {
      // Allow text for name/email search (contains letters or special chars)
      setCustomerSearch(value)
    }
    setShowCustomerDropdown(true)

    // If search doesn't match selected customer, clear selection
    const finalValue = value.length > 0 && /^\d+$/.test(value) 
      ? value.replace(/\D/g, '').slice(0, 10)
      : value
    if (selectedCustomer && !selectedCustomer.name.toLowerCase().includes(finalValue.toLowerCase())) {
      setSelectedCustomer(null)
    }
  }

  // Handle creating new customer
  const handleCreateNewCustomer = () => {
    console.log('🎯 Create new customer clicked!')
    console.log('🎯 Customer search value:', customerSearch)
    console.log('🎯 Current showNewCustomerDialog state:', showNewCustomerDialog)
    
    setNewCustomer({
      firstName: "",
      lastName: "",
      phone: customerSearch,
      email: "",
    })
    setShowNewCustomerDialog(true)
    setShowCustomerDropdown(false)
    
    console.log('🎯 Set showNewCustomerDialog to true')
  }

  // Handle saving new customer
  const handleSaveNewCustomer = async () => {
    if (!newCustomer.firstName) {
      toast({
        title: "Missing Information",
        description: "Please provide a first name.",
        variant: "destructive",
      })
      return
    }

    // Validate phone number - must be exactly 10 digits
    const phoneNumber = newCustomer.phone || customerSearch
    if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
      toast({
        title: "Invalid Phone Number",
        description: "Phone number must be exactly 10 digits.",
        variant: "destructive",
      })
      return
    }

    const customer: Client = {
      id: Date.now().toString(),
      name: newCustomer.lastName ? `${newCustomer.firstName} ${newCustomer.lastName}` : newCustomer.firstName,
      phone: phoneNumber,
      email: newCustomer.email,
      totalVisits: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
      status: "active",
    }

    try {
      // Add to client store (which will save to API)
      const success = await clientStore.addClient(customer)
      
      if (success) {
        // Refresh clients list
        await clientStore.loadClients()
        const updatedClients = clientStore.getClients()
        setClients(updatedClients)
        
        // Find the newly created client (it will have the API-generated ID)
        const newClient = updatedClients.find(c => 
          c.name === customer.name && c.phone === customer.phone
        )
        
        if (newClient) {
          // Select the new customer
          setSelectedCustomer(newClient)
          setCustomerSearch(newClient.name)
        }
        
        setShowNewCustomerDialog(false)

        // Reset form
        setNewCustomer({
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
        })

        toast({
          title: "Customer Created",
          description: "New customer has been successfully created and selected.",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to create customer. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error creating customer:', error)
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleViewBillActivity = async (tab: "notes" | "bills") => {
    if (!selectedCustomer?.phone?.trim()) {
      toast({
        title: "Error",
        description: "Please select a customer first.",
        variant: "destructive",
      })
      return
    }
    setBillActivityModalTab(tab)
    await fetchCustomerBills(selectedCustomer.phone)
  }

  // Fetch unpaid/partially paid bills for the customer
  const fetchUnpaidBills = async (customerPhone: string) => {
    try {
      const salesResponse = await SalesAPI.getByClient(customerPhone)
      if (salesResponse.success) {
        const sales = salesResponse.data || []
        
        // Filter only unpaid or partially paid bills
        const unpaid = sales.filter((sale: any) => {
          const remainingAmount = sale.paymentStatus?.remainingAmount || 0
          return remainingAmount > 0
        }).map((sale: any) => ({
          _id: sale._id || sale.id,
          id: sale._id || sale.id,
          billNo: sale.billNo,
          date: sale.date,
          time: sale.time || '00:00',
          grossTotal: sale.grossTotal || sale.netTotal || 0,
          totalAmount: sale.grossTotal || sale.netTotal || 0,
          paidAmount: sale.paymentStatus?.paidAmount || 0,
          remainingAmount: sale.paymentStatus?.remainingAmount || 0,
          dueDate: sale.paymentStatus?.dueDate,
          items: sale.items || [],
          customerName: sale.customerName,
          staffName: sale.staffName || 'Unassigned Staff',
          status: sale.paymentStatus?.status || 'partial',
          paymentStatus: sale.paymentStatus,
          paymentHistory: sale.paymentHistory || []
        }))
        
        setUnpaidBills(unpaid)
      }
    } catch (error) {
      console.error('Error fetching unpaid bills:', error)
      toast({
        title: "Error",
        description: "Failed to fetch unpaid bills. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle collect payment button click
  const handleCollectPayment = (bill: any) => {
    setSelectedBillForPayment(bill)
    setShowDuesDialog(false) // Close dues dialog first
    setShowDuesPaymentModal(true)
  }

  // Handle payment collected successfully
  const handlePaymentCollected = async () => {
    // Refresh unpaid bills list
    if (selectedCustomer) {
      await fetchUnpaidBills(selectedCustomer.phone || '')
      // Refresh customer stats to update dues amount
      const customerId = getCustomerId(selectedCustomer)
      if (customerId) {
        await fetchCustomerStats(customerId)
      }
    }
    // Close payment modal and reopen dues dialog
    setShowDuesPaymentModal(false)
    setSelectedBillForPayment(null)
    setShowDuesDialog(true)
  }

  // Fetch membership when customer or bill date changes (expiry is evaluated against bill date)
  useEffect(() => {
    const customerId = getCustomerId(selectedCustomer)
    if (!customerId) {
      setMembershipData(null)
      return
    }
    const asOfDate = format(selectedDate, "yyyy-MM-dd")
    MembershipAPI.getByCustomer(customerId, { asOfDate })
      .then((res) => {
        if (res.success && res.data) setMembershipData(res.data as any)
        else setMembershipData(null)
      })
      .catch(() => setMembershipData(null))
  }, [selectedCustomer, selectedDate])

  // Fetch plans when customer is selected (for Membership section)
  useEffect(() => {
    if (!selectedCustomer) {
      setPlans([])
      return
    }
    MembershipAPI.getPlans({ isActive: true })
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setPlans(res.data)
        else setPlans([])
      })
      .catch(() => setPlans([]))
  }, [selectedCustomer])

  useEffect(() => {
    ClientWalletAPI.getSettings()
      .then((res) => {
        if (res.success && res.data) setClientWalletSettings(res.data as any)
      })
      .catch(() => setClientWalletSettings(null))
  }, [])

  useEffect(() => {
    RewardPointsAPI.getSettings()
      .then((res) => {
        if (res.success && res.data) setRewardPointsSettings(res.data as RewardPointsSettings)
      })
      .catch(() => setRewardPointsSettings(null))
  }, [])

  useEffect(() => {
    const cid = getCustomerId(selectedCustomer)
    if (!cid || !isLikelyMongoObjectId(cid)) {
      setLoyaltyBalance(0)
      setLoyaltyPointsInput(0)
      return
    }
    let cancelled = false
    ClientsAPI.getById(cid)
      .then((res) => {
        if (cancelled || !res.success || !res.data) return
        setLoyaltyBalance(Number((res.data as any).rewardPointsBalance) || 0)
      })
      .catch(() => {
        if (!cancelled) setLoyaltyBalance(0)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCustomer])

  useEffect(() => {
    const cid = getCustomerId(selectedCustomer)
    if (!cid || !isLikelyMongoObjectId(cid)) {
      setClientWalletsRaw([])
      setSelectedWalletId("")
      setWalletPayAmount(0)
      return
    }
    setSelectedWalletId("")
    setWalletPayAmount(0)
    let cancelled = false
    ClientWalletAPI.getClientWallets(cid)
      .then((res) => {
        if (cancelled || !res.success || !res.data?.wallets) return
        const usable = filterWalletsForQuickSaleDisplay(res.data.wallets as any[])
        setClientWalletsRaw(usable)
        setSelectedWalletId(pickDefaultClientWalletId(usable))
      })
      .catch(() => {
        if (!cancelled) {
          setClientWalletsRaw([])
          setSelectedWalletId("")
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedCustomer])

  const membershipServiceSnapshot = useMemo(
    () =>
      serviceItems.map((i) => `${i.id}:${String(i.serviceId)}:${i.quantity}`).join("|"),
    [serviceItems]
  )

  const clientWalletsUsableFiltered = useMemo(
    () => filterWalletsForQuickSaleDisplay(clientWalletsRaw),
    [clientWalletsRaw]
  )

  const clientWallets = useMemo(() => {
    if (
      !clientWalletSettings?.combineMultipleWallets ||
      clientWalletsUsableFiltered.length <= 1
    ) {
      return clientWalletsUsableFiltered
    }
    return [buildCombinedQuickSaleWalletRow(clientWalletsUsableFiltered)]
  }, [clientWalletsUsableFiltered, clientWalletSettings?.combineMultipleWallets])

  /** Sum of remaining balance on active, non-expired wallets (always from underlying wallets). */
  const totalClientWalletBalance = useMemo(
    () =>
      clientWalletsUsableFiltered.reduce((sum, w) => sum + (Number(w.remainingBalance) || 0), 0),
    [clientWalletsUsableFiltered]
  )

  const showSeparateWalletCount =
    !clientWalletSettings?.combineMultipleWallets && clientWalletsUsableFiltered.length > 1

  const showClientWalletBalanceCard =
    Number.isFinite(totalClientWalletBalance) && totalClientWalletBalance > 0

  /** Invoices that have non-empty sale `notes`. */
  const customerBillsWithNotes = useMemo(
    () => customerBills.filter((b) => String(b.notes ?? "").trim().length > 0),
    [customerBills]
  )

  /** Hide the side column when there are no invoice notes (default tab) — snapshot uses full width until user opens Bill activity. */
  const showCustomerSidePanel = useMemo(
    () => billActivityModalTab === "bills" || customerBillsWithNotes.length > 0,
    [billActivityModalTab, customerBillsWithNotes.length]
  )

  useLayoutEffect(() => {
    if (!showCustomerSidePanel) {
      setSnapshotSidePanelHeightPx(null)
      return
    }
    const el = customerSnapshotCardRef.current
    if (!el) {
      setSnapshotSidePanelHeightPx(null)
      return
    }
    const sync = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) setSnapshotSidePanelHeightPx(Math.round(h))
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showCustomerSidePanel, selectedCustomer?.phone])

  // Apply membership pricing when membership loads, catalog changes, or line qty/service changes.
  // Included services: free units use plan balance first; extra qty is charged at plan discount %.
  useEffect(() => {
    if (!membershipData?.plan) {
      setServiceItems((items) =>
        items.map((item) => {
          if (item.isPackageRedemption) {
            const service = services.find((s) => (s._id || s.id) === item.serviceId)
            const basePrice = service?.price ?? item.price
            const baseAmount = basePrice * item.quantity
            const serviceTaxRate = taxSettings?.serviceTaxRate || 5
            const applyTax = isServiceTaxable(item)
            const { total } = computeLineTotalAndTax(baseAmount, 100, serviceTaxRate, applyTax)
            return {
              ...item,
              price: basePrice,
              discount: 100,
              total,
              isMembershipFree: false,
              membershipDiscountPercent: 0,
            }
          }
          if (!item.serviceId || (!item.isMembershipFree && (item.membershipDiscountPercent ?? 0) === 0)) return item
          const service = services.find((s) => (s._id || s.id) === item.serviceId)
          const basePrice = service?.price ?? item.price
          const baseAmount = basePrice * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(item)
          const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
          return { ...item, price: basePrice, discount: 0, total, isMembershipFree: false, membershipDiscountPercent: 0 }
        })
      )
      return
    }
    setServiceItems((prev) => applyMembershipPricingRef.current(prev))
  }, [membershipData, paymentSettings?.priceInclusiveOfTax, services, taxSettings, membershipServiceSnapshot])

  // Fetch customer statistics including visits, revenue, and last visit
  const fetchCustomerStats = async (customerId: string) => {
    console.log('🔍 Fetching customer stats for ID:', customerId)
    try {
      // First get the customer object to get the name
      const customer = clients.find(c => (c._id || c.id) === customerId)
      if (!customer) {
        console.error('❌ Customer not found in clients list:', customerId)
        return
      }
      
      console.log('👤 Customer found:', customer.name)
      
      // Get sales data for this customer by phone (exact match)
      const salesResponse = await SalesAPI.getByClient(customer.phone || '')
      console.log('📊 Sales API response:', salesResponse)
      
      if (salesResponse.success) {
        const sales = salesResponse.data || []
        const totalVisits = sales.length
        const totalRevenue = sales.reduce((sum: number, sale: any) => sum + (sale.grossTotal || sale.netTotal || 0), 0)
        const lastVisit = sales.length > 0 ? sales[0]?.date : null // Sales are sorted by date desc, so first is most recent
        
        // Calculate total dues (unpaid + partially paid)
        const totalDues = sales.reduce((sum: number, sale: any) => {
          const remainingAmount = sale.paymentStatus?.remainingAmount || 0
          
          // Count any sale with remaining amount > 0
          if (remainingAmount > 0) {
            return sum + remainingAmount
          }
          return sum
        }, 0)
        
        // Update the customer object with real statistics
        setSelectedCustomer(prev => prev ? {
          ...prev,
          totalVisits,
          totalSpent: totalRevenue,
          lastVisit,
          totalDues
        } : null)
      } else {
        console.error('❌ Failed to fetch sales data:', salesResponse.error)
      }
    } catch (error) {
      console.error('❌ Error fetching customer statistics:', error)
    }
  }

  // Fetch customer bills for Bill Activity dialog and inline Customer notes panel
  const fetchCustomerBills = async (customerPhone: string) => {
    console.log('🔍 fetchCustomerBills called with phone')
    setCustomerBillsLoading(true)
    try {
      console.log('🔍 Calling SalesAPI.getByClient...')
      const salesResponse = await SalesAPI.getByClient(customerPhone)
      console.log('📊 Customer bills API response:', salesResponse)

      if (salesResponse.success) {
        const sales = salesResponse.data || []
        console.log('📊 Sales data received:', sales)

        const bills = sales.map(mapSaleToCustomerBill)

        console.log('📋 Transformed bills:', bills)
        setCustomerBills(bills)
        console.log('📋 Customer bills state updated')
      } else {
        console.error('❌ Failed to fetch customer bills:', salesResponse.error)
        setCustomerBills([])
      }
    } catch (error) {
      console.error('❌ Error fetching customer bills:', error)
      setCustomerBills([])
    } finally {
      setCustomerBillsLoading(false)
    }
  }

  const openCustomerBillInvoicePreview = async (billNoRaw: string) => {
    const billNo = String(billNoRaw || "").trim()
    if (!billNo) {
      toast({
        title: "Missing bill number",
        description: "Cannot load this invoice.",
        variant: "destructive",
      })
      return
    }
    setHistoryInvoicePreviewOpen(true)
    setHistoryInvoicePreviewLoading(true)
    setHistoryInvoicePreviewReceipt(null)
    setHistoryInvoicePreviewSettings(null)
    try {
      const saleRes = await SalesAPI.getByBillNo(billNo)
      if (!saleRes.success || !saleRes.data) {
        toast({
          title: "Invoice not found",
          description: `No sale found for bill #${billNo}.`,
          variant: "destructive",
        })
        setHistoryInvoicePreviewOpen(false)
        return
      }
      let settings = businessSettings
      if (!settings) {
        const s = await SettingsAPI.getBusinessSettings()
        if (s.success && s.data) settings = s.data
      }
      setHistoryInvoicePreviewReceipt(receiptPreviewReceiptFromSaleApi(saleRes.data))
      setHistoryInvoicePreviewSettings(settings ?? null)
    } catch (e) {
      console.error(e)
      toast({
        title: "Failed to load invoice",
        variant: "destructive",
      })
      setHistoryInvoicePreviewOpen(false)
    } finally {
      setHistoryInvoicePreviewLoading(false)
    }
  }

  useEffect(() => {
    const phone = selectedCustomer?.phone?.trim()
    if (!phone) {
      setCustomerBills([])
      setCustomerBillsLoading(false)
      return
    }
    void fetchCustomerBills(phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync bills when selected customer identity changes via phone only
  }, [selectedCustomer?.phone])

  useEffect(() => {
    setBillActivityModalTab("notes")
  }, [selectedCustomer?.phone])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Handle discount state flags
  useEffect(() => {
    if (discountPercentage > 0) {
      setIsGlobalDiscountActive(true)
      setIsValueDiscountActive(false)
    } else if (discountValue > 0) {
      setIsValueDiscountActive(true)
      setIsGlobalDiscountActive(false)
    } else {
      setIsGlobalDiscountActive(false)
      setIsValueDiscountActive(false)
    }
  }, [discountPercentage, discountValue])

  // Function to recalculate discounts
  const recalculateDiscounts = () => {
    console.log('🔄 Recalculating discounts...', { discountValue, discountPercentage, serviceItems: serviceItems.length, productItems: productItems.length })
    console.log('📋 Current service items:', serviceItems)
    console.log('📋 Current product items:', productItems)
    
    if (discountValue > 0) {
      // Value discount logic
      const serviceItemsWithGST = serviceItems.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const productItemsWithGST = productItems.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const totalPayableAmount = serviceItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0) + 
                                productItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0)
      
      if (totalPayableAmount > 0) {
        setServiceItems(prev => prev.map((item, index) => {
          const baseAmount = item.price * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(item)
          const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
          const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * discountValue
          const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
          const finalTotal = totalWithGST - proportionalDiscountValue
          
          console.log(`🔧 Service item ${index + 1} calculation:`, {
            id: item.id,
            serviceId: item.serviceId,
            price: item.price,
            quantity: item.quantity,
            baseAmount,
            totalWithGST,
            proportionalDiscountValue,
            proportionalDiscountPercentage,
            finalTotal,
            totalPayableAmount
          })
          
          return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
        }))
        
        console.log('✅ Service items updated with new totals')
        
        setProductItems(prev => prev.map(item => {
          const baseAmount = item.price * item.quantity
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          let productTaxRate = 18
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = taxSettings?.enableTax !== false
          const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
          const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * discountValue
          const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
          const finalTotal = totalWithGST - proportionalDiscountValue
          return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
        }))
      }
    } else if (discountPercentage > 0) {
      // Percentage discount logic
      const serviceItemsWithGST = serviceItems.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const productItemsWithGST = productItems.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        return { ...item, totalWithGST: total }
      })
      
      const totalPayableAmount = serviceItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0) + 
                                productItemsWithGST.reduce((sum, item) => sum + item.totalWithGST, 0)
      
      const totalDiscountAmount = (totalPayableAmount * discountPercentage) / 100
      
      setServiceItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * totalDiscountAmount
        const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
        const finalTotal = totalWithGST - proportionalDiscountValue
        
        console.log('🔧 Service item calculation (percentage):', {
          name: item.serviceId,
          baseAmount,
          totalWithGST,
          proportionalDiscountValue,
          proportionalDiscountPercentage,
          finalTotal
        })
        
        return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
      }))
      
      setProductItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total: totalWithGST } = computeLineTotalAndTax(baseAmount, 0, productTaxRate, applyTax)
        const proportionalDiscountValue = (totalWithGST / totalPayableAmount) * totalDiscountAmount
        const proportionalDiscountPercentage = (proportionalDiscountValue / totalWithGST) * 100
        const finalTotal = totalWithGST - proportionalDiscountValue
        return { ...item, discount: proportionalDiscountPercentage, total: finalTotal }
      }))
    } else {
      // No global discount - keep line-level discounts (item.discount) and compute totals
      setServiceItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const itemDiscPct = item.discount || 0
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, itemDiscPct, serviceTaxRate, applyTax)
        return { ...item, discount: itemDiscPct, total }
      }))
      
      setProductItems(prev => prev.map(item => {
        const baseAmount = item.price * item.quantity
        const itemDiscPct = item.discount || 0
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const applyTax = taxSettings?.enableTax !== false
        const { total } = computeLineTotalAndTax(baseAmount, itemDiscPct, productTaxRate, applyTax)
        return { ...item, discount: itemDiscPct, total }
      }))
    }
  }

  // Recalculate discounts when discount values or tax settings change
  useEffect(() => {
    recalculateDiscounts()
  }, [discountValue, discountPercentage, taxSettings, paymentSettings?.priceInclusiveOfTax])

  // Recompute membership line totals when tax mode or membership rate changes
  useEffect(() => {
    if (!taxSettings) return
    setMembershipItems((items) =>
      items.map((m) => {
        if (!m.planId) return m
        const base = m.price * m.quantity
        const mRate = taxSettings.membershipTaxRate ?? taxSettings.serviceTaxRate ?? 5
        const { total } = computeMembershipPlanLineTotal(base, {
          membershipTaxRate: mRate,
          enableTax: taxSettings.enableTax !== false,
          priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
        })
        return { ...m, total }
      })
    )
  }, [
    taxSettings?.enableTax,
    taxSettings?.membershipTaxRate,
    taxSettings?.serviceTaxRate,
    paymentSettings?.priceInclusiveOfTax,
  ])

  // Recompute package line totals when tax mode or package rate changes
  useEffect(() => {
    if (!taxSettings) return
    setPackageItems((items) =>
      items.map((p) => {
        if (!p.packageId) return p
        const base = p.price * p.quantity
        const pRate = taxSettings.packageTaxRate ?? taxSettings.serviceTaxRate ?? 5
        const { total } = computePackageLineTotal(base, {
          packageTaxRate: pRate,
          enableTax: taxSettings.enableTax !== false,
          priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
        })
        return { ...p, total }
      })
    )
  }, [
    taxSettings?.enableTax,
    taxSettings?.packageTaxRate,
    taxSettings?.serviceTaxRate,
    paymentSettings?.priceInclusiveOfTax,
  ])

  // Log when service items change
  useEffect(() => {
    console.log('🔄 Service items state changed:', serviceItems.map(item => ({
      id: item.id,
      price: item.price,
      quantity: item.quantity,
      total: item.total,
      discount: item.discount
    })))
  }, [serviceItems])

  // Recalculate discounts when item properties change (but avoid infinite loops)
  useEffect(() => {
    if (discountValue > 0 || discountPercentage > 0) {
      // Use setTimeout to avoid infinite loops
      const timeoutId = setTimeout(() => {
        recalculateDiscounts()
      }, 0)
      return () => clearTimeout(timeoutId)
    }
  }, [serviceItems.map(item => `${item.price}-${item.quantity}-${item.serviceId}`).join(','), 
       productItems.map(item => `${item.price}-${item.quantity}-${item.productId}`).join(',')])

  // Add service item
  const addServiceItem = () => {
    const newItem: ServiceItem = {
      id: Date.now().toString(),
      serviceId: "",
      staffId: "",
      quantity: 1,
      price: 0,
      discount: 0,
      total: 0,
      staffContributions: [],
    }
    setServiceItems([...serviceItems, newItem])
    
    // Recalculate discounts after adding new item
    setTimeout(() => {
      recalculateDiscounts()
    }, 0)
  }

  // Add product item
  const addProductItem = () => {
    // Check if products are still loading
    if (loadingProducts) {
      toast({
        title: "Loading Products",
        description: "Please wait while products are being loaded...",
        variant: "default",
      })
      return
    }
    
    // Check if there are any products available
    if (products.length === 0) {
      toast({
        title: "No Products Available",
        description: "Please add products to the inventory first.",
        variant: "destructive",
      })
      return
    }

    const newItem: ProductItem = {
      id: Date.now().toString(),
      productId: "",
      staffId: "",
      quantity: 1,
      price: 0,
      discount: 0,
      total: 0,
    }
    setProductItems([...productItems, newItem])
    
    // Recalculate discounts after adding new item
    setTimeout(() => {
      recalculateDiscounts()
    }, 0)
  }

  // Add membership item
  const addMembershipItem = () => {
    if (plans.length === 0) {
      toast({
        title: "No Plans Available",
        description: "Select a customer first, or add membership plans in settings.",
        variant: "destructive",
      })
      return
    }
    const newItem: MembershipItem = {
      id: Date.now().toString(),
      planId: "",
      staffId: "",
      planName: "",
      price: 0,
      durationInDays: 0,
      quantity: 1,
      total: 0,
    }
    setMembershipItems([...membershipItems, newItem])
  }

  // Remove membership item
  const removeMembershipItem = (id: string) => {
    setMembershipItems((items) => items.filter((item) => item.id !== id))
  }

  // Update membership item
  const updateMembershipItem = (id: string, field: keyof MembershipItem, value: any) => {
    setMembershipItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        if (field === "planId" && value) {
          const plan = plans.find((p) => (p._id || p.id) === value)
          if (plan) {
            updated.planName = plan.planName
            updated.price = plan.price ?? 0
            updated.durationInDays = plan.durationInDays ?? 0
            const base = updated.price * updated.quantity
            const mRate = taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { total } = computeMembershipPlanLineTotal(base, {
              membershipTaxRate: mRate,
              enableTax: taxSettings?.enableTax !== false,
              priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
            })
            updated.total = total
          }
        } else if (field === "quantity") {
          const base = updated.price * updated.quantity
          const mRate = taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5
          const { total } = computeMembershipPlanLineTotal(base, {
            membershipTaxRate: mRate,
            enableTax: taxSettings?.enableTax !== false,
            priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
          })
          updated.total = total
        }
        return updated
      })
    )
  }

  const addPackageItem = () => {
    if (packagesCatalog.length === 0) {
      toast({
        title: "No Packages Available",
        description: "Create active packages under Packages, or check your connection.",
        variant: "destructive",
      })
      return
    }
    const newItem: PackageItem = {
      id: Date.now().toString(),
      packageId: "",
      packageName: "",
      totalSittings: 0,
      price: 0,
      quantity: 1,
      total: 0,
      staffId: "",
    }
    setPackageItems([...packageItems, newItem])
  }

  const removePackageItem = (id: string) => {
    setPackageItems((items) => items.filter((item) => item.id !== id))
  }

  const updatePackageItem = (id: string, field: keyof PackageItem, value: any) => {
    setPackageItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        if (field === "packageId" && value) {
          const pkg = packagesCatalog.find((p) => (p._id || p.id) === value)
          if (pkg) {
            updated.packageName = pkg.name || ""
            updated.totalSittings = pkg.total_sittings ?? 0
            updated.price = Number(pkg.total_price) || 0
            const base = updated.price * updated.quantity
            const pRate = taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { total } = computePackageLineTotal(base, {
              packageTaxRate: pRate,
              enableTax: taxSettings?.enableTax !== false,
              priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
            })
            updated.total = total
          }
        } else if (field === "quantity") {
          const base = updated.price * updated.quantity
          const pRate = taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5
          const { total } = computePackageLineTotal(base, {
            packageTaxRate: pRate,
            enableTax: taxSettings?.enableTax !== false,
            priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
          })
          updated.total = total
        }
        return updated
      })
    )
  }

  const addPrepaidPlanItem = () => {
    const newItem: PrepaidPlanItem = {
      id: `${Date.now()}-prepaid`,
      planId: "",
      planName: "",
      creditAmount: 0,
      validityDays: 0,
      staffId: "",
      quantity: 1,
      price: 0,
      total: 0,
    }
    setPrepaidPlanItems((rows) => [...rows, newItem])
  }

  const removePrepaidPlanItem = (id: string) => {
    setPrepaidPlanItems((rows) => rows.filter((item) => item.id !== id))
  }

  const updatePrepaidPlanItem = (id: string, field: keyof PrepaidPlanItem, value: any) => {
    setPrepaidPlanItems((rows) =>
      rows.map((item) => {
        if (item.id !== id) return item
        const updated: PrepaidPlanItem = { ...item, [field]: value }
        if (field === "planId" && value) {
          const plan = prepaidWalletPlansForIssue.find((p) => String(p._id) === String(value))
          if (plan) {
            updated.planName = plan.name || ""
            updated.price = Number(plan.payAmount) || 0
            updated.creditAmount = Number(plan.creditAmount) || 0
            updated.validityDays = Number(plan.validityDays) || 0
            const base = updated.price * updated.quantity
            const prepaidRate =
              taxSettings?.prepaidWalletTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { total } = computeMembershipPlanLineTotal(base, {
              membershipTaxRate: prepaidRate,
              enableTax: taxSettings?.enableTax !== false,
              priceInclusiveOfTax: paymentSettings?.priceInclusiveOfTax !== false,
            })
            updated.total = total
          }
        }
        return updated
      })
    )
  }

  // Update service item
  const updateServiceItem = (id: string, field: keyof ServiceItem, value: any) => {
    console.log('=== UPDATE SERVICE ITEM ===')
    console.log('Service ID:', id)
    console.log('Field:', field)
    console.log('Value:', value)
    setServiceItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-fill price when service is selected (Price = base cost, Disc = membership discount %, Total = after discount)
          if (field === "serviceId" && value) {
            const service = services.find((s) => s._id === value || s.id === value)
            if (service) {
              const basePrice = service.price ?? 0
              let discount = 0
              let isMembershipFree = false
              let membershipDiscountPercent = 0

              if (item.isPackageRedemption) {
                updatedItem.price = basePrice
                updatedItem.discount = 100
                updatedItem.isMembershipFree = false
                updatedItem.membershipDiscountPercent = 0
                const baseAmount = updatedItem.price * updatedItem.quantity
                const serviceTaxRate = taxSettings?.serviceTaxRate || 5
                const applyTax = isServiceTaxable(updatedItem)
                const { total } = computeLineTotalAndTax(baseAmount, 100, serviceTaxRate, applyTax)
                updatedItem.total = total
              } else if (membershipData?.plan && membershipData?.usageSummary) {
                const usage = membershipData.usageSummary.find((u: any) => String(u.serviceId || u.serviceId?._id) === String(value))
                const plan = membershipData.plan
                if (usage && usage.remaining > 0) {
                  discount = 100
                  isMembershipFree = true
                  membershipDiscountPercent = 100
                } else if (plan?.discountPercentage > 0) {
                  discount = plan.discountPercentage
                  membershipDiscountPercent = plan.discountPercentage
                }
              }

              if (!item.isPackageRedemption) {
                updatedItem.price = basePrice
                updatedItem.discount = discount
                updatedItem.isMembershipFree = isMembershipFree
                updatedItem.membershipDiscountPercent = membershipDiscountPercent
              }
            }
          }

          // Calculate total (Inclusive: price has tax; Excluded: add tax on top)
          const baseAmount = updatedItem.price * updatedItem.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const applyTax = isServiceTaxable(updatedItem)
          if (field === 'discount') {
            const itemDiscountPct = Number(value) || 0
            const { total } = computeLineTotalAndTax(baseAmount, itemDiscountPct, serviceTaxRate, applyTax)
            updatedItem.total = total
          } else if (discountValue === 0 && discountPercentage === 0) {
            const { total } = computeLineTotalAndTax(baseAmount, updatedItem.discount ?? 0, serviceTaxRate, applyTax)
            updatedItem.total = total
          }

          return updatedItem
        }
        return item
      }),
    )
  }

  // Update product item
  const updateProductItem = (id: string, field: keyof ProductItem, value: any) => {
    console.log('=== UPDATE PRODUCT ITEM ===')
    console.log('Product ID:', id)
    console.log('Field:', field)
    console.log('Value:', value)
    setProductItems((items) =>
      items.map((item) => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value }

          // Auto-fill price when product is selected
          if (field === "productId" && value) {
            const product = products.find((p) => p._id === value || p.id === value)
            if (product) {
              updatedItem.price = product.price
            }
          }

          // Calculate total (Inclusive: price has tax; Excluded: add tax on top)
          const baseAmount = updatedItem.price * updatedItem.quantity
          let productTaxRate = 18
          const product = products.find((p) => p._id === updatedItem.productId || p.id === updatedItem.productId)
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = taxSettings?.enableTax !== false
          if (field === 'discount') {
            const itemDiscountPct = Number(value) || 0
            const { total } = computeLineTotalAndTax(baseAmount, itemDiscountPct, productTaxRate, applyTax)
            updatedItem.total = total
          } else if (discountValue === 0 && discountPercentage === 0) {
            const { total } = computeLineTotalAndTax(baseAmount, updatedItem.discount ?? 0, productTaxRate, applyTax)
            updatedItem.total = total
          }

          console.log('Updated Product Item:', updatedItem)
          return updatedItem
        }
        return item
      }),
    )
    console.log('Product Items After Update:', productItems.map(p => ({ id: p.id, staffId: p.staffId })))
  }

  // Remove service item
  const removeServiceItem = (id: string) => {
    setServiceItems((items) => items.filter((item) => item.id !== id))
  }

  // Remove product item
  const removeProductItem = (id: string) => {
    setProductItems((items) => items.filter((item) => item.id !== id))
  }

  /** Per included service: plan remaining minus *free* units allocated on this bill (same order as applyMembershipPricingRef). */
  const membershipFreeRemainingAfterBillByServiceId = useMemo(() => {
    const map = new Map<string, number>()
    if (!membershipData?.usageSummary?.length) return map

    const usageMap = new Map(
      membershipData.usageSummary.map((u: any) => [String(u.serviceId || u.serviceId?._id), u])
    )
    const remaining: Record<string, number> = {}
    usageMap.forEach((u: any, sid: string) => {
      remaining[sid] = u.remaining
    })

    for (const item of serviceItems) {
      if (!item.serviceId || !item.isMembershipFree) continue
      const sid = String(item.serviceId)
      if (remaining[sid] === undefined) continue
      const q = Number(item.quantity)
      const n = Number.isFinite(q) && q > 0 ? Math.floor(q) : 1
      const freeUnits = Math.min(n, remaining[sid])
      remaining[sid] -= freeUnits
    }

    for (const sid of Object.keys(remaining)) {
      map.set(sid, Math.max(0, remaining[sid]))
    }
    return map
  }, [membershipData?.usageSummary, serviceItems])

  // Calculate totals (now includes GST in individual items)
  const serviceTotal = serviceItems.reduce((sum, item) => sum + item.total, 0)
  const productTotal = productItems.reduce((sum, item) => sum + item.total, 0)
  const subtotal = serviceTotal + productTotal
  const globalDiscount = discountValue + (subtotal * discountPercentage) / 100
  // Line-level discount (per service/product) - only when global discount is off
  const lineLevelDiscount =
    discountValue === 0 && discountPercentage === 0
      ? serviceItems.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0)) / 100, 0) +
        productItems.reduce((sum, item) => sum + (item.price * item.quantity * (item.discount || 0)) / 100, 0)
      : 0
  const totalDiscount = globalDiscount + lineLevelDiscount
  
  // Calculate tax breakdown for billing summary
  // Tax should be calculated on the discounted amount, not original price
  
  // Helper function to calculate discounted amount for an item
  const calculateDiscountedAmount = (baseAmount: number, taxRate: number) => {
    if (discountValue === 0 && discountPercentage === 0) {
      return baseAmount
    }
    
    // Calculate total payable amount (original prices + GST; service GST only when global tax ON and service Tax Applicable ON)
    const totalPayableAmount = serviceItems.reduce((total, serviceItem) => {
      const serviceBaseAmount = serviceItem.price * serviceItem.quantity
      const serviceTaxRate = taxSettings?.serviceTaxRate || 5
      const serviceGstAmount = isServiceTaxable(serviceItem) ? (serviceBaseAmount * serviceTaxRate) / 100 : 0
      return total + serviceBaseAmount + serviceGstAmount
    }, 0) + productItems.reduce((total, productItem) => {
      const productBaseAmount = productItem.price * productItem.quantity
      const product = products.find((p) => p._id === productItem.productId || p.id === productItem.productId)
      let productTaxRate = 18
      if (product?.taxCategory && taxSettings) {
        switch (product.taxCategory) {
          case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
          case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
          case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
          case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
          case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
        }
      }
      const productGstAmount = (taxSettings?.enableTax !== false) ? (productBaseAmount * productTaxRate) / 100 : 0
      return total + productBaseAmount + productGstAmount
    }, 0)
    
    const gstForItem = (taxSettings?.enableTax !== false) ? (baseAmount * taxRate) / 100 : 0
    const itemAmountWithGST = baseAmount + gstForItem
    const totalDiscountAmount = discountValue + (totalPayableAmount * discountPercentage / 100)
    const proportionalDiscount = totalPayableAmount > 0 ? (itemAmountWithGST / totalPayableAmount) * totalDiscountAmount : 0
    const discountOnBaseAmount = proportionalDiscount * baseAmount / itemAmountWithGST
    
    return baseAmount - discountOnBaseAmount
  }

  // Helper to compute discounted base considering item-level discount when no global discount
  const getDiscountedBase = (baseAmount: number, itemDiscountPct: number | undefined, taxRate: number) => {
    if (discountValue === 0 && discountPercentage === 0) {
      const pct = itemDiscountPct || 0
      return baseAmount - (baseAmount * pct) / 100
    }
    return calculateDiscountedAmount(baseAmount, taxRate)
  }

  // Only apply service tax when global tax is ON and this service has Tax Applicable = ON
  const isServiceTaxable = (serviceItem: { serviceId?: string }) => {
    if (taxSettings?.enableTax === false) return false
    const service = services.find((s) => (s._id || s.id) === serviceItem.serviceId)
    return service?.taxApplicable === true
  }

  // Tax Type: Included = price has GST, Excluded = GST added on top
  const priceInclusiveOfTax = paymentSettings?.priceInclusiveOfTax !== false

  // Compute line total and tax: when Inclusive, price already has tax; when Excluded, add tax on top
  const computeLineTotalAndTax = (
    baseAmount: number,
    discountPct: number,
    taxRate: number,
    applyTax: boolean
  ): { total: number; taxAmount: number } => {
    const discountedAmount = baseAmount * (1 - (discountPct || 0) / 100)
    if (!applyTax) return { total: discountedAmount, taxAmount: 0 }
    if (priceInclusiveOfTax) {
      // Price includes GST - total = discountedAmount, extract tax for display
      const taxAmount = discountedAmount - discountedAmount / (1 + taxRate / 100)
      return { total: discountedAmount, taxAmount }
    } else {
      // GST added on top
      const taxAmount = (discountedAmount * taxRate) / 100
      return { total: discountedAmount + taxAmount, taxAmount }
    }
  }

  applyMembershipPricingRef.current = (items: ServiceItem[]): ServiceItem[] => {
    if (!membershipData?.plan) return items

    const usageMap = new Map(
      membershipData.usageSummary.map((u: any) => [String(u.serviceId || u.serviceId?._id), u])
    )
    const plan = membershipData.plan
    const discountPct = plan?.discountPercentage || 0

    const remaining: Record<string, number> = {}
    usageMap.forEach((u: any, sid: string) => {
      remaining[sid] = u.remaining
    })

    return items.map((item) => {
      if (!item.serviceId) return item
      if (item.isPackageRedemption) {
        const service = services.find((s) => (s._id || s.id) === item.serviceId)
        const basePrice = service?.price ?? item.price
        const qty = Number(item.quantity)
        const q = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1
        const baseAmount = basePrice * q
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const applyTax = isServiceTaxable(item)
        const { total } = computeLineTotalAndTax(baseAmount, 100, serviceTaxRate, applyTax)
        return {
          ...item,
          price: basePrice,
          quantity: q,
          discount: 100,
          total,
          isMembershipFree: false,
          membershipDiscountPercent: 0,
        }
      }

      const sid = String(item.serviceId)
      const u = usageMap.get(sid)
      const service = services.find((s) => (s._id || s.id) === item.serviceId)
      const basePrice = service?.price ?? item.price
      const qty = Number(item.quantity)
      const q = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1

      const serviceTaxRate = taxSettings?.serviceTaxRate || 5
      const applyTax = isServiceTaxable(item)

      if (!u) {
        if (discountPct > 0) {
          const baseAmount = basePrice * q
          const { total } = computeLineTotalAndTax(baseAmount, discountPct, serviceTaxRate, applyTax)
          return {
            ...item,
            price: basePrice,
            quantity: q,
            total,
            discount: discountPct,
            membershipDiscountPercent: discountPct,
            isMembershipFree: false,
          }
        }
        const baseAmount = basePrice * q
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return {
          ...item,
          price: basePrice,
          quantity: q,
          total,
          discount: 0,
          membershipDiscountPercent: 0,
          isMembershipFree: false,
        }
      }

      if (remaining[sid] <= 0) {
        if (discountPct > 0) {
          const baseAmount = basePrice * q
          const { total } = computeLineTotalAndTax(baseAmount, discountPct, serviceTaxRate, applyTax)
          return {
            ...item,
            price: basePrice,
            quantity: q,
            total,
            discount: discountPct,
            membershipDiscountPercent: discountPct,
            isMembershipFree: false,
          }
        }
        const baseAmount = basePrice * q
        const { total } = computeLineTotalAndTax(baseAmount, 0, serviceTaxRate, applyTax)
        return {
          ...item,
          price: basePrice,
          quantity: q,
          total,
          discount: 0,
          membershipDiscountPercent: 0,
          isMembershipFree: false,
        }
      }

      const freeUnits = Math.min(q, remaining[sid])
      remaining[sid] -= freeUnits
      const paidUnits = q - freeUnits

      if (paidUnits === 0) {
        const baseAmount = basePrice * freeUnits
        const { total } = computeLineTotalAndTax(baseAmount, 100, serviceTaxRate, applyTax)
        return {
          ...item,
          price: basePrice,
          quantity: q,
          total,
          discount: 100,
          isMembershipFree: true,
          membershipDiscountPercent: 100,
        }
      }

      const { total: tFree } = computeLineTotalAndTax(basePrice * freeUnits, 100, serviceTaxRate, applyTax)
      const { total: tPaid } = computeLineTotalAndTax(basePrice * paidUnits, discountPct, serviceTaxRate, applyTax)
      const total = tFree + tPaid
      const avgDiscount = (freeUnits * 100 + paidUnits * discountPct) / q

      return {
        ...item,
        price: basePrice,
        quantity: q,
        total,
        discount: Math.round(avgDiscount * 100) / 100,
        isMembershipFree: true,
        membershipDiscountPercent: discountPct,
      }
    })
  }

  // Total column display: price - discount (excludes tax)
  const getDisplayTotal = (item: { price: number; quantity: number; discount?: number }) => {
    const baseAmount = (item.price || 0) * (item.quantity || 1)
    const discountPct = item.discount ?? 0
    return baseAmount * (1 - discountPct / 100)
  }
  
  // Calculate service tax (Inclusive: extract from price; Excluded: add on top)
  const serviceTax = (taxSettings?.enableTax !== false) ? serviceItems.reduce((sum, item) => {
    if (!isServiceTaxable(item)) return sum
    const baseAmount = item.price * item.quantity
    const serviceTaxRate = taxSettings?.serviceTaxRate || 5
    const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, true)
    return sum + taxAmount
  }, 0) : 0
  
  // Calculate product tax (Inclusive: extract from price; Excluded: add on top)
  const productTax = (taxSettings?.enableTax !== false) ? productItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const product = products.find((p) => p._id === item.productId || p.id === item.productId)
    let productTaxRate = 18
    if (product?.taxCategory && taxSettings) {
      switch (product.taxCategory) {
        case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
        case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
        case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
        case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
        case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
      }
    }
    const applyTax = taxSettings?.enableTax !== false
    const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, applyTax)
    return sum + taxAmount
  }, 0) : 0

  const membershipTax =
    taxSettings?.enableTax !== false
      ? membershipItems
          .filter((m) => m.planId)
          .reduce((sum, m) => {
            const baseAmount = m.price * m.quantity
            const membershipTaxRate = taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, membershipTaxRate, membershipTaxRate > 0)
            return sum + taxAmount
          }, 0)
      : 0

  const packageTax =
    taxSettings?.enableTax !== false
      ? packageItems
          .filter((p) => p.packageId)
          .reduce((sum, p) => {
            const baseAmount = p.price * p.quantity
            const packageTaxRate = taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, packageTaxRate, packageTaxRate > 0)
            return sum + taxAmount
          }, 0)
      : 0

  const prepaidWalletTax =
    taxSettings?.enableTax !== false
      ? prepaidPlanItems
          .filter((p) => p.planId)
          .reduce((sum, p) => {
            const baseAmount = p.price * p.quantity
            const prepaidTaxRate =
              taxSettings?.prepaidWalletTaxRate ?? taxSettings?.serviceTaxRate ?? 5
            const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, prepaidTaxRate, prepaidTaxRate > 0)
            return sum + taxAmount
          }, 0)
      : 0

  const totalTax = serviceTax + productTax + membershipTax + packageTax + prepaidWalletTax
  
  // Service Total (for billing display) = sum of (price × qty) for services only
  const billingServiceTotal = serviceItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Product Total (for billing display) = sum of (price × qty) for products only
  const billingProductTotal = productItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  // Membership / Package sidebar totals: pre-tax (price × qty), same as Plan total / Package total columns
  const billingMembershipTotal = membershipItems
    .filter((m) => m.planId)
    .reduce((sum, m) => sum + m.price * m.quantity, 0)
  const billingPackageTotal = packageItems
    .filter((p) => p.packageId)
    .reduce((sum, p) => sum + p.price * p.quantity, 0)
  const billingPrepaidTotal = prepaidPlanItems
    .filter((p) => p.planId)
    .reduce((sum, p) => sum + p.price * p.quantity, 0)
  // Item Total = Service Total + Product Total (before discounts)
  const billingItemTotal = billingServiceTotal + billingProductTotal
  // Discounts = Manual + Global (both line-level and global discount)
  const discounts = totalDiscount
  // Sub Total (pre-tax): all lines — services, products, membership, package — then discounts (matches Sub Total + GST ≈ Total when tax is exclusive)
  const subTotal =
    billingServiceTotal +
    billingProductTotal +
    billingMembershipTotal +
    billingPackageTotal +
    billingPrepaidTotal -
    discounts
  
  // Calculate subtotal excluding tax (discounted amounts)
  const subtotalExcludingTax = serviceItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const serviceTaxRate = taxSettings?.serviceTaxRate || 5
    const discountedAmount = getDiscountedBase(baseAmount, item.discount, serviceTaxRate)
    return sum + discountedAmount
  }, 0) + productItems.reduce((sum, item) => {
    const baseAmount = item.price * item.quantity
    const product = products.find((p) => p._id === item.productId || p.id === item.productId)
    let productTaxRate = 18
    if (product?.taxCategory && taxSettings) {
      switch (product.taxCategory) {
        case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
        case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
        case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
        case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
        case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
      }
    }
    const discountedAmount = getDiscountedBase(baseAmount, item.discount, productTaxRate)
    return sum + discountedAmount
  }, 0)
  
  const serviceCGST = serviceTax / 2
  const serviceSGST = serviceTax / 2
  const productCGST = productTax / 2
  const productSGST = productTax / 2

  // Calculate tax percentages for display
  const serviceTaxRate = taxSettings?.serviceTaxRate || 5
  const serviceCGSTRate = serviceTaxRate / 2
  const serviceSGSTRate = serviceTaxRate / 2

  // Calculate product tax per category (group by tax category)
  const productTaxByCategory: Array<{
    category: string
    categoryLabel: string
    taxRate: number
    cgstRate: number
    sgstRate: number
    totalTax: number
    cgst: number
    sgst: number
  }> = []

  if (productItems.length > 0 && taxSettings?.enableTax !== false) {
    const categoryMap = new Map<string, number>()
    
    productItems.forEach(item => {
      const product = products.find((p) => p._id === item.productId || p.id === item.productId)
      let productTaxRate = 18
      let categoryKey = 'standard'
      
      if (product?.taxCategory && taxSettings) {
        switch (product.taxCategory) {
          case 'essential': 
            productTaxRate = taxSettings.essentialProductRate || 5
            categoryKey = 'essential'
            break
          case 'intermediate': 
            productTaxRate = taxSettings.intermediateProductRate || 12
            categoryKey = 'intermediate'
            break
          case 'standard': 
            productTaxRate = taxSettings.standardProductRate || 18
            categoryKey = 'standard'
            break
          case 'luxury': 
            productTaxRate = taxSettings.luxuryProductRate || 28
            categoryKey = 'luxury'
            break
          case 'exempt': 
            productTaxRate = taxSettings.exemptProductRate || 0
            categoryKey = 'exempt'
            break
        }
      }
      
      const baseAmount = item.price * item.quantity
      const discountedAmount = getDiscountedBase(baseAmount, item.discount, productTaxRate)
      const gstAmount = (discountedAmount * productTaxRate) / 100
      
      const existing = categoryMap.get(categoryKey) || 0
      categoryMap.set(categoryKey, existing + gstAmount)
    })

    // Convert to array with labels and rates
    categoryMap.forEach((totalTax, categoryKey) => {
      let taxRate = 18
      let categoryLabel = 'Standard'
      
      switch (categoryKey) {
        case 'essential':
          taxRate = taxSettings?.essentialProductRate || 5
          categoryLabel = 'Essential'
          break
        case 'intermediate':
          taxRate = taxSettings?.intermediateProductRate || 12
          categoryLabel = 'Intermediate'
          break
        case 'standard':
          taxRate = taxSettings?.standardProductRate || 18
          categoryLabel = 'Standard'
          break
        case 'luxury':
          taxRate = taxSettings?.luxuryProductRate || 28
          categoryLabel = 'Luxury'
          break
        case 'exempt':
          taxRate = taxSettings?.exemptProductRate || 0
          categoryLabel = 'Exempt'
          break
      }
      
      if (totalTax > 0) {
        productTaxByCategory.push({
          category: categoryKey,
          categoryLabel,
          taxRate,
          cgstRate: taxRate / 2,
          sgstRate: taxRate / 2,
          totalTax,
          cgst: totalTax / 2,
          sgst: totalTax / 2
        })
      }
    })
  }

  // Base bill (services/products) total = subtotal + membership items + package items
  // Note: When value/percentage discount is active, item.total already has the proportional discount baked in,
  // so we must NOT subtract globalDiscount again (that would double-apply the discount).
  const membershipTotal = membershipItems.reduce((sum, item) => sum + item.total, 0)
  const packageTotal = packageItems.reduce((sum, item) => sum + item.total, 0)
  const prepaidPlanTotal = prepaidPlanItems.reduce((sum, item) => sum + item.total, 0)

  const payCfgMerged = useMemo(
    () => mergePaymentConfiguration(paymentSettings?.paymentConfiguration),
    [paymentSettings?.paymentConfiguration]
  )
  const allowBillingRedemption = payCfgMerged.billingRedemption.allowRedemptionInBilling !== false
  const stackWalletAndReward = payCfgMerged.billingRedemption.allowWalletAndPointsTogether !== false

  const redemptionLineItems = useMemo(() => {
    const lines: { type: string; total: number }[] = []
    for (const it of serviceItems) {
      if (!it.serviceId) continue
      lines.push({ type: "service", total: Number(it.total) || 0 })
    }
    for (const it of productItems) {
      if (!it.productId) continue
      lines.push({ type: "product", total: Number(it.total) || 0 })
    }
    for (const it of membershipItems) {
      if (!it.planId) continue
      lines.push({ type: "membership", total: Number(it.total) || 0 })
    }
    for (const it of packageItems) {
      if (!it.packageId) continue
      lines.push({ type: "package", total: Number(it.total) || 0 })
    }
    for (const it of prepaidPlanItems) {
      if (!it.planId) continue
      lines.push({ type: "prepaid_wallet", total: Number(it.total) || 0 })
    }
    return lines
  }, [serviceItems, productItems, membershipItems, packageItems, prepaidPlanItems])

  const eligibleWalletSubtotal = useMemo(() => {
    if (!allowBillingRedemption) return 0
    return eligibleRedemptionSubtotal(redemptionLineItems, payCfgMerged, "wallet")
  }, [allowBillingRedemption, redemptionLineItems, payCfgMerged])

  const eligibleRewardSubtotalRounded = useMemo(() => {
    if (!allowBillingRedemption) return 0
    return Math.round(eligibleRedemptionSubtotal(redemptionLineItems, payCfgMerged, "reward"))
  }, [allowBillingRedemption, redemptionLineItems, payCfgMerged])

  const hasWalletRedemptionSlot = useMemo(() => {
    if (!allowBillingRedemption) return false
    if (payCfgMerged.walletRedemption.enabled === false) return false
    if (clientWalletsUsableFiltered.length === 0) return false
    return eligibleWalletSubtotal > 0
  }, [
    allowBillingRedemption,
    payCfgMerged.walletRedemption.enabled,
    clientWalletsUsableFiltered.length,
    eligibleWalletSubtotal,
  ])

  const hasRewardRedemptionSlot = useMemo(() => {
    if (!allowBillingRedemption) return false
    if (payCfgMerged.rewardPointRedemption.enabled === false) return false
    if (!rewardPointsSettings?.enabled || !selectedCustomer || loyaltyBalance <= 0) return false
    const cid = getCustomerId(selectedCustomer)
    if (!cid || !isLikelyMongoObjectId(cid)) return false
    return eligibleRewardSubtotalRounded > 0
  }, [
    allowBillingRedemption,
    payCfgMerged.rewardPointRedemption.enabled,
    rewardPointsSettings?.enabled,
    selectedCustomer,
    loyaltyBalance,
    eligibleRewardSubtotalRounded,
  ])

  const showRedemptionSection = hasWalletRedemptionSlot || hasRewardRedemptionSlot
  const showExclusiveRedemptionPicker =
    allowBillingRedemption && !stackWalletAndReward && hasWalletRedemptionSlot && hasRewardRedemptionSlot

  const showWalletInput =
    hasWalletRedemptionSlot &&
    (stackWalletAndReward || !hasRewardRedemptionSlot || exclusiveRedemptionMethod === "wallet")
  const showRewardInput =
    hasRewardRedemptionSlot &&
    (stackWalletAndReward || !hasWalletRedemptionSlot || exclusiveRedemptionMethod === "reward")

  const hasAnyBillLineForRedemption = redemptionLineItems.length > 0
  const walletRedemptionBlockedByItems =
    allowBillingRedemption &&
    hasAnyBillLineForRedemption &&
    eligibleWalletSubtotal <= 0 &&
    payCfgMerged.walletRedemption.enabled !== false
  const rewardRedemptionBlockedByItems =
    allowBillingRedemption &&
    hasAnyBillLineForRedemption &&
    eligibleRewardSubtotalRounded <= 0 &&
    payCfgMerged.rewardPointRedemption.enabled !== false

  const baseTotal = subtotal + membershipTotal + packageTotal + prepaidPlanTotal
  const baseRounded = Math.round(baseTotal)
  const roundOff = baseRounded - baseTotal
  const loyaltyPreview = useMemo(() => {
    if (!rewardPointsSettings?.enabled) {
      return { ok: true as const, pointsToRedeem: 0, discountRupees: 0 }
    }
    const cid = getCustomerId(selectedCustomer)
    if (!cid || !isLikelyMongoObjectId(cid)) {
      return { ok: true as const, pointsToRedeem: 0, discountRupees: 0 }
    }
    const capSubtotal = allowBillingRedemption ? eligibleRewardSubtotalRounded : baseRounded
    return previewRedemptionLive(
      rewardPointsSettings,
      capSubtotal,
      loyaltyPointsInput,
      loyaltyBalance
    )
  }, [
    rewardPointsSettings,
    baseRounded,
    eligibleRewardSubtotalRounded,
    allowBillingRedemption,
    loyaltyPointsInput,
    loyaltyBalance,
    selectedCustomer,
  ])
  const loyaltyDiscountLive =
    loyaltyPreview.ok && loyaltyPreview.discountRupees > 0 ? loyaltyPreview.discountRupees : 0
  const showRewardPointsCustomerUI = useMemo(() => {
    if (!allowBillingRedemption) return false
    if (!rewardPointsSettings?.enabled || !selectedCustomer) return false
    if (loyaltyBalance <= 0) return false
    const cid = getCustomerId(selectedCustomer)
    return !!cid && isLikelyMongoObjectId(cid)
  }, [allowBillingRedemption, rewardPointsSettings?.enabled, selectedCustomer, loyaltyBalance])
  const customerStatsGridClass = useMemo(() => {
    if (!selectedCustomer) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3"
    const dues = (selectedCustomer.totalDues || 0) > 0
    const wallet = showClientWalletBalanceCard
    const reward = showRewardPointsCustomerUI
    const n = 3 + (wallet ? 1 : 0) + (dues ? 1 : 0) + (reward ? 1 : 0)
    if (n <= 3) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3"
    if (n === 4) return "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
    if (n === 5) return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6"
  }, [selectedCustomer, showClientWalletBalanceCard, showRewardPointsCustomerUI])
  const isGoldMembershipPlan = useMemo(
    () => !!membershipData?.plan?.planName?.toLowerCase()?.includes("gold"),
    [membershipData?.plan?.planName]
  )

  useEffect(() => {
    if (!allowBillingRedemption) {
      setWalletPayAmount(0)
      setLoyaltyPointsInput(0)
      setExclusiveRedemptionMethod(null)
    }
  }, [allowBillingRedemption])

  useEffect(() => {
    if (!showExclusiveRedemptionPicker) setExclusiveRedemptionMethod(null)
  }, [showExclusiveRedemptionPicker])

  useEffect(() => {
    if (showExclusiveRedemptionPicker && exclusiveRedemptionMethod === null) {
      setWalletPayAmount(0)
      setLoyaltyPointsInput(0)
    }
  }, [showExclusiveRedemptionPicker, exclusiveRedemptionMethod])

  useEffect(() => {
    if (!hasWalletRedemptionSlot) setWalletPayAmount(0)
  }, [hasWalletRedemptionSlot])

  useEffect(() => {
    if (!hasRewardRedemptionSlot) setLoyaltyPointsInput(0)
  }, [hasRewardRedemptionSlot])

  useEffect(() => {
    if (exclusiveRedemptionMethod === "wallet") setLoyaltyPointsInput(0)
    if (exclusiveRedemptionMethod === "reward") setWalletPayAmount(0)
  }, [exclusiveRedemptionMethod])

  // Amount payable by customer = baseRounded − loyalty + tip (tip is separate, non-taxable)
  const grandTotal = Math.max(0, baseRounded - loyaltyDiscountLive) + tip
  const roundedTotal = grandTotal
  const walletRedemptionTileDisabled =
    walletRedemptionBlockedByItems || payCfgMerged.walletRedemption.enabled === false
  const applyQuickSaleWalletMax = () => {
    if (walletRedemptionTileDisabled) return
    const w = clientWallets.find((x) => String(x._id) === selectedWalletId)
    if (!w) return
    setWalletPayAmount(
      Math.min(Number(w.remainingBalance), Math.max(0, Math.min(roundedTotal, eligibleWalletSubtotal)))
    )
  }
  const totalPaid = cashAmount + cardAmount + onlineAmount + walletPayAmount
  const change = totalPaid - roundedTotal
  const payableAfterWallet = Math.max(0, roundedTotal - walletPayAmount)
  const PAY_EPS = 0.01
  /** Bill change credits to wallet only when the sale is settled entirely with cash tenders. */
  const isCashOnlyCheckout =
    cashAmount >= PAY_EPS &&
    Math.abs(cardAmount) < PAY_EPS &&
    Math.abs(onlineAmount) < PAY_EPS &&
    Math.abs(walletPayAmount) < PAY_EPS

  const validServiceForCheckout = serviceItems.filter((item) => item.serviceId)
  const validProductForCheckout = productItems.filter((item) => item.productId)
  const validMembershipSaleLines = membershipItems.filter((m) => m.planId)
  const validPackageForCheckout = packageItems.filter((p) => p.packageId)
  const validPrepaidPlanForCheckout = prepaidPlanItems.filter((p) => p.planId)
  const membershipFreeServicesOnly =
    validServiceForCheckout.length > 0 &&
    validProductForCheckout.length === 0 &&
    validMembershipSaleLines.length === 0 &&
    validPackageForCheckout.length === 0 &&
    validPrepaidPlanForCheckout.length === 0 &&
    validServiceForCheckout.every(
      (item) => item.isMembershipFree === true && Math.abs(item.total) < 0.005
    )

  const allowZeroTotalCheckout =
    roundedTotal <= 0 &&
    validServiceForCheckout.length > 0 &&
    (pendingPackageRedemption != null || membershipFreeServicesOnly)

  // Generate receipt number with proper increment.
  // No fallback to cached number - if the API fails after retries, we surface the error
  // to avoid duplicate invoice IDs (INV-000122, etc.) when multiple bills use the same cached value.
  const generateReceiptNumber = async () => {
    const maxRetries = 3
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`=== RECEIPT NUMBER GENERATION (attempt ${attempt}/${maxRetries}) ===`)

        const incrementResponse = await SettingsAPI.incrementReceiptNumber()
        if (incrementResponse.success) {
          const newReceiptNumber = incrementResponse.data.receiptNumber
          console.log('✅ Receipt number incremented successfully:', newReceiptNumber)

          let prefix = 'INV'
          const settingsResponse = await SettingsAPI.getBusinessSettings()
          if (settingsResponse.success && settingsResponse.data) {
            prefix = settingsResponse.data.invoicePrefix || settingsResponse.data.receiptPrefix || 'INV'
          } else {
            prefix = posSettings?.invoicePrefix || businessSettings?.invoicePrefix || businessSettings?.receiptPrefix || 'INV'
          }

          const formattedReceiptNumber = `${prefix}-${newReceiptNumber.toString().padStart(6, '0')}`

          setBusinessSettings((prev: any) => ({
            ...prev,
            receiptNumber: newReceiptNumber
          }))

          return formattedReceiptNumber
        }
        lastError = new Error(incrementResponse.error || 'Failed to increment receipt number')
      } catch (error) {
        lastError = error
        console.error(`Receipt number generation attempt ${attempt} failed:`, error)
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt))
        }
      }
    }

    console.error('Failed to generate receipt number after retries:', lastError)
    throw lastError instanceof Error ? lastError : new Error('Failed to generate receipt number. Please check your connection and try again.')
  }

  // Handle checkout (reasonOverride: when called from modal, pass reason directly since setState is async).
  /** creditBillChangeToWallet — user confirmed via the post–Collect modal to credit bill change to prepaid. */
  const handleCheckout = async (
    reasonOverride?: string,
    options?: { creditBillChangeToWallet?: boolean }
  ) => {
    console.log('🚀 handleCheckout function called!')
    console.log('🚀 Mode:', mode)
    console.log('🚀 selectedCustomer:', selectedCustomer)
    console.log('🚀 customerSearch:', customerSearch)
    console.log('🚀 isProcessing:', isProcessing)

    const wantBillChangeCredit = options?.creditBillChangeToWallet === true
    const creditChangeEffective =
      wantBillChangeCredit && isCashOnlyCheckout && mode !== "exchange"
    
    // Prevent multiple simultaneous checkouts
    if (isProcessing) {
      console.log('❌ Checkout already in progress, ignoring')
      return
    }
    
    const effectiveReason = (reasonOverride ?? editReason).trim()
    // Validate edit reason for edit mode
    if (mode === "edit" && !effectiveReason) {
      toast({
        title: "Edit Reason Required",
        description: "Please provide a reason for editing this bill",
        variant: "destructive",
      })
      return
    }
    
    if (!selectedCustomer && !customerSearch) {
      toast({
        title: "Customer Required",
        description: "Please select or enter a customer",
        variant: "destructive",
      })
      return
    }

    const validServiceItems = serviceItems.filter((item) => item.serviceId)
    const validProductItems = productItems.filter((item) => item.productId)
    const validPackageItems = packageItems.filter((p) => p.packageId)
    const validPrepaidPlanItems = prepaidPlanItems.filter((p) => p.planId)

    if (
      validServiceItems.length === 0 &&
      validProductItems.length === 0 &&
      membershipItems.filter((m) => m.planId).length === 0 &&
      validPackageItems.length === 0 &&
      validPrepaidPlanItems.length === 0
    ) {
      toast({
        title: "No Items",
        description: "Please add at least one service, product, membership plan, package, or prepaid plan",
        variant: "destructive",
      })
      return
    }

    if (validPackageItems.length > 0 || validPrepaidPlanItems.length > 0) {
      const cid = getCustomerId(selectedCustomer)
      if (!isLikelyMongoObjectId(cid || undefined)) {
        toast({
          title: "Customer Required",
          description:
            validPrepaidPlanItems.length > 0
              ? "Select an existing customer from search to sell prepaid wallet plans on this bill."
              : "Select an existing customer from search to sell packages on this bill.",
          variant: "destructive",
        })
        return
      }
    }

    // ₹0 allowed for package redemption (prepaid) or membership-included–only services (see allowZeroTotalCheckout)
    if (roundedTotal <= 0 && !allowZeroTotalCheckout) {
      toast({
        title: "Invalid Amount",
        description: "Total amount must be greater than 0",
        variant: "destructive",
      })
      return
    }

    // Overpayment: crediting change to wallet is only available for all-cash tenders (non-expiring credit on server).
    if (totalPaid > roundedTotal + 1e-6) {
      if (mode === "exchange") {
        toast({
          title: "Payment Error",
          description: `Total paid cannot exceed bill total (₹${roundedTotal.toFixed(2)}) during exchange.`,
          variant: "destructive",
        })
        return
      }
      if (!isCashOnlyCheckout) {
        toast({
          title: "Overpayment",
          description:
            "Change can be credited to prepaid only when the bill is paid entirely in cash. Remove card, online, or wallet payment, or reduce cash to match the bill total.",
          variant: "destructive",
        })
        return
      }
      if (!wantBillChangeCredit) {
        toast({
          title: "Overpayment",
          description:
            "Reduce cash to the bill total, or tap Collect and confirm crediting the change to the prepaid wallet in the dialog.",
          variant: "destructive",
        })
        return
      }
      const cidOver = getCustomerId(selectedCustomer)
      if (!isLikelyMongoObjectId(cidOver || undefined)) {
        toast({
          title: "Customer required",
          description: "Select a saved customer from search to credit change to prepaid wallet.",
          variant: "destructive",
        })
        return
      }
      if (clientWalletsUsableFiltered.length > 0) {
        const widPick = pickWalletIdForChangeCredit(clientWalletsUsableFiltered, selectedWalletId)
        if (!widPick) {
          toast({
            title: "Wallet error",
            description: "Could not pick a wallet for the credit. Refresh and try again.",
            variant: "destructive",
          })
          return
        }
      }
    }

    const hasBillDiscount =
      isGlobalDiscountActive ||
      isValueDiscountActive ||
      discountPercentage > 0 ||
      discountValue > 0
    if (walletPayAmount > 0) {
      if (!allowBillingRedemption) {
        toast({
          title: "Wallet not allowed",
          description: "Wallet redemption is disabled in Payment configuration.",
          variant: "destructive",
        })
        return
      }
      if (!selectedWalletId) {
        toast({
          title: "Select wallet",
          description: "Choose a prepaid wallet or clear the wallet amount.",
          variant: "destructive",
        })
        return
      }
      const wSel = clientWallets.find((x) => String(x._id) === selectedWalletId)
      if (!wSel) {
        toast({ title: "Wallet unavailable", description: "Refresh and select a valid wallet.", variant: "destructive" })
        return
      }
      if (walletPayAmount > Number(wSel.remainingBalance) + 1e-6) {
        toast({
          title: "Wallet amount too high",
          description: "Cannot apply more than the wallet balance.",
          variant: "destructive",
        })
        return
      }
      const maxWalletForBill = Math.min(roundedTotal, eligibleWalletSubtotal)
      if (walletPayAmount > maxWalletForBill + 1e-6) {
        toast({
          title: "Wallet amount too high",
          description:
            eligibleWalletSubtotal + 1e-6 < roundedTotal
              ? "Wallet cannot exceed the amount allowed for eligible bill lines (Payment configuration)."
              : "Wallet cannot exceed the bill total.",
          variant: "destructive",
        })
        return
      }
      const combinedSources = (wSel as { _combinedSources?: any[] })._combinedSources
      const stackingOk =
        clientWalletSettings?.allowCouponStacking ||
        (Array.isArray(combinedSources) && combinedSources.length > 0
          ? combinedSources.every((sw) => sw.planSnapshot?.allowCouponStacking)
          : wSel.planSnapshot?.allowCouponStacking)
      if (hasBillDiscount && !stackingOk) {
        toast({
          title: "Discount stacking not allowed",
          description:
            "Turn off bill discounts or enable stacking in Prepaid wallet settings / plan to use a wallet with discounts.",
          variant: "destructive",
        })
        return
      }
    }

    if (loyaltyPointsInput > 0) {
      if (!allowBillingRedemption) {
        toast({
          title: "Reward points not allowed",
          description: "Redemption during billing is disabled in Payment configuration.",
          variant: "destructive",
        })
        return
      }
      if (!hasRewardRedemptionSlot) {
        toast({
          title: "Reward points not applicable",
          description:
            "Reward points cannot be applied to the current bill items (payment configuration).",
          variant: "destructive",
        })
        return
      }
      if (!loyaltyPreview.ok) {
        toast({
          title: "Reward points",
          description: loyaltyPreview.error || "Invalid reward points redemption.",
          variant: "destructive",
        })
        return
      }
    }
    if (!stackWalletAndReward && walletPayAmount > 1e-6 && loyaltyPointsInput > 0) {
      toast({
        title: "Only one redemption type",
        description: "Use wallet or reward points on this bill, not both (payment configuration).",
        variant: "destructive",
      })
      return
    }

    // Validate that all services have staff assigned
    const servicesWithoutStaff = validServiceItems.filter((item) => !item.staffId)
    if (validServiceItems.length > 0 && servicesWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all services before checkout",
        variant: "destructive",
      })
      return
    }

    // Validate that all membership items have staff assigned
    const validMembershipItems = membershipItems.filter((m) => m.planId)
    const membershipWithoutStaff = validMembershipItems.filter((m) => !m.staffId)
    if (validMembershipItems.length > 0 && membershipWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all membership plans before checkout",
        variant: "destructive",
      })
      return
    }

    const packageWithoutStaff = validPackageItems.filter((p) => !p.staffId)
    if (validPackageItems.length > 0 && packageWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all package lines before checkout",
        variant: "destructive",
      })
      return
    }

    const prepaidWithoutStaff = validPrepaidPlanItems.filter((p) => !p.staffId)
    if (validPrepaidPlanItems.length > 0 && prepaidWithoutStaff.length > 0) {
      toast({
        title: "Staff Required",
        description: "Please select staff for all prepaid plan lines before checkout",
        variant: "destructive",
      })
      return
    }

    // --- STOCK VALIDATION: Check if we have enough inventory for all products ---
    if (validProductItems.length > 0) {
      console.log('📦 Validating product stock before checkout...')
      
      for (const productItem of validProductItems) {
        const product = products.find((p) => p._id === productItem.productId || p.id === productItem.productId)
        
        if (product) {
          console.log(`📦 Checking stock for ${product.name}: Available ${product.stock}, Required ${productItem.quantity}`)
          
          if (product.stock < productItem.quantity) {
            toast({
              title: "Insufficient Stock",
              description: `${product.name} has insufficient stock. Available: ${product.stock}, Required: ${productItem.quantity}`,
              variant: "destructive",
            })
            return // Stop checkout if any product has insufficient stock
          }
        } else {
          console.error(`❌ Product not found for ID: ${productItem.productId}`)
          toast({
            title: "Product Error",
            description: "One or more products could not be found. Please refresh and try again.",
            variant: "destructive",
          })
          return
        }
      }
      
      console.log('✅ All products have sufficient stock')
    }



    setIsProcessing(true)

    try {
      // Match payable total shown in UI (includes loyalty discount + tip)
      const roundedTotalForStats = roundedTotal
      
      // Create or use existing customer
      let customer = selectedCustomer
      if (!customer && customerSearch) {
        // Create new customer
        customer = {
          id: Date.now().toString(),
          name: customerSearch,
          phone: customerSearch.match(/^\d+$/) ? customerSearch : "",
          email: customerSearch.includes("@") ? customerSearch : "",
          totalVisits: 1,
          totalSpent: roundedTotalForStats,
          createdAt: new Date().toISOString(),
          status: "active",
        }
        // Add to clients array
        clients.push(customer)
      } else if (customer) {
        // Update existing customer stats
        customer.totalVisits = (customer.totalVisits || 0) + 1
        customer.totalSpent = (customer.totalSpent || 0) + roundedTotalForStats
        customer.lastVisit = format(new Date(), "yyyy-MM-dd")
      }

      // Debug: Log all available data
      console.log('=== RECEIPT GENERATION DEBUG ===')
      console.log('Business Settings:', businessSettings)
      console.log('POS Settings:', posSettings)
      console.log('Business Settings invoicePrefix:', businessSettings?.invoicePrefix)
      console.log('Business Settings receiptPrefix:', businessSettings?.receiptPrefix)
      console.log('POS Settings invoicePrefix:', posSettings?.invoicePrefix)
      console.log('Services:', services.map(s => ({ id: s._id || s.id, name: s.name })))
      console.log('Products:', products.map(p => ({ id: p._id || p.id, name: p.name })))
      console.log('Staff:', staff.map(s => ({ id: s._id || s.id, name: s.name })))
      console.log('Valid Service Items:', validServiceItems)
      console.log('Valid Product Items:', validProductItems)
      console.log('=== CURRENT STATE BEFORE RECEIPT GENERATION ===')
      console.log('Service Items State:', serviceItems.map(s => ({ id: s.id, staffId: s.staffId, staffContributions: s.staffContributions })))
      console.log('Product Items State:', productItems.map(p => ({ id: p.id, staffId: p.staffId })))
      console.log('Staff Data:', staff.map(s => ({ id: s._id || s.id, name: s.name })))
      
      // Create receipt items
      const receiptItems: any[] = [
        ...validServiceItems.map((item) => {
          const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          console.log('=== SERVICE RECEIPT GENERATION ===')
          console.log('Service item:', { id: item.id, serviceId: item.serviceId, staffId: item.staffId })
          console.log('Service lookup:', { serviceId: item.serviceId, foundService: service?.name, allServices: services.map(s => ({ id: s._id || s.id, name: s.name })) })
          console.log('Staff lookup:', { staffId: item.staffId, foundStaff: staffMember?.name, allStaff: staff.map(s => ({ id: s._id || s.id, name: s.name })) })
          
          // Handle staff contributions
          let staffContributions = item.staffContributions
          if (!staffContributions && item.staffId) {
            const preTax = getLinePreTaxTotal({
              price: item.price,
              quantity: item.quantity,
              discount: item.discount ?? 0,
              total: item.total,
              taxRate: isServiceTaxable(item) ? (taxSettings?.serviceTaxRate || 5) : 0,
            })
            staffContributions = [{
              staffId: item.staffId,
              staffName: staffMember?.name || "Unassigned Staff",
              percentage: 100,
              amount: preTax,
            }]
          }
          
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
            staffContributions: staffContributions,
            hsnSacCode: (service as any)?.hsnSacCode || ""
          }
        }),
        ...validProductItems.map((item) => {
          const product = products.find((p) => p._id === item.productId || p.id === item.productId)
          const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
          console.log('=== PRODUCT RECEIPT GENERATION ===')
          console.log('Product item:', { id: item.id, productId: item.productId, staffId: item.staffId })
          console.log('Product lookup:', { productId: item.productId, foundProduct: product?.name, allProducts: products.map(p => ({ id: p._id || p.id, name: p.name })) })
          console.log('Product staff lookup:', { staffId: item.staffId, foundStaff: staffMember?.name, allStaff: staff.map(s => ({ id: s._id || s.id, name: s.name })) })
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
            hsnSacCode: (product as any)?.hsnSacCode || ""
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
            name: `${p.packageName} (${p.totalSittings} sittings)`,
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

      // Get the primary staff member (first staff member from items)
      const primaryStaff = receiptItems.length > 0 ? {
        staffId: receiptItems[0].staffId,
        staffName: receiptItems[0].staffName
      } : null
      
      console.log('=== STAFF ASSIGNMENT DEBUG ===')
      console.log('Service items before processing:', serviceItems)
      console.log('Staff list:', staff)
      console.log('Receipt items:', receiptItems)
      console.log('Primary staff:', primaryStaff)
      console.log('First item staff info:', receiptItems[0] ? {
        staffId: receiptItems[0].staffId,
        staffName: receiptItems[0].staffName
      } : 'No items')
      
      // Calculate tax breakdown from individual items (uses Inclusive/Excluded logic via computeLineTotalAndTax)
      let calculatedTax = 0
      // Base bill amount (for sales/revenue) = subtotal + membership + packages (discount already baked into item totals)
      const baseTotalForSale = subtotal + membershipTotal + packageTotal + prepaidPlanTotal
      const roundedBaseTotalForSale = Math.round(baseTotalForSale)
      const roundOff = roundedBaseTotalForSale - baseTotalForSale
      // calculatedTotal = bill amount used for sales/grossTotal (EXCLUDES tip)
      let calculatedTotal = roundedBaseTotalForSale
      let taxBreakdown: { cgst: number; sgst: number; igst: number; serviceTax: number; serviceRate: number; productTaxByRate: Record<string, number> } = {
        cgst: 0, sgst: 0, igst: 0, serviceTax: 0, serviceRate: 5, productTaxByRate: {}
      }

      // Service tax (Inclusive: extract from price; Excluded: add on top)
      const serviceTax = (taxSettings?.enableTax !== false) ? serviceItems.reduce((sum, item) => {
        if (!isServiceTaxable(item)) return sum
        const baseAmount = item.price * item.quantity
        const serviceTaxRate = taxSettings?.serviceTaxRate || 5
        const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, true)
        return sum + taxAmount
      }, 0) : 0

      // Build product tax by rate map for receipt bifurcation (Inclusive: extract from price; Excluded: add on top)
      const productTaxByRate: Record<string, number> = {}

      const productTax = (taxSettings?.enableTax !== false) ? productItems.reduce((sum, item) => {
        const baseAmount = item.price * item.quantity
        const product = products.find((p) => p._id === item.productId || p.id === item.productId)
        let productTaxRate = 18 // default standard rate
        if (product?.taxCategory && taxSettings) {
          switch (product.taxCategory) {
            case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
            case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
            case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
            case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
            case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
          }
        }
        const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, true)
        const key = String(productTaxRate)
        productTaxByRate[key] = (productTaxByRate[key] || 0) + taxAmount
        return sum + taxAmount
      }, 0) : 0

      const membershipTaxCheckout =
        (taxSettings?.enableTax !== false)
          ? membershipItems
              .filter((m) => m.planId)
              .reduce((sum, m) => {
                const baseAmount = m.price * m.quantity
                const membershipTaxRate = taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5
                const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, membershipTaxRate, membershipTaxRate > 0)
                return sum + taxAmount
              }, 0)
          : 0

      const packageTaxCheckout =
        (taxSettings?.enableTax !== false)
          ? packageItems
              .filter((p) => p.packageId)
              .reduce((sum, p) => {
                const baseAmount = p.price * p.quantity
                const packageTaxRate = taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5
                const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, packageTaxRate, packageTaxRate > 0)
                return sum + taxAmount
              }, 0)
          : 0

      const prepaidTaxCheckout =
        (taxSettings?.enableTax !== false)
          ? prepaidPlanItems
              .filter((p) => p.planId)
              .reduce((sum, p) => {
                const baseAmount = p.price * p.quantity
                const prepaidTaxRate =
                  taxSettings?.prepaidWalletTaxRate ?? taxSettings?.serviceTaxRate ?? 5
                const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, prepaidTaxRate, prepaidTaxRate > 0)
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
          membershipRate: taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5,
          packageTax: packageTaxCheckout,
          packageRate: taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5,
          prepaidWalletTax: prepaidTaxCheckout,
          prepaidWalletTaxRate:
            taxSettings?.prepaidWalletTaxRate ?? taxSettings?.serviceTaxRate ?? 5,
          serviceRate: taxSettings?.serviceTaxRate || 5,
          productTaxByRate
        } as any

      // Update receipt items with tax information (uses Inclusive/Excluded logic via computeLineTotalAndTax)
      receiptItems.forEach((item) => {
        if (item.type === 'service') {
          const origService = validServiceItems.find((s) => s.id === item.id)
          const applyTax = origService ? isServiceTaxable(origService) : false
          const baseAmount = item.price * item.quantity
          const serviceTaxRate = taxSettings?.serviceTaxRate || 5
          const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, serviceTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? serviceTaxRate : 0
        } else if (item.type === 'product') {
          const origProduct = validProductItems.find((p) => p.id === item.id)
          const product = origProduct ? products.find((prod) => prod._id === origProduct.productId || prod.id === origProduct.productId) : null
          let productTaxRate = 18
          if (product?.taxCategory && taxSettings) {
            switch (product.taxCategory) {
              case 'essential': productTaxRate = taxSettings.essentialProductRate || 5; break
              case 'intermediate': productTaxRate = taxSettings.intermediateProductRate || 12; break
              case 'standard': productTaxRate = taxSettings.standardProductRate || 18; break
              case 'luxury': productTaxRate = taxSettings.luxuryProductRate || 28; break
              case 'exempt': productTaxRate = taxSettings.exemptProductRate || 0; break
            }
          }
          const applyTax = (taxSettings?.enableTax !== false) && productTaxRate > 0
          const baseAmount = item.price * item.quantity
          const { taxAmount } = computeLineTotalAndTax(baseAmount, item.discount ?? 0, productTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? productTaxRate : 0
        } else if (item.type === 'membership') {
          const membershipTaxRate = taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5
          const applyTax = (taxSettings?.enableTax !== false) && membershipTaxRate > 0
          const baseAmount = item.price * item.quantity
          const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, membershipTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? membershipTaxRate : 0
        } else if (item.type === 'package') {
          const packageTaxRate = taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5
          const applyTax = (taxSettings?.enableTax !== false) && packageTaxRate > 0
          const baseAmount = item.price * item.quantity
          const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, packageTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? packageTaxRate : 0
        } else if (item.type === 'prepaid_wallet') {
          const prepaidTaxRate =
            taxSettings?.prepaidWalletTaxRate ?? taxSettings?.serviceTaxRate ?? 5
          const applyTax = (taxSettings?.enableTax !== false) && prepaidTaxRate > 0
          const baseAmount = item.price * item.quantity
          const { taxAmount } = computeLineTotalAndTax(baseAmount, 0, prepaidTaxRate, applyTax)
          item.taxAmount = taxAmount
          item.cgst = taxAmount / 2
          item.sgst = taxAmount / 2
          item.totalWithTax = item.total
          item.priceExcludingGST = (item.total - (taxAmount || 0)) / (item.quantity || 1)
          item.taxRate = applyTax ? prepaidTaxRate : 0
        }
      })

      let loyaltyDiscountAmountSave = 0
      let loyaltyPointsRedeemedSave = 0
      if (rewardPointsSettings?.enabled && loyaltyPointsInput > 0 && showRewardInput) {
        const cid = getCustomerId(customer)
        if (cid && isLikelyMongoObjectId(cid)) {
          const rewardCapForSave = allowBillingRedemption ? eligibleRewardSubtotalRounded : roundedBaseTotalForSale
          const prev = previewRedemptionLive(
            rewardPointsSettings,
            rewardCapForSave,
            loyaltyPointsInput,
            loyaltyBalance
          )
          if (prev.ok) {
            loyaltyPointsRedeemedSave = prev.pointsToRedeem
            loyaltyDiscountAmountSave = prev.discountRupees
          }
        }
      }
      calculatedTotal = Math.max(0, roundedBaseTotalForSale - loyaltyDiscountAmountSave)
      
      // Handle different modes: create, edit, exchange
      try {
        let receiptNumber
        let saleId: string | undefined

        if (mode === "edit" || mode === "exchange") {
          // For edit/exchange, use existing bill number and ID
          if (!initialSale) {
            toast({
              title: "Error",
              description: "Original bill data not found",
              variant: "destructive",
            })
            return
          }
          receiptNumber = initialSale.billNo || initialSale.receiptNumber
          saleId = initialSale._id || initialSale.id
          console.log('📝 Edit/Exchange mode - Using existing bill:', receiptNumber, saleId)
        } else {
          // For create mode, generate new receipt number
          try {
            receiptNumber = await generateReceiptNumber()
            if (!receiptNumber) {
              throw new Error('Failed to generate receipt number')
            }
            console.log('✅ Receipt number generated successfully:', receiptNumber)
          } catch (error) {
            console.error('❌ Failed to generate receipt number:', error)
            toast({
              title: "Receipt Generation Failed",
              description: "Failed to generate receipt number. Please try again.",
              variant: "destructive",
            })
            return
          }
        }

        // Create sale data with the receipt number
        const tipStaff = tipStaffId
          ? staff.find((s) => (s._id || s.id) === tipStaffId)
          : null
        const saleDueTotal = calculatedTotal + tip
        const { payments, changeToCredit, recordedPaidTotal } = buildRecordedPaymentsForCheckout({
          cashAmount,
          cardAmount,
          onlineAmount,
          walletPayAmount,
          saleDueTotal,
          creditOverpaymentToWallet: creditChangeEffective,
        })
        if (
          creditChangeEffective &&
          totalPaid > saleDueTotal + 1e-6 &&
          Math.abs(recordedPaidTotal - saleDueTotal) > 0.02
        ) {
          toast({
            title: "Cannot credit this change",
            description:
              "The overpayment must be reducible from cash, card, or online — not from prepaid wallet redemption. Lower the wallet amount on the bill or pay the exact total.",
            variant: "destructive",
          })
          return
        }
        const saleData = {
          billNo: receiptNumber,
          customerId: getCustomerId(customer),
          customerName: customer!.name,
          customerPhone: customer!.phone,
          customerEmail: customer?.email || '',
          items: [
            ...validServiceItems.map((item: any) => {
              const service = services.find((s) => s._id === item.serviceId || s.id === item.serviceId)
              const staffMember = staff.find((s) => s._id === item.staffId || s.id === item.staffId)
              const receiptItem = receiptItems.find((r) => r.id === item.id)
              const itemTax = receiptItem?.taxAmount ?? 0
          return {
                serviceId: item.serviceId,
                productId: null,
                name: service?.name || 'Unknown Service',
                type: 'service' as const,
                quantity: item.quantity,
                price: item.price,
                priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
                total: item.total,
                discount: item.discount ?? 0,
                staffId: item.staffId || '',
                staffName: staffMember?.name || '',
                staffContributions: item.staffContributions || [],
                isMembershipFree: item.isMembershipFree ?? false,
                membershipDiscountPercent: item.membershipDiscountPercent ?? 0,
                hsnSacCode: (service as any)?.hsnSacCode || '',
                taxRate: (receiptItem as any)?.taxRate ?? 0
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
                name: product?.name || 'Unknown Product',
                type: 'product' as const,
                quantity: item.quantity,
                price: item.price,
                priceExcludingGST: (item.total - itemTax) / (item.quantity || 1),
                total: item.total,
                discount: item.discount ?? 0,
                staffId: item.staffId || '',
                staffName: staffMember?.name || '',
                staffContributions: item.staffContributions || [],
                hsnSacCode: (product as any)?.hsnSacCode || '',
                taxRate: (receiptItem as any)?.taxRate ?? 0
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
                name: `${p.packageName} (${p.totalSittings} sittings)`,
                type: "package" as const,
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
          // Sale model required fields
          // Net Total = bill + tip (including tip); Gross Total = bill only (excluding tip)
          netTotal: calculatedTotal + tip,
          taxAmount: calculatedTax,
          grossTotal: calculatedTotal,
          tip: tip,
          tipStaffId: tipStaffId || undefined,
          tipStaffName: tipStaff?.name || undefined,
          discount: isValueDiscountActive ? discountValue : (isGlobalDiscountActive ? discountPercentage : 0),
          discountType: isValueDiscountActive ? 'fixed' : 'percentage',
          // Payment status tracking
          paymentStatus: {
            // Total amount customer needs to pay = sales amount (calculatedTotal) + tip
            totalAmount: calculatedTotal + tip,
            paidAmount: recordedPaidTotal,
            remainingAmount: calculatedTotal + tip - recordedPaidTotal,
            dueDate: new Date()
          },
          status:
            calculatedTotal + tip <= 0
              ? 'completed'
              : recordedPaidTotal === 0
                ? 'unpaid'
                : recordedPaidTotal < calculatedTotal + tip
                  ? 'partial'
                  : 'completed',
          paymentMode: payments.map(p => {
            const capitalized = p.type.charAt(0).toUpperCase() + p.type.slice(1);
            return capitalized;
          }).join(', '),
          payments: payments.map(p => ({
            mode: p.type.charAt(0).toUpperCase() + p.type.slice(1), // Capitalize first letter: "Cash", "Card", "Online"
            amount: p.amount
          })),
          staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
          staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
          notes: remarks || '',
          appointmentId: linkedAppointmentId || undefined,
          date: selectedDate.toISOString(),
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
          loyaltyPointsRedeemed: loyaltyPointsRedeemedSave,
          loyaltyDiscountAmount: loyaltyDiscountAmountSave,
          ...(creditChangeEffective &&
          changeToCredit > 0.005 && {
            billChangeCreditedToWallet: changeToCredit,
          }),
        }

        console.log('💾 Creating sale in backend:', saleData)
        console.log('💾 Sale data items:', saleData.items)
        console.log('💾 Customer email check:', {
          customer: customer?.name,
          customerEmail: customer?.email,
          saleDataCustomerEmail: saleData.customerEmail,
          hasEmail: !!saleData.customerEmail
        })
        console.log('💾 Sale data validation:', {
          hasBillNo: !!saleData.billNo,
          hasCustomerName: !!saleData.customerName,
          hasCustomerEmail: !!saleData.customerEmail,
          customerEmail: saleData.customerEmail || 'NO EMAIL',
          hasItems: !!saleData.items && saleData.items.length > 0,
          hasGrossTotal: !!saleData.grossTotal,
          itemsCount: saleData.items?.length || 0
        })
        
        // Use the SalesAPI for proper authentication and error handling
        try {
          let result: any
          
          if (mode === "edit") {
            // Update existing sale
            console.log('🚀 About to call SalesAPI.update with data:', saleData)
            console.log('💳 Payment details being sent:', {
              payments: saleData.payments,
              paymentMode: saleData.paymentMode,
              cashAmount,
              cardAmount,
              onlineAmount,
              totalPaid,
              recordedPaidTotal,
              changeToCredit,
            })
            result = await SalesAPI.update(saleId!, {
              ...saleData,
              editReason: effectiveReason,
            })
            console.log('📊 SalesAPI.update response:', result)
            console.log('💳 Payment details in response:', {
              payments: result.data?.payments,
              paymentMode: result.data?.paymentMode
            })
          } else if (mode === "exchange") {
            // Exchange products
            console.log('🚀 About to call SalesAPI.exchangeProducts with data:', saleData)
            result = await SalesAPI.exchangeProducts(saleId!, {
              updatedItems: saleData.items,
              netTotal: saleData.netTotal,
              taxAmount: saleData.taxAmount,
              grossTotal: saleData.grossTotal,
              discount: saleData.discount,
              discountType: saleData.discountType,
              editReason: editReason.trim() || "Product exchange",
              notes: saleData.notes,
            })
            console.log('📊 SalesAPI.exchangeProducts response:', result)
          } else {
            // Create new sale
            console.log('🚀 About to call SalesAPI.create with data:', saleData)
            result = await SalesAPI.create(saleData)
            console.log('📊 SalesAPI.create response:', result)
          }
          
          if (result.success) {
            const actionText = mode === "edit" ? "updated" : mode === "exchange" ? "exchanged" : "created"
            console.log(`✅ Sale ${actionText} successfully in backend:`, result)
            
            // For edit/exchange, show success and redirect
            if (mode === "edit" || mode === "exchange") {
              if (mode === "edit" && changeToCredit > 0.005 && result.data?._id) {
                const cidW = getCustomerId(selectedCustomer)
                if (!isLikelyMongoObjectId(cidW || undefined)) {
                  /* skip wallet credit */
                } else if (clientWalletsUsableFiltered.length > 0) {
                  const walletIdForCredit = pickWalletIdForChangeCredit(
                    clientWalletsUsableFiltered,
                    selectedWalletId
                  )
                  if (walletIdForCredit) {
                    try {
                      const cr = await ClientWalletAPI.creditChange({
                        walletId: walletIdForCredit,
                        amount: changeToCredit,
                        saleId: String(result.data._id),
                        billNo: receiptNumber,
                      })
                      if (cr.success) {
                        toast({
                          title: "Change credited to wallet",
                          description: `₹${changeToCredit.toFixed(2)} added to prepaid balance.`,
                        })
                      } else {
                        toast({
                          title: "Wallet credit failed",
                          description:
                            cr.message ||
                            "Bill was updated — add the change manually from the client wallet if needed.",
                          variant: "destructive",
                        })
                      }
                    } catch (ce) {
                      console.error(ce)
                      toast({
                        title: "Wallet credit error",
                        description: "Bill was updated. Credit the change from the client profile if needed.",
                        variant: "destructive",
                      })
                    }
                  }
                } else {
                  try {
                    const cr = await ClientWalletAPI.creditChangeOpenWallet({
                      clientId: cidW!,
                      amount: changeToCredit,
                      saleId: String(result.data._id),
                      billNo: receiptNumber,
                    })
                    if (cr.success) {
                      toast({
                        title: "Prepaid wallet opened",
                        description: `₹${changeToCredit.toFixed(2)} credited — new wallet linked to bill ${receiptNumber}.`,
                      })
                    } else {
                      toast({
                        title: "Could not create wallet credit",
                        description:
                          cr.message ||
                          "Ensure an active prepaid plan exists under Wallet settings. Adjust balance manually if needed.",
                        variant: "destructive",
                      })
                    }
                  } catch (ce) {
                    console.error(ce)
                    toast({
                      title: "Wallet credit error",
                      description: "Bill was updated. Add credit from Wallet settings or client profile.",
                      variant: "destructive",
                    })
                  }
                }
              }
              toast({
                title: `Bill ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`,
                description: `Bill ${receiptNumber} has been ${actionText} successfully.`,
              })
              // Calendar columns are staff-scoped; refresh when a linked completed bill’s staff changes
              if (
                typeof window !== "undefined" &&
                linkedAppointmentId &&
                String(result.data?.status || "").toLowerCase() === "completed"
              ) {
                window.dispatchEvent(new CustomEvent("appointments-refresh"))
              }
              // Redirect to reports after a short delay
              setTimeout(() => {
                router.push("/reports")
              }, 1500)
              return
            }
            
            // Check email status if available
            if (result.emailStatus) {
              console.log('📧 Email Status from backend:', result.emailStatus)
              if (result.emailStatus.sent) {
                console.log('✅ Receipt email sent successfully!')
              } else if (result.emailStatus.attempted) {
                console.error('❌ Email sending attempted but failed:', result.emailStatus.error)
              } else {
                console.warn('⚠️ Email sending not attempted:', result.emailStatus.error)
              }
            } else {
              console.warn('⚠️ No email status in response')
            }
            
            // Check WhatsApp status if available
            if (result.whatsappStatus) {
              console.log('📱 WhatsApp Status from backend:', result.whatsappStatus)
              if (result.whatsappStatus.sent) {
                console.log('✅ Receipt WhatsApp sent successfully!')
              } else if (result.whatsappStatus.error) {
                console.warn('⚠️ WhatsApp sending failed:', result.whatsappStatus.error)
              } else {
                console.warn('⚠️ WhatsApp not sent. Status:', result.whatsappStatus)
              }
            } else {
              console.warn('⚠️ No WhatsApp status in response')
            }
            
            // Mark all linked appointments as completed if fully paid
            if (linkedAppointmentId && (recordedPaidTotal >= calculatedTotal + tip || result.data?.status === 'completed')) {
              try {
                const idsToComplete = resolveAppointmentIdsToComplete(linkedAppointmentIds, linkedAppointmentId)
                await Promise.all(idsToComplete.map(id => AppointmentsAPI.update(id, { status: "completed" })))
                window.dispatchEvent(new CustomEvent("appointments-refresh"))
                toast({
                  title: "Appointment Completed",
                  description: idsToComplete.length > 1
                    ? `All ${idsToComplete.length} linked appointments have been marked as completed.`
                    : "This appointment has been marked as completed.",
                })
              } catch (error) {
                console.error("Failed to update appointment status:", error)
              }
            }
            // Refresh calendar so new walk-in cards (multi-staff services) appear - for both linked and standalone sales
            if (typeof window !== "undefined" && (recordedPaidTotal >= calculatedTotal + tip || result.data?.status === 'completed')) {
              window.dispatchEvent(new CustomEvent("appointments-refresh"))
            }

            if (
              mode === "create" &&
              walletPayAmount > 0 &&
              selectedWalletId &&
              result.data?._id &&
              isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined)
            ) {
              const serviceNames = validServiceItems.map((it: any) => {
                const svc = services.find((s) => (s._id || s.id) === it.serviceId)
                return svc?.name || "Service"
              })
              const couponApplied =
                isGlobalDiscountActive ||
                isValueDiscountActive ||
                discountPercentage > 0 ||
                discountValue > 0
              try {
                const rw = await ClientWalletAPI.redeem({
                  walletId: selectedWalletId,
                  amount: walletPayAmount,
                  saleId: String(result.data._id),
                  serviceNames,
                  couponApplied,
                })
                if (!rw.success) {
                  toast({
                    title: "Wallet redeem failed",
                    description:
                      rw.message ||
                      "Bill was saved — complete wallet deduction from the client wallet page if needed.",
                    variant: "destructive",
                  })
                }
              } catch (we) {
                console.error(we)
                toast({
                  title: "Wallet redeem error",
                  description: "Bill was saved. Adjust the wallet manually if needed.",
                  variant: "destructive",
                })
              }
            }

            if (mode === "create" && changeToCredit > 0.005 && result.data?._id) {
              const cidCh = getCustomerId(selectedCustomer)
              if (isLikelyMongoObjectId(cidCh || undefined)) {
                try {
                  if (clientWalletsUsableFiltered.length > 0) {
                    const walletIdForCredit = pickWalletIdForChangeCredit(
                      clientWalletsUsableFiltered,
                      selectedWalletId
                    )
                    if (walletIdForCredit) {
                      const cr = await ClientWalletAPI.creditChange({
                        walletId: walletIdForCredit,
                        amount: changeToCredit,
                        saleId: String(result.data._id),
                        billNo: receiptNumber,
                      })
                      if (cr.success) {
                        toast({
                          title: "Change credited to wallet",
                          description: `₹${changeToCredit.toFixed(2)} added to prepaid balance.`,
                        })
                      } else {
                        toast({
                          title: "Wallet credit failed",
                          description:
                            cr.message ||
                            "Bill was saved — add the change amount manually from the client wallet if needed.",
                          variant: "destructive",
                        })
                      }
                    } else {
                      toast({
                        title: "Wallet credit skipped",
                        description: "Could not resolve a prepaid wallet — refresh clients and retry, or add credit manually.",
                        variant: "destructive",
                      })
                    }
                  } else {
                    const cr = await ClientWalletAPI.creditChangeOpenWallet({
                      clientId: cidCh!,
                      amount: changeToCredit,
                      saleId: String(result.data._id),
                      billNo: receiptNumber,
                    })
                    if (cr.success) {
                      toast({
                        title: "Prepaid wallet opened",
                        description: `₹${changeToCredit.toFixed(2)} credited — wallet created using your salon prepaid plan.`,
                      })
                    } else {
                      toast({
                        title: "Could not create wallet credit",
                        description:
                          cr.message ||
                          "Create at least one active prepaid plan under Wallet settings, then add credit manually.",
                        variant: "destructive",
                      })
                    }
                  }
                  const wres = await ClientWalletAPI.getClientWallets(cidCh!)
                  if (wres.success && wres.data?.wallets) {
                    const usable = filterWalletsForQuickSaleDisplay(wres.data.wallets as any[])
                    setClientWalletsRaw(usable)
                    setSelectedWalletId(pickDefaultClientWalletId(usable))
                  }
                } catch (ce) {
                  console.error(ce)
                  toast({
                    title: "Wallet credit error",
                    description: "Bill was saved. Credit the change from Wallet settings or the client profile if needed.",
                    variant: "destructive",
                  })
                }
              }
            }

            if (mode === "create" && validPrepaidPlanItems.length > 0 && result.data?._id) {
              const clientOid = getCustomerId(selectedCustomer)
              if (isLikelyMongoObjectId(clientOid || undefined)) {
                const newSaleId = String(result.data._id)
                try {
                  for (const row of validPrepaidPlanItems) {
                    const qty = Math.max(1, Math.floor(row.quantity || 1))
                    for (let q = 0; q < qty; q++) {
                      const iw = await ClientWalletAPI.issue({
                        clientId: clientOid!,
                        planId: row.planId,
                        amountPaid: row.price,
                        saleId: newSaleId,
                      })
                      if (!iw.success) {
                        toast({
                          title: "Prepaid wallet not credited",
                          description:
                            iw.message ||
                            "Bill was saved — issue credit from the client Wallet page or contact support.",
                          variant: "destructive",
                        })
                      }
                    }
                  }
                  const wres = await ClientWalletAPI.getClientWallets(clientOid!)
                  if (wres.success && wres.data?.wallets) {
                    const usable = filterWalletsForQuickSaleDisplay(wres.data.wallets as any[])
                    setClientWalletsRaw(usable)
                    setSelectedWalletId(pickDefaultClientWalletId(usable))
                  }
                } catch (pe) {
                  console.error("[QuickSale] Prepaid issue after bill:", pe)
                  toast({
                    title: "Prepaid wallet issue error",
                    description: "The bill was saved. Issue wallet credit from the client profile if needed.",
                    variant: "destructive",
                  })
                }
              }
            }

            // Activate client packages (separate from Sale.items — backend package sell API)
            if (mode === "create" && validPackageItems.length > 0) {
              const clientOid = getCustomerId(selectedCustomer)
              if (isLikelyMongoObjectId(clientOid || undefined)) {
                const paidForBill = Math.min(recordedPaidTotal, calculatedTotal)
                try {
                  for (const row of validPackageItems) {
                    const qty = Math.max(1, Math.floor(row.quantity || 1))
                    const unitTotal = qty > 0 ? row.total / qty : row.total
                    for (let q = 0; q < qty; q++) {
                      const ap =
                        calculatedTotal > 0 ? (unitTotal / calculatedTotal) * paidForBill : 0
                      const res = await PackagesAPI.sell(row.packageId, {
                        client_id: clientOid!,
                        amount_paid: Math.round(ap * 100) / 100,
                        ...(row.staffId ? { sold_by_staff_id: String(row.staffId) } : {}),
                      })
                      if (!res.success) {
                        toast({
                          title: "Package not activated",
                          description: res.message || "Check Packages or the client profile to complete the sale.",
                          variant: "destructive",
                        })
                      }
                    }
                  }
                } catch (pkgErr) {
                  console.error("[QuickSale] Package sell after bill:", pkgErr)
                  toast({
                    title: "Package activation error",
                    description: "The bill was saved. You can sell the package from the client’s Packages tab if needed.",
                    variant: "destructive",
                  })
                }
              }
            }

            // Redeem package sitting (opened from client panel → Quick Sale with ₹0 package lines)
            if (mode === "create" && pendingPackageRedemption) {
              const pr = pendingPackageRedemption
              const idSet = new Set(validServiceItems.map((i) => String(i.serviceId)))
              const allPresent = pr.serviceIds.every((sid) => idSet.has(String(sid)))
              if (!allPresent) {
                toast({
                  title: "Package not redeemed",
                  description:
                    "Bill was saved. Keep all package services on the bill, or redeem from the client profile.",
                  variant: "destructive",
                })
              } else {
                try {
                  const r = await PackagesAPI.redeem(pr.clientPackageId, {
                    services: pr.serviceIds.map((service_id) => ({ service_id })),
                  })
                  if (r.success) {
                    toast({ title: "Package sitting redeemed" })
                  } else {
                    toast({
                      title: "Bill saved — redemption failed",
                      description: r.message || "Complete redemption from the client’s Packages tab.",
                      variant: "destructive",
                    })
                  }
                } catch (redeemErr) {
                  console.error("[QuickSale] Package redeem after bill:", redeemErr)
                  toast({
                    title: "Bill saved — redemption failed",
                    description: "Complete redemption from the client’s Packages tab.",
                    variant: "destructive",
                  })
                }
              }
              setPendingPackageRedemption(null)
            }
            
            // Now that backend sale is successful, create and store the receipt locally
      const tipStaff = tipStaffId
        ? staff.find((s) => (s._id || s.id) === tipStaffId)
        : null

      const subtotalExcludingTax = receiptItems.reduce((sum, item) => sum + (item.total - ((item as any).taxAmount || 0)), 0)
      const receipt: any = {
        id: Date.now().toString(),
        receiptNumber: receiptNumber,
        clientId: getCustomerId(customer),
        clientName: customer!.name,
        clientPhone: customer!.phone,
        date: selectedDate.toISOString(),
        time: format(new Date(), "HH:mm"),
        items: receiptItems,
        subtotal: subtotal,
        subtotalExcludingTax,
        tip: tip,
        discount: totalDiscount,
        tax: calculatedTax,
        roundOff: roundOff,
        // Receipt total = bill amount (calculatedTotal) + tip (what customer pays)
        total: calculatedTotal + tip,
        taxBreakdown: taxBreakdown,
        payments: payments,
        staffId: primaryStaff?.staffId || staff[0]?._id || staff[0]?.id || "",
        staffName: primaryStaff?.staffName || staff[0]?.name || "Unassigned Staff",
        tipStaffId: tipStaffId || undefined,
        tipStaffName: tipStaff?.name || undefined,
        notes: remarks,
        shareToken: result.data?.shareToken,
        ...(creditChangeEffective &&
        changeToCredit > 0.005 && {
          billChangeCreditedToWallet: changeToCredit,
        }),
      }

            // Store the receipt locally
      addReceipt(receipt)
      setCurrentReceipt(receipt)
            console.log('✅ Receipt stored locally with number:', receipt.receiptNumber)
            
            // Refresh products to get updated stock levels from backend
            if (validProductItems.length > 0) {
              console.log('🔄 Refreshing product list to get updated stock levels...')
              try {
                const refreshResponse = await ProductsAPI.getAll({ limit: 1000 }) // Fetch up to 1000 products
                if (refreshResponse.success) {
                  const sellableProducts = (refreshResponse.data || []).filter((product: any) => {
                    const productType = product.productType || 'retail'
                    return productType === 'retail' || productType === 'both'
                  })
                  setProducts(sellableProducts)
                  console.log('✅ Product list refreshed with updated stock levels')
                }
              } catch (refreshError) {
                console.warn('⚠️ Failed to refresh product list:', refreshError)
              }
            }

            const returnPath = linkedAppointmentId ? "/appointments" : "/quick-sale"
            setPostPaymentModal({ receipt: { ...receipt }, returnPath })
          } else {
            console.error('❌ Failed to create sale in backend:', result.error)
                  toast({
              title: "Sale Creation Failed",
              description: result.error || "Failed to create sale. Please try again.",
                    variant: "destructive",
                  })
            return
          }
        } catch (apiError: any) {
          console.error('💥 SalesAPI.create threw an error:', apiError)
          console.error('💥 Error details:', {
            message: apiError?.message,
            status: apiError?.response?.status,
            statusText: apiError?.response?.statusText,
            data: apiError?.response?.data
          })
          
          // Show error toast to user
                  toast({
            title: "Sale Creation Failed",
            description: apiError?.response?.data?.error || apiError?.message || "Failed to create sale. Please try again.",
                    variant: "destructive",
                  })
          
          // Don't proceed with receipt or form reset if backend fails
          return
        }
      } catch (error) {
        console.error('❌ Error creating sale in backend:', error)
        
        // Show error toast to user
            toast({
          title: "Sale Creation Failed",
          description: "Failed to create sale. Please try again.",
              variant: "destructive",
            })
        
        // Don't proceed with receipt or form reset if backend fails
        return
      }
      

      // Reset form (clears customer); restore below when prepaid was sold so wallet balance stays visible
      resetForm()
      setLinkedAppointmentId(null)

      const restoreCustomerAfterPrepaid =
        mode === "create" &&
        validPrepaidPlanItems.length > 0 &&
        customer != null &&
        isLikelyMongoObjectId(getCustomerId(customer))
      if (restoreCustomerAfterPrepaid && customer != null) {
        setSelectedCustomer(customer)
        setCustomerSearch(customer.name || "")
        const restoreCid = getCustomerId(customer)
        if (restoreCid && isLikelyMongoObjectId(restoreCid)) {
          void fetchCustomerStats(restoreCid)
          void ClientWalletAPI.getClientWallets(restoreCid).then((wres) => {
            if (!wres.success || !wres.data?.wallets) return
            const usable = filterWalletsForQuickSaleDisplay(wres.data.wallets as any[])
            setClientWalletsRaw(usable)
            setSelectedWalletId(pickDefaultClientWalletId(usable))
          })
        }
      }
    } catch (error: any) {
      console.error('❌ Checkout failed:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      
      let errorMessage = "An error occurred during checkout"
      if (error.message) {
        errorMessage = error.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      }
      
      toast({
        title: "Checkout Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Reset form
  const resetForm = () => {
    setSelectedCustomer(null)
    setCustomerSearch("")
    setServiceItems([])
    setProductItems([])
    setDiscountValue(0)
    setDiscountPercentage(0)
    setGiftVoucher("")
    setTip(0)
    setIsGlobalDiscountActive(false)
    setIsValueDiscountActive(false)
    setCashAmount(0)
    setCardAmount(0)
    setOnlineAmount(0)
    setWalletPayAmount(0)
    setSelectedWalletId("")
    setClientWalletsRaw([])
    setPrepaidPlanItems([])
    setAddItemSection(null)
    setRemarks("")
    setTipStaffId(null)
    setConfirmUnpaid(false)
    setShowTipModal(false)
    setTempTipAmount(0)
    setEditReason("")
    setShowEditReasonModal(false)
    setTempEditReason("")
    setMembershipItems([])
    setPackageItems([])
    setPendingPackageRedemption(null)
  }

  // Tip modal handlers
  const handleTipClick = () => {
    setTempTipAmount(tip)
    setShowTipModal(true)
  }

  const handleTipCancel = () => {
    setShowTipModal(false)
    setTempTipAmount(0)
  }

  const handleTipOk = () => {
    if (tempTipAmount > 0 && !tipStaffId) {
      toast({
        title: "Select Staff",
        description: "Please select the staff member receiving the tip.",
        variant: "destructive",
      })
      return
    }
    if (tempTipAmount > 0) {
      setTip(tempTipAmount)
    } else {
      setTip(0)
      setTipStaffId(null)
    }
    setShowTipModal(false)
  }

  // Quick cash amounts
  const quickCashAmounts = [100, 200, 500]



  const formatCurrency = (amount: number) => {
    const currency = paymentSettings?.enableCurrency ? (paymentSettings?.currency || "USD") : "USD"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString()
  }

  const [showBillHistoryDialog, setShowBillHistoryDialog] = useState(false)
  const [focusedZeroInputKey, setFocusedZeroInputKey] = useState<string | null>(null)
  const [generatedReceipt, setGeneratedReceipt] = useState<any | null>(null)

  const handleNewCustomerSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    handleSaveNewCustomer()
  }

  // Handle viewing individual bill details
  const handleViewBillDetails = (bill: any) => {
    setSelectedBill(bill)
    setShowBillDetailsDialog(true)
  }

  if (isOldQuickSale) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Customer Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customer"
                    placeholder="Search by name or phone..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      setShowCustomerDropdown(true)
                      if (!e.target.value) {
                        setSelectedCustomer(null)
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    className="pl-10"
                  />

                  {showCustomerDropdown && customerSearch && (
                    <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map((customer, index) => (
                          <div
                            key={`${customer._id || customer.id}-${customer.phone}-${index}`}
                            className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                            onClick={() => handleCustomerSelect(customer)}
                          >
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{customer.name}</div>
                                <div className="text-sm text-muted-foreground">📞 {customer.phone}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div
                          className="p-3 hover:bg-muted cursor-pointer flex items-center gap-2"
                          onClick={handleCreateNewCustomer}
                        >
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>Create new customer: &quot;{customerSearch}&quot;</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Details */}
              {selectedCustomer && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <User className="h-4 w-4 shrink-0" />
                      <span className="font-medium">{selectedCustomer.name}</span>
                      {showClientWalletBalanceCard && (
                        <button
                          type="button"
                          title={
                            showSeparateWalletCount
                              ? `View wallet activity · ${clientWalletsUsableFiltered.length} wallets`
                              : clientWalletSettings?.combineMultipleWallets &&
                                  clientWalletsUsableFiltered.length > 1
                                ? "View wallet activity · combined balance"
                                : "View wallet activity"
                          }
                          onClick={() => void openClientWalletLedger()}
                          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-background px-2.5 py-0.5 text-[11px] font-medium tabular-nums shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60"
                        >
                          <Wallet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 truncate">{formatCurrency(totalClientWalletBalance)}</span>
                          {showSeparateWalletCount ? (
                            <span className="text-muted-foreground">
                              ({clientWalletsUsableFiltered.length})
                            </span>
                          ) : null}
                        </button>
                      )}
                      {showRewardPointsCustomerUI && rewardPointsSettings && (
                        <span
                          title={
                            rewardPointsSettings.redeemPointsStep > 0 && rewardPointsSettings.redeemRupeeStep > 0
                              ? `~${formatCurrency(
                                  Math.floor(loyaltyBalance / rewardPointsSettings.redeemPointsStep) *
                                    rewardPointsSettings.redeemRupeeStep
                                )} redeem value`
                              : undefined
                          }
                          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-violet-200/80 bg-violet-50/90 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-violet-900"
                        >
                          <Gift className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
                          <span className="min-w-0 truncate">
                            {loyaltyBalance}
                            <span className="ml-0.5 font-normal text-violet-800/90">pts</span>
                          </span>
                        </span>
                      )}
                      <Badge variant={selectedCustomer.status === "active" ? "default" : "secondary"}>
                        {selectedCustomer.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCustomer.phone}
                    </div>
                    {selectedCustomer.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedCustomer.email}
                      </div>
                    )}
                  </div>

                  <div className={cn("grid gap-4 pt-2", customerStatsGridClass)}>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-3 w-3" />
                        Visits
                      </div>
                      <div className="font-semibold">{selectedCustomer.totalVisits || 0}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <TrendingUp className="h-3 w-3" />
                        Revenue
                      </div>
                      <div className="font-semibold">{formatCurrency(selectedCustomer.totalSpent || 0)}</div>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-3 w-3" />
                        Last Visit
                      </div>
                      <div className="font-semibold text-xs">{formatDate(selectedCustomer.lastVisit || "")}</div>
                    </div>
                    {(selectedCustomer.totalDues || 0) > 0 && (
                      <div 
                        className="text-center cursor-pointer hover:bg-red-50 rounded-lg p-2 transition-all duration-200"
                        onClick={async () => {
                          if (selectedCustomer) {
                            await fetchUnpaidBills(selectedCustomer.phone || '')
                            setShowDuesDialog(true)
                          }
                        }}
                      >
                        <div className="flex items-center justify-center gap-1 text-sm text-red-600 mb-1">
                          <CreditCard className="h-3 w-3" />
                          Dues
                        </div>
                        <div className="font-semibold text-red-600">{formatCurrency(selectedCustomer.totalDues || 0)}</div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className={cn(
                        "h-8 min-w-0 flex-1 px-2 text-[11px]",
                        billActivityModalTab === "bills"
                          ? "border-indigo-300/90 bg-indigo-50 text-indigo-900"
                          : "bg-transparent"
                      )}
                      onClick={() => void handleViewBillActivity("bills")}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5 shrink-0" />
                      Bill activity
                    </Button>
                    {customerBillsWithNotes.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        className={cn(
                          "h-8 min-w-0 flex-1 px-2 text-[11px]",
                          billActivityModalTab === "notes"
                            ? "border-indigo-300/90 bg-indigo-50 text-indigo-900"
                            : "bg-transparent"
                        )}
                        onClick={() => void handleViewBillActivity("notes")}
                      >
                        <StickyNote className="mr-1 h-3.5 w-3.5 shrink-0" />
                        Customer notes
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Cart */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Cart ({cart.length} items)</CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No items in cart</p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={`${item.id}-${item.type}`}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground capitalize">{item.type}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.type, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.type, item.quantity + 1)}
                      >
                        +
                      </Button>
                      <div className="w-20 text-right font-medium">{formatCurrency(item.price * item.quantity)}</div>
                      <Button size="sm" variant="ghost" onClick={() => removeFromCart(item.id, item.type)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card> */}

        {/* Payment */}
        {/* <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="flex gap-2">
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                >
                  Cash
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                >
                  Card
                </Button>
                <Button variant={paymentMethod === "upi" ? "default" : "outline"} onClick={() => setPaymentMethod("upi")}>
                  UPI
                </Button>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={isLoading || cart.length === 0 || !selectedCustomer}
            >
              {isLoading ? "Processing..." : `Complete Sale - ${formatCurrency(grandTotal)}`}
            </Button>
          </CardContent>
        </Card> */}





        {/* New Customer Dialog */}
        {/* Simple HTML Modal for New Customer */}
        {showNewCustomerDialog && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50" 
              onClick={() => setShowNewCustomerDialog(false)}
            ></div>
            
            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 border-4 border-blue-500">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Create New Customer</h2>
                <button 
                  onClick={() => setShowNewCustomerDialog(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
              
              <p className="text-gray-600 mb-4">Add a new customer to your salon database.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">First Name *</Label>
                    <Input
                      value={newCustomer.firstName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                      placeholder="Enter first name"
                      className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Last Name</Label>
                    <Input
                      value={newCustomer.lastName}
                      onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                      placeholder="Enter last name"
                      className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Phone</Label>
                  <Input
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Email</Label>
                  <Input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    placeholder="Enter email address"
                    className="border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowNewCustomerDialog(false)} 
                  className="border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={handleSaveNewCustomer} 
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Customer
                </Button>
              </div>
            </div>
          </div>
        )}


        
        

        {/* Bill Details Dialog */}
        <Dialog open={showBillDetailsDialog} onOpenChange={setShowBillDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto border-gray-200 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-gray-800">
                <Receipt className="h-5 w-5 text-indigo-600" />
                Bill Details - {selectedBill?.receiptNumber}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Detailed view of the selected bill
              </DialogDescription>
            </DialogHeader>
            {selectedBill && (
              <div className="space-y-4">
                {/* Bill Header */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">Receipt Number</p>
                    <p className="font-semibold text-gray-800">{selectedBill.receiptNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date & Time</p>
                    <p className="font-semibold text-gray-800">
                      {format(new Date(selectedBill.date), "dd MMM yyyy")} at {selectedBill.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Customer</p>
                    <p className="font-semibold text-gray-800">{selectedBill.clientName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-indigo-600">₹{selectedBill.total?.toFixed(2)}</p>
                  </div>
                </div>

                {/* Bill Items */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Items</h4>
                  <div className="space-y-2">
                    {selectedBill.items?.map((item: any, index: number) => (
                      <div key={item.id || index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex-1">
                          <p className="font-medium text-gray-800">{item.name}</p>
                          <p className="text-sm text-gray-600">
                            Qty: {item.quantity} × ₹{item.price?.toFixed(2)}
                            {item.staffName && ` • Staff: ${item.staffName}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-800">₹{getDisplayTotal(item).toFixed(2)}</p>
                          {item.discount > 0 && (
                            <p className="text-xs text-red-600">
                              -₹{((item.price * item.quantity * item.discount) / 100).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment Information */}
                {selectedBill.payments && selectedBill.payments.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-3">Payment Methods</h4>
                    <div className="space-y-2">
                      {getSalePaymentLinesWithDates(selectedBill).map((line, index: number) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <span className="font-medium text-gray-700">
                            {line.mode}
                            <span className="text-gray-500 font-normal"> · {formatPaymentRecordedDateLabel(line.recordedAt)}</span>
                          </span>
                          <span className="font-semibold text-gray-800">₹{line.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional Details */}
                {(selectedBill.notes || selectedBill.staffName) && (
                  <div className="space-y-3">
                    {selectedBill.staffName && (
                      <div>
                        <p className="text-sm text-gray-600">Staff Member</p>
                        <p className="font-semibold text-gray-800">{selectedBill.staffName}</p>
                      </div>
                    )}
                    {selectedBill.notes && (
                      <div>
                        <p className="text-sm text-gray-600">Notes</p>
                        <p className="font-medium text-gray-800">{selectedBill.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBillDetailsDialog(false)} className="border-gray-200 text-gray-700 hover:bg-gray-50">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Receipt Dialog */}
        <ReceiptDialog
          receipt={currentReceipt}
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          onReceiptUpdate={(updatedReceipt) => {
            setCurrentReceipt(updatedReceipt)
            toast({ title: "Success", description: "Receipt updated successfully" })
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-white/80 backdrop-blur-sm pr-96">
        <div className="p-8 space-y-8 max-h-screen overflow-y-auto">
          {billLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium">Loading bill details...</p>
              </div>
            </div>
          ) : (
          <>
          {catalogLoadError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/95 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex gap-2 text-amber-900 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>
                  Services or staff list did not load (connection may have dropped after idle). Retry to refresh catalogs.
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-300"
                onClick={() => setCatalogRetryKey((k) => k + 1)}
              >
                Retry
              </Button>
            </div>
          )}
          {(mode === "edit" || mode === "exchange") && initialSale && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="rounded-lg bg-amber-100 p-2">
                <Edit className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="font-semibold text-amber-900">
                  {mode === "edit" ? "Editing Bill" : "Exchanging Products"}:{" "}
                  {initialSale.billNo || initialSale.receiptNumber}
                  {initialSale.isEdited && <span className="ml-1 text-xs text-gray-500">(edited)</span>}
                </p>
                <p className="text-sm text-amber-700">
                  Original Date: {initialSale.date ? format(new Date(initialSale.date), "dd MMM yyyy") : "N/A"}
                  {initialSale.tip && initialSale.tip > 0 && (
                    <span className="ml-2">• Tip: {formatCurrency(initialSale.tip)}</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Customer and Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3 relative" ref={customerSearchRef}>
              <Label htmlFor="customer" className="text-sm font-semibold text-gray-700">
                Customer * {mode === "edit" && <span className="text-xs text-gray-500 ml-2">(Locked)</span>}
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customer"
                  type="tel"
                  placeholder="Search by name, phone (10 digits), or email"
                  value={customerSearch}
                  disabled={mode === "edit"}
                  className={cn(
                    "pl-10 h-12 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all duration-300",
                    mode === "edit" ? "bg-gray-100 cursor-not-allowed" : ""
                  )}
                  onChange={(e) => {
                    const value = e.target.value
                    // If it's all digits, restrict immediately to 10 digits
                    if (/^\d+$/.test(value)) {
                      const restricted = value.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    } else {
                      handleCustomerSearchChange(value)
                    }
                  }}
                  onPaste={(e) => {
                    // Handle paste events for phone numbers
                    const pastedText = e.clipboardData.getData('text')
                    if (/^\d+$/.test(pastedText)) {
                      e.preventDefault()
                      const restricted = pastedText.slice(0, 10)
                      handleCustomerSearchChange(restricted)
                    }
                  }}
                  onKeyDown={(e) => {
                    // Prevent typing if it's a phone number and already 10 digits
                    if (/^\d+$/.test(customerSearch) && customerSearch.length >= 10) {
                      // Allow backspace, delete, arrow keys, tab, etc.
                      if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) && 
                          !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                      }
                    }
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                />
              </div>

              {/* Customer Dropdown */}
              {showCustomerDropdown && customerSearch && (
                <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-auto backdrop-blur-sm">
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer, index) => (
                      <div
                        key={`${customer._id || customer.id}-${customer.phone}-${index}`}
                        className="p-4 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 cursor-pointer border-b last:border-b-0 transition-all duration-200 group"
                        onClick={() => handleCustomerSelect(customer)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg group-hover:from-indigo-200 group-hover:to-purple-200 transition-all duration-200">
                            <User className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800 group-hover:text-indigo-800 transition-colors duration-200">{customer.name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </span>
                              {customer.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {customer.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="p-4 text-center text-muted-foreground hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 cursor-pointer transition-all duration-200 group"
                      onClick={handleCreateNewCustomer}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="p-2 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg group-hover:from-emerald-200 group-hover:to-green-200 transition-all duration-200">
                          <User className="h-4 w-4 text-emerald-600" />
                        </div>
                        <span className="font-medium">Create new customer: &quot;{customerSearch}&quot;</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-700">
                Date {mode === "edit" && <span className="text-xs text-gray-500 ml-2">(Locked)</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={mode === "edit"}
                    className={cn(
                      "w-full justify-start text-left font-normal h-12 border-gray-200 hover:border-indigo-300 focus:border-indigo-500 focus:ring-indigo-500/20 transition-all duration-300",
                      !selectedDate && "text-muted-foreground",
                      mode === "edit" && "bg-gray-100 cursor-not-allowed",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd MMM, yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                {mode !== "edit" && (
                  <PopoverContent className="w-auto p-0 border-gray-200 shadow-xl" align="start">
                    <DatePicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date: Date | undefined) => { if (date) setSelectedDate(date) }}
                      initialFocus
                    />
                  </PopoverContent>
                )}
              </Popover>
            </div>
          </div>

          {/* Customer snapshot + side panel (notes / bill activity — inline when applicable) */}
          {selectedCustomer && (
            <div
              className={cn(
                "flex w-full min-w-0 flex-col gap-4",
                showCustomerSidePanel && "md:flex-row md:items-start md:gap-6"
              )}
            >
            <div
              className={cn(
                "flex min-h-0 min-w-0 shrink-0 flex-col",
                showCustomerSidePanel ? "w-full md:w-1/2" : "w-full"
              )}
            >
            <div
              ref={customerSnapshotCardRef}
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ring-slate-900/[0.04]",
                isGoldMembershipPlan
                  ? "border-slate-200/90 border-l-[3px] border-l-amber-400"
                  : "border-slate-200/90 border-l-[3px] border-l-indigo-500"
              )}
            >
              <div className="flex flex-col gap-3 border-b border-slate-100/90 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-start gap-3.5">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      isGoldMembershipPlan
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80"
                        : "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80"
                    )}
                  >
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold tracking-tight text-slate-900">
                      {selectedCustomer.name}
                    </h4>
                    <p className="mt-0.5 text-sm text-slate-500 tabular-nums">{selectedCustomer.phone}</p>
                    {selectedCustomer.email && (
                      <p className="mt-0.5 truncate text-sm text-slate-500">{selectedCustomer.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {membershipData?.subscription && !isGoldMembershipPlan && (
                      <Badge
                        variant="outline"
                        className="border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
                      >
                        {membershipData?.plan?.planName || "Membership Applied"}
                      </Badge>
                    )}
                    {showClientWalletBalanceCard && (
                      <button
                        type="button"
                        title={
                          showSeparateWalletCount
                            ? `View wallet activity · ${clientWalletsUsableFiltered.length} wallets`
                            : clientWalletSettings?.combineMultipleWallets &&
                                clientWalletsUsableFiltered.length > 1
                              ? "View wallet activity · combined balance"
                              : "View wallet activity"
                        }
                        onClick={() => void openClientWalletLedger()}
                        className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-800 shadow-sm ring-1 ring-slate-900/[0.04] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                      >
                        <Wallet className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                        <span className="min-w-0 truncate tabular-nums">
                          ₹{totalClientWalletBalance.toFixed(2)}
                          {showSeparateWalletCount ? (
                            <span className="ml-1 font-normal text-slate-500">
                              ({clientWalletsUsableFiltered.length})
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )}
                    {showRewardPointsCustomerUI && rewardPointsSettings && (
                      <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-violet-200/80 bg-violet-50/90 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-violet-900 ring-1 ring-violet-900/[0.08]">
                        <Gift className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden />
                        <span className="min-w-0 truncate">
                          {loyaltyBalance}
                          <span className="ml-0.5 font-normal text-violet-800/90">pts</span>
                        </span>
                      </span>
                    )}
                    {membershipData?.subscription && isGoldMembershipPlan && (
                      <span
                        className="relative inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-full border border-amber-500/55 bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-500 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_2px_10px_rgba(180,83,9,0.4),inset_0_1px_0_rgba(255,255,255,0.55)] ring-1 ring-amber-300/60"
                        title={membershipData?.plan?.planName || "Gold membership"}
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-0 opacity-90"
                        >
                          <span className="absolute inset-y-0 left-0 w-[45%] animate-gold-sheen bg-gradient-to-r from-transparent via-white/70 to-transparent blur-[0.5px]" />
                        </span>
                        <span className="relative z-10 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
                          Gold
                        </span>
                      </span>
                    )}
                  </div>
                  {membershipData?.subscription?.expiryDate && (
                    <p className="text-xs text-slate-500">
                      Valid through{" "}
                      {format(new Date(membershipData.subscription.expiryDate), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
              </div>

              <div className="min-w-0 px-4 py-3 sm:px-5 sm:py-3.5">
                <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
                  <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100/90 bg-slate-50/50 px-2 py-2 shadow-sm ring-1 ring-slate-900/[0.03] sm:px-2.5 sm:py-2.5">
                    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">Visits</p>
                    <p className="mt-1 min-w-0 break-all text-xs font-semibold tabular-nums leading-tight text-slate-900 sm:text-sm">
                      {selectedCustomer.totalVisits || 0}
                    </p>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100/90 bg-slate-50/50 px-2 py-2 shadow-sm ring-1 ring-slate-900/[0.03] sm:px-2.5 sm:py-2.5">
                    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">Revenue</p>
                    <p className="mt-1 min-w-0 break-all text-xs font-semibold tabular-nums leading-tight text-slate-900 sm:text-sm">
                      ₹{Number(selectedCustomer.totalSpent || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100/90 bg-slate-50/50 px-2 py-2 shadow-sm ring-1 ring-slate-900/[0.03] sm:px-2.5 sm:py-2.5">
                    <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">Last visit</p>
                    <p className="mt-1 min-w-0 break-words text-xs font-semibold leading-tight text-slate-900 sm:text-sm">
                      {selectedCustomer.lastVisit ? format(new Date(selectedCustomer.lastVisit), "dd MMM") : "Never"}
                    </p>
                  </div>
                  {(selectedCustomer.totalDues || 0) > 0 && (
                    <button
                      type="button"
                      className="min-w-0 overflow-hidden rounded-lg border border-red-100/90 bg-red-50/50 px-2 py-2 text-left shadow-sm ring-1 ring-red-900/[0.04] transition-colors hover:bg-red-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 sm:px-2.5 sm:py-2.5"
                      onClick={async () => {
                        if (selectedCustomer) {
                          await fetchUnpaidBills(selectedCustomer.phone || "")
                          setShowDuesDialog(true)
                        }
                      }}
                    >
                      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-red-700/90">Dues</p>
                      <p className="mt-1 min-w-0 break-all text-xs font-semibold tabular-nums leading-tight text-red-900 sm:text-sm">
                        ₹{Number(selectedCustomer.totalDues || 0).toFixed(2)}
                      </p>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100/90 bg-slate-50/40 px-4 py-3 sm:flex-row sm:gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void handleViewBillActivity("bills")}
                  className={cn(
                    "h-9 flex-1 min-w-0 text-xs font-medium shadow-sm",
                    billActivityModalTab === "bills"
                      ? "border-indigo-300/90 bg-indigo-50 text-indigo-900 hover:bg-indigo-50/90"
                      : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <FileText
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5 shrink-0",
                      billActivityModalTab === "bills" ? "text-indigo-600" : "text-slate-500"
                    )}
                  />
                  Bill activity
                </Button>
                {customerBillsWithNotes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => void handleViewBillActivity("notes")}
                    className={cn(
                      "h-9 flex-1 min-w-0 text-xs font-medium shadow-sm",
                      billActivityModalTab === "notes"
                        ? "border-indigo-300/90 bg-indigo-50 text-indigo-900 hover:bg-indigo-50/90"
                        : "border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <StickyNote
                      className={cn(
                        "mr-1.5 h-3.5 w-3.5 shrink-0",
                        billActivityModalTab === "notes" ? "text-indigo-600" : "text-slate-500"
                      )}
                    />
                    Customer notes
                  </Button>
                )}
              </div>
            </div>
            </div>

            {showCustomerSidePanel && (
              <div
                className={cn(
                  "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ring-slate-900/[0.04]",
                  "md:w-1/2",
                  snapshotSidePanelHeightPx == null && "min-h-[13rem] max-h-[min(70vh,40rem)] md:max-h-[min(38rem,calc(100dvh-12rem))]",
                  isGoldMembershipPlan
                    ? "border-slate-200/90 border-l-[3px] border-l-amber-400/80"
                    : "border-slate-200/90 border-l-[3px] border-l-indigo-500/90"
                )}
                style={
                  snapshotSidePanelHeightPx != null
                    ? {
                        height: snapshotSidePanelHeightPx,
                        maxHeight: snapshotSidePanelHeightPx,
                        minHeight: snapshotSidePanelHeightPx,
                      }
                    : undefined
                }
              >
                <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100/90 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    {billActivityModalTab === "notes" ? (
                      <div className="flex items-center gap-2">
                        <StickyNote className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        <p className="text-sm font-semibold text-slate-900">Customer notes</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                          <p className="text-sm font-semibold text-slate-900">Bill activity</p>
                        </div>
                        <p className="mt-0.5 pl-6 text-[11px] leading-snug text-slate-500">
                          Recent invoices — open receipt or edit.
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-3 sm:px-5",
                    billActivityModalTab === "notes" && "bg-slate-50/35"
                  )}
                >
                  {customerBillsLoading ? (
                    <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-slate-500">
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-500" />
                      {billActivityModalTab === "notes" ? "Loading notes…" : "Loading invoices…"}
                    </div>
                  ) : billActivityModalTab === "notes" ? (
                    <>
                      {customerBills.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
                          No invoices for this customer yet.
                        </div>
                      ) : customerBillsWithNotes.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
                          No notes on past invoices yet.
                        </div>
                      ) : (
                        <ul className="space-y-2.5 pb-2">
                          {[...customerBillsWithNotes]
                            .sort((a, b) => {
                              const ta = new Date(a.date).getTime()
                              const tb = new Date(b.date).getTime()
                              return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
                            })
                            .map((bill) => {
                              const billNo = quickSaleBillNoForBillingRoute(bill)
                              const dateLine = formatCustomerBillDateTimeLine(bill).replace(" · ", ", ")
                              const staffLabel = String(bill.staffNames || bill.staffName || "").trim()
                              const cardClass =
                                "block w-full rounded-lg border border-white/80 bg-white/90 p-2.5 text-left shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-3"
                              const inner = (
                                <>
                                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-medium text-slate-500 sm:text-xs">
                                      {dateLine}
                                    </span>
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
                                      Bill / sale
                                    </Badge>
                                    {billNo ? (
                                      <span className="font-mono text-[10px] text-slate-500 sm:text-xs">
                                        #{bill.receiptNumber || bill.id || "—"}
                                      </span>
                                    ) : null}
                                    {staffLabel ? (
                                      <span className="text-[10px] text-slate-600 sm:text-xs">• {staffLabel}</span>
                                    ) : null}
                                  </div>
                                  <p className="text-xs leading-relaxed text-slate-900 whitespace-pre-wrap break-words sm:text-sm">
                                    {String(bill.notes || "").trim()}
                                  </p>
                                </>
                              )
                              return (
                                <li key={`inline-note-${bill.id}`}>
                                  {billNo ? (
                                    <button
                                      type="button"
                                      className={cn(cardClass, "cursor-pointer font-inherit")}
                                      onClick={() => void openCustomerBillInvoicePreview(billNo)}
                                    >
                                      {inner}
                                    </button>
                                  ) : (
                                    <div className={cardClass}>{inner}</div>
                                  )}
                                </li>
                              )
                            })}
                        </ul>
                      )}
                    </>
                  ) : customerBills.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
                      No bills found for this customer.
                    </div>
                  ) : (
                    <div className="space-y-2 pb-2">
                      {[...customerBills]
                        .sort((a, b) => {
                          const ta = new Date(a.date).getTime()
                          const tb = new Date(b.date).getTime()
                          return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
                        })
                        .map((bill) => (
                        <div key={bill.id} className="rounded-md border border-slate-100/90 p-3 hover:bg-slate-50/80">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium text-sm text-slate-900">
                                #{bill.receiptNumber}
                                {(bill.isEdited === true || bill.editedAt) && (
                                  <span className="ml-1 text-[11px] font-normal text-slate-500">(edited)</span>
                                )}
                              </h4>
                              <p className="mt-0.5 text-xs text-slate-600 tabular-nums">
                                {formatCustomerBillDateTimeLine(bill)}
                              </p>
                              <p className="text-xs text-slate-600">
                                Staff: {bill.staffNames || bill.staffName}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <p className="text-sm font-semibold tabular-nums text-emerald-700">
                                ₹{bill.total.toFixed(2)}
                              </p>
                              <p className="text-[11px] capitalize text-slate-500">
                                {bill.payments?.[0]?.type || "Cash"}
                              </p>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const bn = quickSaleBillNoForBillingRoute(bill)
                                    if (bn) {
                                      router.push(`/billing/${encodeURIComponent(bn)}?mode=edit`)
                                    }
                                  }}
                                  title="Edit bill"
                                  className="h-7 w-7 p-0"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                {bill.items &&
                                  bill.items.some((item: { type?: string }) => item.type === "product") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        const bn = quickSaleBillNoForBillingRoute(bill)
                                        if (bn) {
                                          router.push(`/billing/${encodeURIComponent(bn)}?mode=exchange`)
                                        }
                                      }}
                                      title="Exchange products"
                                      className="h-7 w-7 border-blue-200 p-0 text-blue-700 hover:bg-blue-50"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                    </Button>
                                  )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    openCustomerBillInvoicePreview(String(bill.receiptNumber || bill.id))
                                  }
                                  title="View invoice"
                                  className="h-7 w-7 p-0"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          )}

          {/* Services Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-gray-800">Services</h3>
                <p className="text-sm text-muted-foreground">Add services to the sale</p>
              </div>
              <Button onClick={addServiceItem} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <Plus className="h-4 w-4 mr-2" />
                Add Service
              </Button>
            </div>

            {serviceItems.length > 0 && (
              <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 font-semibold text-sm text-gray-700 border-b sticky top-0 bg-white z-10">
                  <div>Service *</div>
                  <div>Staff *</div>
                  <div>Qty</div>
                  <div>Price (₹)</div>
                  <div>Disc. (%)</div>
                  <div>Total (₹)</div>
                  <div></div>
                </div>

                <div style={{ overflow: 'visible' }}>
                  {serviceItems.map((item, serviceIndex) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-gray-50/50 transition-all duration-200"
                  >
                    <div className="relative" data-quicksale-dropdown>
                      {item.serviceId ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between h-8 px-3 py-1 bg-muted rounded-md text-sm">
                            <span className="truncate">
                              {services.find(s => (s._id || s.id) === item.serviceId)?.name || 'Unknown Service'}
                            </span>
                            <button
                              onClick={() => updateServiceItem(item.id, "serviceId", "")}
                              className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          </div>
                          {(item.isMembershipFree || (item.membershipDiscountPercent ?? 0) > 0) && (
                            <span
                              className={`text-xs ${item.isMembershipFree && (membershipFreeRemainingAfterBillByServiceId.get(String(item.serviceId)) ?? 0) < 0 ? "text-amber-600" : "text-emerald-600"}`}
                            >
                              {item.isMembershipFree ? (
                                (() => {
                                  const rem = membershipFreeRemainingAfterBillByServiceId.get(String(item.serviceId))
                                  const q = Number(item.quantity)
                                  const usedQty =
                                    Number.isFinite(q) && q > 0 ? Math.floor(q) : 1
                                  const avail =
                                    rem === undefined ? "—" : String(rem)
                                  return `Available Free Services: ${avail}, Used Service: ${usedQty}`
                                })()
                              ) : (
                                `${item.membershipDiscountPercent}% Membership Discount`
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            placeholder="Search services..."
                            value={serviceDropdownSearch}
                            onChange={(e) => setServiceDropdownSearch(e.target.value)}
                            className="h-8 pl-7 pr-8 text-sm"
                            onFocus={(e) => {
                              e.target.select()
                              setActiveServiceDropdown(item.id)
                            }}
                          />
                          {serviceDropdownSearch && (
                            <button
                              onClick={() => {
                                setServiceDropdownSearch("")
                                setActiveServiceDropdown(null)
                              }}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}
                      {activeServiceDropdown === item.id && (
                        <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                          {loadingServices ? (
                            <div className="p-2 text-center text-sm text-muted-foreground">Loading services...</div>
                          ) : (
                            <>
                              {filteredServicesForDropdown.length === 0 ? (
                                <div className="p-2 text-center text-sm text-muted-foreground">
                                  {serviceDropdownSearch ? `No services found matching "${serviceDropdownSearch}"` : 'No services available'}
                                </div>
                              ) : (
                                <div className="py-1">
                                  {categoryOrder.map((category) => (
                                    <div key={category} className="mb-2 last:mb-0">
                                      <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                                        {category}
                                      </div>
                                      {servicesByCategory[category].map((service) => (
                                        <div
                                          key={service._id || service.id}
                                          className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm transition-colors"
                                          onClick={() => {
                                            updateServiceItem(item.id, "serviceId", service._id || service.id)
                                            setServiceDropdownSearch("")
                                            setActiveServiceDropdown(null)
                                          }}
                                        >
                                          <User className="h-4 w-4 text-slate-400 shrink-0" />
                                          <span className="flex-1 font-medium text-slate-800 truncate">{service.name}</span>
                                          <span className="text-slate-600 shrink-0">{formatCurrency(service.price ?? service.offerPrice ?? 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <MultiStaffSelector
                      key={`service-${item.id}-staff`}
                      staffList={getAvailableStaffList(
                        services.find((s) => (s._id || s.id) === item.serviceId)?.duration ?? 60,
                        [...new Set([
                          ...(item.staffContributions || []).map((c) => c.staffId).filter(Boolean),
                          ...serviceItems.filter((s) => s.id !== item.id).flatMap((s) => (s.staffContributions || []).map((c) => c.staffId).filter(Boolean)),
                        ])],
                        serviceIndex
                      )}
                      serviceTotal={getLinePreTaxTotal({
                        price: item.price,
                        quantity: item.quantity,
                        discount: item.discount ?? 0,
                        total: item.total,
                        taxRate: isServiceTaxable(item) ? (taxSettings?.serviceTaxRate || 5) : 0,
                      })}
                      compact
                      selectStaffFlex={1.5}
                      addStaffFlex={0.5}
                      onStaffContributionsChange={(contributions) => {
                        updateServiceItem(item.id, "staffContributions", contributions)
                        if (contributions.length > 0) {
                          updateServiceItem(item.id, "staffId", contributions[0].staffId)
                        } else {
                          updateServiceItem(item.id, "staffId", "")
                        }
                      }}
                      initialContributions={item.staffContributions || []}
                      disabled={loadingStaff}
                    />

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 p-0 bg-transparent"
                        onClick={() => updateServiceItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 p-0 bg-transparent"
                        onClick={() => updateServiceItem(item.id, "quantity", item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <Input
                      type="number"
                      value={focusedZeroInputKey === `service-price-${item.id}` && item.price === 0 ? "" : item.price}
                      onChange={(e) => updateServiceItem(item.id, "price", Number(e.target.value))}
                      onFocus={() => setFocusedZeroInputKey(`service-price-${item.id}`)}
                      onBlur={() => setFocusedZeroInputKey(null)}
                      className="h-8"
                    />

                    <Input
                      type="number"
                      value={
                        focusedZeroInputKey === `service-discount-${item.id}` && (isGlobalDiscountActive ? discountPercentage : item.discount) === 0
                          ? ""
                          : isGlobalDiscountActive ? discountPercentage : item.discount
                      }
                      onChange={(e) => updateServiceItem(item.id, "discount", Number(e.target.value))}
                      onFocus={() => setFocusedZeroInputKey(`service-discount-${item.id}`)}
                      onBlur={() => setFocusedZeroInputKey(null)}
                      className={`h-8 ${(isGlobalDiscountActive || isValueDiscountActive) ? 'bg-amber-50 border-amber-200' : ''}`}
                      disabled={isGlobalDiscountActive || isValueDiscountActive}
                      placeholder={(isGlobalDiscountActive || isValueDiscountActive) ? "Global discount" : "0"}
                    />

                    <div className="text-sm font-medium">
                      ₹{getDisplayTotal(item).toFixed(2)}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => removeServiceItem(item.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Products Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-gray-800">Products</h3>
                <p className="text-sm text-muted-foreground">Add products to the sale</p>
              </div>
              <Button onClick={addProductItem} className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>

            {productItems.length > 0 && (
              <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 font-semibold text-sm text-gray-700 border-b sticky top-0 bg-white z-10">
                  <div>Product *</div>
                  <div>Staff *</div>
                  <div>Qty</div>
                  <div>Price (₹)</div>
                  <div>Disc. (%)</div>
                  <div>Total (₹)</div>
                  <div></div>
                </div>

                <div style={{ overflow: 'visible' }}>
                  {productItems.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="grid grid-cols-[2fr_2fr_120px_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-emerald-50/30 transition-all duration-200">
                      <div className="relative" data-quicksale-dropdown>
                        {item.productId ? (
                          <div className="flex items-center justify-between h-8 px-3 py-1 bg-muted rounded-md text-sm">
                            <span className="truncate">
                              {products.find(p => (p._id || p.id) === item.productId)?.name || 'Unknown Product'}
                            </span>
                            <button
                              onClick={() => updateProductItem(item.id, "productId", "")}
                              className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Search products..."
                              value={productDropdownSearch}
                              onChange={(e) => setProductDropdownSearch(e.target.value)}
                              className="h-8 pl-7 pr-8 text-sm"
                              onFocus={(e) => {
                                e.target.select()
                                setActiveProductDropdown(item.id)
                              }}
                            />
                            {productDropdownSearch && (
                              <button
                                onClick={() => {
                                  setProductDropdownSearch("")
                                  setActiveProductDropdown(null)
                                }}
                                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground hover:text-foreground"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                        {activeProductDropdown === item.id && (
                          <div className="absolute top-full left-0 right-0 z-[9999] mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                            {loadingProducts ? (
                              <div className="p-2 text-center text-sm text-muted-foreground">Loading products...</div>
                            ) : (
                              <>
                                {filteredProductsForDropdown.length === 0 ? (
                                  <div className="p-2 text-center text-sm text-muted-foreground">
                                    {productDropdownSearch ? `No products found matching "${productDropdownSearch}"` : 'No products available'}
                                  </div>
                                ) : (
                                  <div className="py-1">
                                    {productCategoryOrder.map((category) => (
                                      <div key={category} className="mb-2 last:mb-0">
                                        <div className="px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                                          {category}
                                        </div>
                                        {productsByCategory[category].map((product) => (
                                          <div
                                            key={product._id || product.id}
                                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm transition-colors"
                                            onClick={() => {
                                              updateProductItem(item.id, "productId", product._id || product.id)
                                              setProductDropdownSearch("")
                                              setActiveProductDropdown(null)
                                            }}
                                          >
                                            <PackageIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                            <span className="flex-1 min-w-0">
                                              <span className="font-medium text-slate-800 truncate block">{product.name}</span>
                                              <span className="text-xs text-slate-500">Stock: {product.stock ?? 0}</span>
                                            </span>
                                            <span className="text-slate-600 shrink-0">{formatCurrency(product.price ?? product.offerPrice ?? 0)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <Select
                        key={`product-${item.id}-staff`}
                        value={item.staffId}
                        onValueChange={(value) => updateProductItem(item.id, "staffId", value)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select staff" />
                        </SelectTrigger>
                        <SelectContent>
                          {loadingStaff ? (
                            <SelectItem value="__loading__" disabled>
                              Loading staff...
                            </SelectItem>
                          ) : staff.length === 0 ? (
                            <SelectItem value="no-staff" disabled>
                              No active staff available
                            </SelectItem>
                          ) : (
                            (() => {
                              const availableStaff = getAvailableStaffList(15, item.staffId ? [item.staffId] : undefined)
                              const validStaff = availableStaff.filter((member) => {
                                const validId = member._id || member.id
                                const isValid = validId && validId.toString().trim() !== ''
                                return isValid
                              })
                              
                              if (validStaff.length === 0) {
                                return (
                                  <SelectItem value="no-valid-staff" disabled>
                                    No valid staff available
                                  </SelectItem>
                                )
                              }
                              
                              return validStaff.map((member) => {
                                const staffId = member._id || member.id
                                return (
                                  <SelectItem key={staffId} value={staffId}>
                                    {member.name}
                                  </SelectItem>
                                )
                              })
                            })()
                          )}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 bg-transparent"
                          onClick={() => updateProductItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 p-0 bg-transparent"
                          onClick={() => updateProductItem(item.id, "quantity", item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Input
                        type="number"
                        value={focusedZeroInputKey === `product-price-${item.id}` && item.price === 0 ? "" : item.price}
                        onChange={(e) => updateProductItem(item.id, "price", Number(e.target.value))}
                        onFocus={() => setFocusedZeroInputKey(`product-price-${item.id}`)}
                        onBlur={() => setFocusedZeroInputKey(null)}
                        className="h-8"
                      />

                      <Input
                        type="number"
                        value={
                          focusedZeroInputKey === `product-discount-${item.id}` && (isGlobalDiscountActive ? discountPercentage : item.discount) === 0
                            ? ""
                            : isGlobalDiscountActive ? discountPercentage : item.discount
                        }
                        onChange={(e) => updateProductItem(item.id, "discount", Number(e.target.value))}
                        onFocus={() => setFocusedZeroInputKey(`product-discount-${item.id}`)}
                        onBlur={() => setFocusedZeroInputKey(null)}
                        className={`h-8 ${(isGlobalDiscountActive || isValueDiscountActive) ? 'bg-amber-50 border-amber-200' : ''}`}
                        disabled={isGlobalDiscountActive || isValueDiscountActive}
                        placeholder={(isGlobalDiscountActive || isValueDiscountActive) ? "Global discount" : "0"}
                      />

                      <div className="text-sm font-medium">
                        ₹{getDisplayTotal(item).toFixed(2)}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                        onClick={() => removeProductItem(item.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    {/* Stock Warning */}
                    {item.productId && (() => {
                      const product = products.find((p) => p._id === item.productId || p.id === item.productId)
                      if (product && item.quantity > product.stock) {
                        return (
                          <div className="px-3 text-xs text-red-600 font-medium">
                            ⚠️ Insufficient stock! Available: {product.stock}, Requested: {item.quantity}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Items Section */}
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" onClick={() => addMembershipItem()}>
                Add Membership
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addPackageItem()}>
                Add Package
              </Button>
              <Button
                type="button"
                variant={addItemSection === 'gift-voucher' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddItemSection((prev) => (prev === 'gift-voucher' ? null : 'gift-voucher'))}
              >
                Add Gift Voucher
              </Button>
              <Button
                type="button"
                variant={addItemSection === 'prepaid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddItemSection((prev) => (prev === 'prepaid' ? null : 'prepaid'))}
              >
                Add Prepaid Plans
              </Button>
            </div>
            <div className="mt-4 space-y-6">
              {membershipItems.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer
                      ? membershipData?.subscription
                        ? "Customer already has an active membership."
                        : "Add a membership plan to assign on checkout."
                      : "Select a customer above to add membership."}
                  </p>
                  <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                    <div className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 font-semibold text-sm text-gray-700 border-b">
                      <div>Plan *</div>
                      <div>Staff *</div>
                      <div>Qty</div>
                      <div>Price (₹)</div>
                      <div>Plan total (₹)</div>
                      <div></div>
                    </div>
                    {membershipItems.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-indigo-50/30 transition-all duration-200"
                      >
                        <Select
                          value={item.planId || "__none__"}
                          onValueChange={(v) => updateMembershipItem(item.id, "planId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select plan" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select plan</SelectItem>
                            {plans.map((p) => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.planName} — ₹{Number(p.price || 0).toFixed(2)} ({p.durationInDays} days)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={item.staffId || "__none__"}
                          onValueChange={(v) => updateMembershipItem(item.id, "staffId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select staff" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select staff</SelectItem>
                            {getAvailableStaffList(15, item.staffId ? [item.staffId] : undefined).map((member) => {
                              const staffId = member._id || member.id
                              return (
                                <SelectItem key={staffId} value={staffId}>
                                  {member.name}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => updateMembershipItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => updateMembershipItem(item.id, "quantity", item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input
                          type="number"
                          value={item.price}
                          readOnly
                          className="h-8 bg-muted"
                        />
                        <div className="text-sm font-medium">₹{getDisplayTotal(item).toFixed(2)}</div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMembershipItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {plans.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={addMembershipItem}>
                      Add another membership
                    </Button>
                  )}
                </div>
              )}
              {packageItems.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer && isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined)
                      ? "Package price is added to this bill; the client’s package is activated when checkout completes."
                      : "Select an existing customer from search to sell packages on this bill."}
                  </p>
                  <div className="border border-gray-200 rounded-xl shadow-sm bg-white">
                    <div className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 bg-gradient-to-r from-cyan-50 to-sky-50 font-semibold text-sm text-gray-700 border-b">
                      <div>Package *</div>
                      <div>Staff *</div>
                      <div>Qty</div>
                      <div>Price (₹)</div>
                      <div>Package total (₹)</div>
                      <div></div>
                    </div>
                    {packageItems.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[2fr_1.5fr_100px_100px_100px_40px] gap-4 p-4 border-b last:border-b-0 items-center hover:bg-cyan-50/30 transition-all duration-200"
                      >
                        <Select
                          value={item.packageId || "__none__"}
                          onValueChange={(v) => updatePackageItem(item.id, "packageId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select package" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select package</SelectItem>
                            {packagesCatalog.map((p) => (
                              <SelectItem key={p._id} value={p._id}>
                                {p.name} — ₹{Number(p.total_price || 0).toFixed(2)} ({p.total_sittings} sittings)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={item.staffId || "__none__"}
                          onValueChange={(v) => updatePackageItem(item.id, "staffId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select staff" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select staff</SelectItem>
                            {getAvailableStaffList(15, item.staffId ? [item.staffId] : undefined).map((member) => {
                              const staffId = member._id || member.id
                              return (
                                <SelectItem key={staffId} value={staffId}>
                                  {member.name}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => updatePackageItem(item.id, "quantity", Math.max(1, item.quantity - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <div className="w-8 text-center text-sm font-medium">{item.quantity}</div>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 p-0"
                            onClick={() => updatePackageItem(item.id, "quantity", item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Input type="number" value={item.price} readOnly className="h-8 bg-muted" />
                        <div className="text-sm font-medium">₹{getDisplayTotal(item).toFixed(2)}</div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removePackageItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {packagesCatalog.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={addPackageItem}>
                      Add another package
                    </Button>
                  )}
                </div>
              )}
              {addItemSection === 'gift-voucher' && null}
              {addItemSection === "prepaid" && (
                <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-orange-50/40 p-4 space-y-3 shadow-sm">
                  {!selectedCustomer || !isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined) ? (
                    <p className="text-sm text-amber-800">Select an existing customer above first.</p>
                  ) : loadingPrepaidWalletPlans ? (
                    <p className="text-sm text-muted-foreground">Loading plans…</p>
                  ) : prepaidWalletPlansForIssue.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      No active wallet plans. Add plans under{" "}
                      <span className="font-medium">Settings → Prepaid wallet</span>.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="border border-amber-100 rounded-lg bg-white/80 overflow-hidden">
                        <div className="grid grid-cols-[2fr_1.5fr_80px_100px_100px_40px] gap-2 p-3 bg-amber-100/40 text-xs font-semibold text-amber-950 border-b border-amber-100">
                          <div>Plan *</div>
                          <div>Staff *</div>
                          <div>Qty</div>
                          <div>Pay (₹)</div>
                          <div>Line (₹)</div>
                          <div />
                        </div>
                        {prepaidPlanItems.map((item) => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[2fr_1.5fr_80px_100px_100px_40px] gap-2 p-3 border-b border-amber-50/80 last:border-0 items-center text-sm"
                          >
                            <Select
                              value={item.planId || "__none__"}
                              onValueChange={(v) => updatePrepaidPlanItem(item.id, "planId", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 bg-white">
                                <SelectValue placeholder="Select plan" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Select plan</SelectItem>
                                {prepaidWalletPlansForIssue.map((p) => (
                                  <SelectItem key={p._id} value={String(p._id)}>
                                    {p.name} — ₹{p.payAmount} → ₹{p.creditAmount}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={item.staffId || "__none__"}
                              onValueChange={(v) => updatePrepaidPlanItem(item.id, "staffId", v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="h-8 bg-white">
                                <SelectValue placeholder="Staff" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Select staff</SelectItem>
                                {staff.map((member) => {
                                  const sid = member._id || member.id
                                  return (
                                    <SelectItem key={String(sid)} value={String(sid)}>
                                      {member.name}
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                            <div className="text-center text-muted-foreground tabular-nums">1</div>
                            <div className="text-sm tabular-nums">{item.planId ? item.price.toFixed(0) : "—"}</div>
                            <div className="text-sm font-medium tabular-nums">
                              {item.planId ? `₹${item.total.toFixed(2)}` : "—"}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removePrepaidPlanItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addPrepaidPlanItem}>
                        Add prepaid plan line
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Discounts & Offers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Discounts & Offers</h3>
              {(isGlobalDiscountActive || isValueDiscountActive) && (
                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                  ⚠️ {isValueDiscountActive ? 'Value discount active' : 'Global discount active'} - Individual discounts disabled
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount-value">Disc. by Value</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm">₹</span>
                  <Input
                    id="discount-value"
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className="pl-8"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount-percentage">Disc. by Percentage</Label>
                <div className="relative">
                  <Input
                    id="discount-percentage"
                    type="number"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                    onFocus={(e) => e.target.select()}
                    className={`pr-8 ${isValueDiscountActive ? 'bg-amber-50 border-amber-200' : ''}`}
                    placeholder="0"
                    disabled={isValueDiscountActive}
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gift-voucher">Redeem Gift Voucher</Label>
                <Input
                  id="gift-voucher"
                  value={giftVoucher}
                  onChange={(e) => setGiftVoucher(e.target.value)}
                  placeholder="Eg: YKL/VPPM"
                />
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Billing Summary Sidebar - Fixed Position */}
      <div className="w-96 bg-white border-l border-gray-100 shadow-xl h-[calc(100vh-5rem)] flex flex-col fixed right-0 top-20 z-50">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-50 bg-white flex-shrink-0">
          <h3 className="text-xl font-semibold text-gray-900">Billing Summary</h3>
          <p className="text-sm text-gray-500 mt-1">Review and complete the sale</p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="px-6 py-4 space-y-2 flex-1">
            {/* Order Summary: Service Total → Discounts → Sub Total → GST → Total → Tip → Grand Total */}
            <div className="bg-gray-50/50 rounded-xl p-2 space-y-1 border border-gray-200">
              {/* 1. Service Total (price × qty for services only) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Service Total</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(billingServiceTotal)}</span>
              </div>

              {/* Product Total (when products present) */}
              {productItems.length > 0 && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Product Total</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(billingProductTotal)}</span>
                </div>
              )}

              {membershipItems.some((m) => m.planId) && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Membership Total</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(billingMembershipTotal)}</span>
                </div>
              )}

              {packageItems.some((p) => p.packageId) && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Package Total</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(billingPackageTotal)}</span>
                </div>
              )}

              {prepaidPlanItems.some((p) => p.planId) && (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Prepaid plans</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(billingPrepaidTotal)}</span>
                </div>
              )}

              {/* 2. Discounts (Manual + Global) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Discounts</span>
                <span className={`text-sm font-medium ${discounts > 0 ? "text-red-500" : "text-gray-500"}`}>
                  {discounts > 0 ? `-${formatCurrency(discounts)}` : formatCurrency(0)}
                </span>
              </div>

              {/* 3. Sub Total (pre-tax: services + products + membership + package bases, minus discounts) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Sub total (pre-tax)</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(subTotal)}</span>
              </div>

              {/* 4. GST - expandable dropdown for SGST/CGST */}
              <div>
                <button
                  type="button"
                  onClick={() => setSummaryExpanded((v) => !v)}
                  className="flex w-full justify-between items-center py-1 hover:bg-gray-100/50 rounded-md transition-colors -mx-1 px-1"
                >
                  <span className="text-sm text-gray-600">GST{priceInclusiveOfTax ? " (included)" : ""}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(totalTax)}</span>
                    {summaryExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                    )}
                  </div>
                </button>
                {summaryExpanded && (
                  <div className="pl-2 space-y-0.5 border-l-2 border-gray-200 ml-1">
                    {serviceTax > 0 && (
                      <>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">CGST @ {serviceCGSTRate.toFixed(1)}%</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(serviceCGST)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">SGST @ {serviceSGSTRate.toFixed(1)}%</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(serviceSGST)}</span>
                        </div>
                      </>
                    )}
                    {productTaxByCategory.map((categoryTax) => (
                      <div key={categoryTax.category}>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">CGST @ {categoryTax.cgstRate.toFixed(1)}% ({categoryTax.categoryLabel})</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(categoryTax.cgst)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">SGST @ {categoryTax.sgstRate.toFixed(1)}% ({categoryTax.categoryLabel})</span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(categoryTax.sgst)}</span>
                        </div>
                      </div>
                    ))}
                    {membershipTax > 0 && (
                      <>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            CGST @ {((taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5) / 2).toFixed(1)}% (Membership)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(membershipTax / 2)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            SGST @ {((taxSettings?.membershipTaxRate ?? taxSettings?.serviceTaxRate ?? 5) / 2).toFixed(1)}% (Membership)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(membershipTax / 2)}</span>
                        </div>
                      </>
                    )}
                    {packageTax > 0 && (
                      <>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            CGST @ {((taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5) / 2).toFixed(1)}% (Package)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(packageTax / 2)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            SGST @ {((taxSettings?.packageTaxRate ?? taxSettings?.serviceTaxRate ?? 5) / 2).toFixed(1)}% (Package)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(packageTax / 2)}</span>
                        </div>
                      </>
                    )}
                    {prepaidWalletTax > 0 && (
                      <>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            CGST @{" "}
                            {(
                              (taxSettings?.prepaidWalletTaxRate ??
                                taxSettings?.serviceTaxRate ??
                                5) / 2
                            ).toFixed(1)}
                            %
                            (Prepaid)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(prepaidWalletTax / 2)}</span>
                        </div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-sm text-gray-500">
                            SGST @{" "}
                            {(
                              (taxSettings?.prepaidWalletTaxRate ??
                                taxSettings?.serviceTaxRate ??
                                5) / 2
                            ).toFixed(1)}
                            %
                            (Prepaid)
                          </span>
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(prepaidWalletTax / 2)}</span>
                        </div>
                      </>
                    )}
                    {totalTax === 0 && (
                      <div className="text-sm text-gray-500 py-0.5">No tax applied</div>
                    )}
                  </div>
                )}
              </div>

              {/* 5. Total (Sub Total + GST with round off) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Total</span>
                <span className="text-sm font-medium text-gray-900">{formatCurrency(baseRounded)}</span>
              </div>
              {Math.abs(roundOff) > 0.01 && (
                <div className="flex justify-between text-sm pl-2">
                  <span className="text-gray-500">Round Off</span>
                  <span className="font-medium text-gray-700">{formatCurrency(roundOff)}</span>
                </div>
              )}
              {loyaltyDiscountLive > 0 && (
                <div className="flex justify-between items-center py-0.5 text-violet-800">
                  <span className="text-sm flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Points discount
                  </span>
                  <span className="text-sm font-medium">−{formatCurrency(loyaltyDiscountLive)}</span>
                </div>
              )}

              {/* 6. Tip (Optional) */}
              <div className="flex justify-between items-center py-1">
                <span className="text-sm text-gray-600">Tip (Optional)</span>
                {tip > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(tip)}</span>
                    <button
                      onClick={handleTipClick}
                      className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                      title="Edit tip amount"
                    >
                      <Pencil className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                    </button>
                    <button
                      onClick={() => { setTip(0); setTipStaffId(null) }}
                      className="p-1 hover:bg-red-50 rounded-md transition-colors"
                      title="Remove tip"
                    >
                      <Trash2 className="h-3 w-3 text-gray-500 hover:text-red-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleTipClick}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    Add
                  </button>
                )}
              </div>

              {/* 7. Grand Total */}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">Grand Total</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(roundedTotal)}</span>
                </div>
              </div>
            </div>

            {/* Change Display - Modern */}
            <div className="bg-emerald-50/50 rounded-xl p-2 border border-emerald-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-emerald-700">Change</span>
                <span className="text-sm font-bold text-emerald-600">{formatCurrency(change)}</span>
              </div>
            </div>

            {mode !== "exchange" &&
              change > 0.01 &&
              !isCashOnlyCheckout &&
              cashAmount >= PAY_EPS &&
              isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined) && (
                <div className="rounded-lg border border-slate-200/90 bg-slate-50/80 p-3 text-sm leading-snug text-slate-800">
                  <p className="font-medium text-slate-900">Cash-only for wallet change</p>
                  <p className="mt-1 text-slate-700">
                    To credit bill change to prepaid, pay this bill entirely in cash. Card, online, or wallet payment
                    cannot be combined with this option.
                  </p>
                </div>
              )}

            {mode !== "exchange" && change > 0.01 && (
              !isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined) && (
                <div className="rounded-lg border border-amber-200/90 bg-amber-50/60 p-3 text-sm leading-snug text-amber-950">
                  <p className="font-medium text-amber-900">Wallet credit isn&apos;t available here</p>
                  <p className="mt-1 text-amber-950/90">
                    Select a saved customer from search (not only a typed name) to credit change to prepaid. For now,
                    enter payment equal to the bill total or return cash change.
                  </p>
                </div>
              )
            )}

            {/* Remarks - Modern */}
            <div className="space-y-1">
              <Label className="text-sm font-medium text-gray-700">Remarks</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add remarks..."
                className="h-12 text-sm resize-none rounded-lg border-gray-200 focus:border-indigo-300 focus:ring-indigo-200"
              />
            </div>

            {/* Payment Section - Modern */}
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1">
                <span className="text-base font-semibold text-gray-900">Payable Amount</span>
                <span className="text-xl font-bold text-indigo-600">{formatCurrency(roundedTotal)}</span>
              </div>

              {/* Payment Methods - Modern Grid */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Payment Methods</h4>

                {showRedemptionSection && (
                  <div className="space-y-2 border-b border-gray-100 pb-3">
                    {(walletRedemptionBlockedByItems || rewardRedemptionBlockedByItems) &&
                      hasAnyBillLineForRedemption && (
                      <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/80 rounded-md px-2 py-1.5">
                        Redemption is not allowed for the selected bill items as per payment configuration.
                      </p>
                    )}
                    {showExclusiveRedemptionPicker ? (
                      <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
                        <Label
                          id="qs-redeem-method-label"
                          className="text-xs font-medium text-slate-800 shrink-0 mb-0"
                        >
                          Choose Redemption Method
                        </Label>
                        <RadioGroup
                          aria-labelledby="qs-redeem-method-label"
                          value={exclusiveRedemptionMethod ?? undefined}
                          onValueChange={(v) => {
                            if (v === "wallet" || v === "reward") setExclusiveRedemptionMethod(v)
                          }}
                          className="flex flex-row flex-wrap items-center gap-x-5 gap-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="wallet" id="qs-redeem-wallet" />
                            <Label htmlFor="qs-redeem-wallet" className="text-sm font-normal cursor-pointer mb-0">
                              Wallet
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="reward" id="qs-redeem-reward" />
                            <Label htmlFor="qs-redeem-reward" className="text-sm font-normal cursor-pointer mb-0">
                              Reward Points
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    ) : null}
                    {showWalletInput && showSeparateWalletCount ? (
                      <select
                        className="w-full h-9 text-sm rounded-md border border-gray-200 bg-white px-2 text-gray-800"
                        value={selectedWalletId}
                        onChange={(e) => {
                          setSelectedWalletId(e.target.value)
                          setWalletPayAmount(0)
                        }}
                      >
                        <option value="">None</option>
                        {clientWallets.map((w) => (
                          <option key={w._id} value={String(w._id)}>
                            {(w.planSnapshot && w.planSnapshot.planName) || "Wallet"} — ₹{w.remainingBalance} left
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="flex flex-row flex-nowrap items-stretch gap-3">
                      {showWalletInput && clientWallets.length > 0 && selectedWalletId ? (
                        <div
                          role="button"
                          tabIndex={walletRedemptionTileDisabled ? -1 : 0}
                          onClick={applyQuickSaleWalletMax}
                          onKeyDown={(e) => {
                            if (walletRedemptionTileDisabled) return
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              applyQuickSaleWalletMax()
                            }
                          }}
                          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                            walletRedemptionTileDisabled
                              ? "cursor-not-allowed border-cyan-200/55 bg-cyan-50/15 opacity-50"
                              : `cursor-pointer ${
                                  walletPayAmount > 0
                                    ? "border-cyan-300/70 bg-cyan-50/35 hover:bg-cyan-50/50"
                                    : "border-cyan-200/65 bg-cyan-50/20 hover:bg-cyan-50/35"
                                }`
                          }`}
                        >
                          <span className="text-sm font-semibold text-cyan-800">Wallet (₹)</span>
                          <Input
                            type="number"
                            value={walletPayAmount || ""}
                            onChange={(e) => setWalletPayAmount(Number(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            onClick={(e) => e.stopPropagation()}
                            min={0}
                            disabled={walletRedemptionTileDisabled}
                            className="h-8 w-full rounded-lg border-cyan-200/90 bg-white text-center text-sm font-medium text-slate-900 [appearance:textfield] placeholder:text-slate-400 focus:border-cyan-400/85 focus:ring-cyan-100/80 disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            style={{ textAlign: "center" }}
                            placeholder="0"
                          />
                        </div>
                      ) : null}
                      {showRewardInput && showRewardPointsCustomerUI && rewardPointsSettings ? (
                        <div
                          className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                            rewardRedemptionBlockedByItems || payCfgMerged.rewardPointRedemption.enabled === false
                              ? "border-rose-200/55 bg-rose-50/15 opacity-50"
                              : loyaltyPointsInput > 0
                                ? "border-rose-300/70 bg-rose-50/35 hover:bg-rose-50/45"
                                : "border-rose-200/65 bg-rose-50/20 hover:bg-rose-50/32"
                          }`}
                        >
                          <span className="text-sm font-semibold text-slate-900">Points</span>
                          {loyaltyBalance >= (rewardPointsSettings.minRedeemPoints || 0) ? (
                            <Input
                              type="number"
                              min={0}
                              step={rewardPointsSettings.redeemPointsStep}
                              value={loyaltyPointsInput || ""}
                              onChange={(e) =>
                                setLoyaltyPointsInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                              }
                              onFocus={(e) => e.target.select()}
                              className="h-8 w-full rounded-lg border-rose-200/90 bg-white text-center text-sm font-medium text-slate-900 [appearance:textfield] placeholder:text-slate-400 focus:border-rose-400/85 focus:ring-rose-100/80 disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              style={{ textAlign: "center" }}
                              placeholder="0"
                              title={`Balance ${loyaltyBalance}, step ${rewardPointsSettings.redeemPointsStep}`}
                              aria-label={`Reward points to redeem. Balance ${loyaltyBalance}, step ${rewardPointsSettings.redeemPointsStep}`}
                              disabled={
                                rewardRedemptionBlockedByItems || payCfgMerged.rewardPointRedemption.enabled === false
                              }
                            />
                          ) : (
                            <p className="px-1 text-center text-xs leading-snug text-muted-foreground">
                              Need {rewardPointsSettings.minRedeemPoints || 0}+ pts (have {loyaltyBalance})
                            </p>
                          )}
                          {!loyaltyPreview.ok && loyaltyPointsInput > 0 && loyaltyPreview.error && (
                            <p className="text-center text-xs text-red-600">{loyaltyPreview.error}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-3">
                  {/* Cash - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setCashAmount(payableAfterWallet)
                      setCardAmount(0)
                      setOnlineAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCashAmount(payableAfterWallet); setCardAmount(0); setOnlineAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${cashAmount > 0 ? 'bg-green-200 border-green-400 hover:bg-green-300' : 'bg-green-50/50 border-green-200 hover:bg-green-50'}`}
                  >
                    <span className="text-sm font-medium text-green-700">Cash</span>
                    <Input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-green-300 text-center rounded-lg focus:border-green-400 focus:ring-green-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>

                  {/* Card - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setCardAmount(payableAfterWallet)
                      setCashAmount(0)
                      setOnlineAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCardAmount(payableAfterWallet); setCashAmount(0); setOnlineAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${cardAmount > 0 ? 'bg-blue-200 border-blue-400 hover:bg-blue-300' : 'bg-blue-50/50 border-blue-200 hover:bg-blue-50'}`}
                  >
                    <span className="text-sm font-medium text-blue-700">Card</span>
                    <Input
                      type="number"
                      value={cardAmount}
                      onChange={(e) => setCardAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-blue-300 text-center rounded-lg focus:border-blue-400 focus:ring-blue-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>

                  {/* Online - click to fill payable amount; darker background when selected (amount > 0) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setOnlineAmount(payableAfterWallet)
                      setCashAmount(0)
                      setCardAmount(0)
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOnlineAmount(payableAfterWallet); setCashAmount(0); setCardAmount(0); } }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-colors cursor-pointer ${onlineAmount > 0 ? 'bg-purple-200 border-purple-400 hover:bg-purple-300' : 'bg-purple-50/50 border-purple-200 hover:bg-purple-50'}`}
                  >
                    <span className="text-sm font-medium text-purple-700">Online</span>
                    <Input
                      type="number"
                      value={onlineAmount}
                      onChange={(e) => setOnlineAmount(Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-8 text-sm border-purple-300 text-center rounded-lg focus:border-purple-400 focus:ring-purple-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ textAlign: 'center' }}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Processing Fees - Modern */}
              {paymentSettings?.enableProcessingFees && (cardAmount > 0 || onlineAmount > 0) && (
                <div className="p-2 bg-amber-50/50 rounded-xl border border-amber-200">
                  <div className="text-sm font-semibold text-amber-800 mb-1">Processing Fees</div>
                  {cardAmount > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-amber-700">Card ({paymentSettings?.processingFee || 2.9}%)</span>
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency((cardAmount * (paymentSettings?.processingFee || 2.9)) / 100)}
                      </span>
                    </div>
                  )}
                  {onlineAmount > 0 && (
                    <div className="flex justify-between items-center py-1">
                      <span className="text-sm text-amber-700">Online ({paymentSettings?.processingFee || 2.9}%)</span>
                      <span className="text-sm font-semibold text-red-600">
                        {formatCurrency((onlineAmount * (paymentSettings?.processingFee || 2.9)) / 100)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total Paid - Modern */}
              <div className="bg-emerald-50/50 rounded-xl p-2 border border-emerald-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-emerald-700">Total Paid</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Modern */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex-shrink-0">
          <div className="flex gap-3">
            <Button 
              onClick={() => {
                console.log('🔍 Checkout button clicked!')
                console.log('🔍 roundedTotal:', roundedTotal)
                console.log('🔍 totalPaid:', totalPaid)
                console.log('🔍 isProcessing:', isProcessing)
                
                if (isProcessing) {
                  console.log('❌ Already processing, ignoring click')
                  return
                }
                
                if (roundedTotal <= 0 && !allowZeroTotalCheckout) {
                  toast({
                    title: "Invalid Amount",
                    description: "Total amount must be greater than 0",
                    variant: "destructive",
                  })
                  return
                }
                
                // Edit mode: ask for reason first if not yet provided
                if (mode === "edit" && !editReason.trim()) {
                  setTempEditReason("")
                  setShowEditReasonModal(true)
                  return
                }
                
                if (totalPaid < roundedTotal) {
                  console.log('💰 Opening payment modal for partial/unpaid bill')
                  setShowPaymentModal(true)
                } else if (
                  totalPaid > roundedTotal + 1e-6 &&
                  isCashOnlyCheckout &&
                  mode !== "exchange" &&
                  isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined)
                ) {
                  setCreditCheckoutReasonOverride(null)
                  setShowCreditChangeConfirm(true)
                } else {
                  console.log('✅ Full payment, proceeding with checkout')
                  handleCheckout()
                }
              }} 
              disabled={isProcessing || (roundedTotal <= 0 && !allowZeroTotalCheckout)} 
              className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  {mode === "edit"
                    ? "Save Changes"
                    : mode === "exchange"
                      ? "Complete Exchange"
                      : allowZeroTotalCheckout
                        ? `Complete — ${formatCurrency(totalPaid)}`
                        : `Collect - ${formatCurrency(totalPaid)}`}
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetForm} 
              className="flex-1 h-10 text-sm font-medium rounded-lg border-gray-200 hover:bg-gray-50 transition-all duration-200"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
      
      {/* Tip Modal */}
      <Dialog open={showTipModal} onOpenChange={setShowTipModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Add Tip
            </DialogTitle>
            <DialogDescription>
              Enter the tip amount for this transaction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tip-amount" className="text-sm font-medium">
                Tip Amount
              </Label>
              <Input
                id="tip-amount"
                type="number"
                value={tempTipAmount}
                onChange={(e) => setTempTipAmount(Number(e.target.value))}
                placeholder="0"
                className="text-lg"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tip-staff" className="text-sm font-medium">
                Staff for Tip
              </Label>
              <Select
                value={tipStaffId || ""}
                onValueChange={(value) => setTipStaffId(value || null)}
              >
                <SelectTrigger id="tip-staff" className="h-9">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {staff.length === 0 ? (
                    <SelectItem value="__no_staff" disabled>
                      No staff available
                    </SelectItem>
                  ) : (
                    staff.map((s) => {
                      const id = s._id || s.id
                      return (
                        <SelectItem key={id} value={id}>
                          {s.name || "Unnamed Staff"}
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleTipCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTipOk}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCreditChangeConfirm}
        onOpenChange={(open) => {
          if (!isProcessing) {
            setShowCreditChangeConfirm(open)
            if (!open) setCreditCheckoutReasonOverride(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-cyan-700" />
              Credit change to wallet?
            </DialogTitle>
            <DialogDescription className="text-left text-sm text-slate-600">
              The customer paid {formatCurrency(totalPaid)} in cash and the bill total is {formatCurrency(roundedTotal)}.
              <span className="mt-2 block font-medium text-slate-900">
                {formatCurrency(change)} will be added to their prepaid wallet as non-expiring balance — no cash change.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreditChangeConfirm(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-cyan-700 hover:bg-cyan-800"
              disabled={isProcessing}
              onClick={() => {
                const r = creditCheckoutReasonOverride
                setShowCreditChangeConfirm(false)
                setCreditCheckoutReasonOverride(null)
                void handleCheckout(r ?? undefined, { creditBillChangeToWallet: true })
              }}
            >
              Confirm & collect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Reason Modal - shown when user clicks Save Changes in edit mode */}
      <Dialog open={showEditReasonModal} onOpenChange={(open) => {
        setShowEditReasonModal(open)
        if (!open) setTempEditReason("")
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-amber-600" />
              Edit Reason Required
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for editing this bill (required for audit purposes).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-reason-modal" className="text-sm font-medium">
                Edit Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="edit-reason-modal"
                placeholder="Please provide a reason for editing this bill..."
                value={tempEditReason}
                onChange={(e) => setTempEditReason(e.target.value)}
                className="min-h-[100px] border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                autoFocus
              />
              {!tempEditReason.trim() && (
                <p className="text-xs text-red-600">Edit reason is required to save changes</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditReasonModal(false)
                setTempEditReason("")
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const reason = tempEditReason.trim()
                if (!reason) {
                  toast({
                    title: "Edit Reason Required",
                    description: "Please provide a reason for editing this bill",
                    variant: "destructive",
                  })
                  return
                }
                setEditReason(reason)
                setShowEditReasonModal(false)
                setTempEditReason("")
                if (totalPaid < roundedTotal) {
                  setShowPaymentModal(true)
                } else if (
                  totalPaid > roundedTotal + 1e-6 &&
                  isCashOnlyCheckout &&
                  mode !== "exchange" &&
                  isLikelyMongoObjectId(getCustomerId(selectedCustomer) || undefined)
                ) {
                  setCreditCheckoutReasonOverride(reason)
                  setShowCreditChangeConfirm(true)
                } else {
                  handleCheckout(reason)
                }
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* New Customer Modal */}
      {showNewCustomerDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(20px)',
            animation: 'slideIn 0.3s ease-out'
          }}>
            {/* Header with Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              paddingBottom: '20px',
              borderBottom: '2px solid #f3f4f6'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#8b5cf6',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 'bold'
                }}>
                  👤
                </div>
                <div>
                  <h2 style={{
                    color: '#111827',
                    fontSize: '28px',
                    fontWeight: '700',
                    margin: 0,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}>
                    Create New Customer
                  </h2>
                  <p style={{
                    color: '#6b7280',
                    fontSize: '14px',
                    margin: '4px 0 0 0',
                    fontWeight: '500'
                  }}>
                    Add a new customer to your salon database
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowNewCustomerDialog(false)}
                style={{
                  backgroundColor: '#f9fafb',
                  color: '#6b7280',
                  border: 'none',
                  borderRadius: '12px',
                  width: '36px',
                  height: '36px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  fontWeight: 'bold'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#ef4444'
                  target.style.color = 'white'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#f9fafb'
                  target.style.color = '#6b7280'
                }}
              >
                ×
              </button>
            </div>
            
            {/* Form Fields */}
            <div style={{marginBottom: '28px'}}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={newCustomer.firstName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                    placeholder="Enter first name"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      fontSize: '15px',
                      backgroundColor: '#fafafa',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#8b5cf6'
                      e.target.style.backgroundColor = 'white'
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb'
                      e.target.style.backgroundColor = '#fafafa'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newCustomer.lastName}
                    onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                    placeholder="Enter last name"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      fontSize: '15px',
                      backgroundColor: '#fafafa',
                      transition: 'all 0.2s ease',
                      outline: 'none'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#8b5cf6'
                      e.target.style.backgroundColor = 'white'
                      e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb'
                      e.target.style.backgroundColor = '#fafafa'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>
              
              <div style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => {
                    // Only allow digits and limit to 10
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setNewCustomer({ ...newCustomer, phone: value })
                  }}
                  placeholder="Enter 10-digit phone number"
                  maxLength={10}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: newCustomer.phone && newCustomer.phone.length !== 10 ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '15px',
                    backgroundColor: '#fafafa',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = newCustomer.phone && newCustomer.phone.length !== 10 ? '#ef4444' : '#8b5cf6'
                    e.target.style.backgroundColor = 'white'
                    e.target.style.boxShadow = newCustomer.phone && newCustomer.phone.length !== 10 
                      ? '0 0 0 3px rgba(239, 68, 68, 0.1)' 
                      : '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = newCustomer.phone && newCustomer.phone.length !== 10 ? '#ef4444' : '#e5e7eb'
                    e.target.style.backgroundColor = '#fafafa'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                {newCustomer.phone && newCustomer.phone.length > 0 && newCustomer.phone.length !== 10 && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    Phone number must be exactly 10 digits. Current: {newCustomer.phone.length} digits
                  </p>
                )}
              </div>
              
              <div style={{marginBottom: '20px'}}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  placeholder="Enter email address"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    fontSize: '15px',
                    backgroundColor: '#fafafa',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#8b5cf6'
                    e.target.style.backgroundColor = 'white'
                    e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e7eb'
                    e.target.style.backgroundColor = '#fafafa'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '16px',
              paddingTop: '20px',
              borderTop: '2px solid #f3f4f6'
            }}>
              <button 
                onClick={() => setShowNewCustomerDialog(false)}
                style={{
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '2px solid #e5e7eb',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '100px'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = '#f9fafb'
                  target.style.borderColor = '#d1d5db'
                  target.style.color = '#374151'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.backgroundColor = 'white'
                  target.style.borderColor = '#e5e7eb'
                  target.style.color = '#6b7280'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveNewCustomer}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: '140px',
                  boxShadow: '0 4px 14px 0 rgba(139, 92, 246, 0.25)'
                }}
                onMouseOver={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.transform = 'translateY(-2px)'
                  target.style.boxShadow = '0 8px 25px 0 rgba(139, 92, 246, 0.35)'
                }}
                onMouseOut={(e) => {
                  const target = e.target as HTMLButtonElement
                  target.style.transform = 'translateY(0)'
                  target.style.boxShadow = '0 4px 14px 0 rgba(139, 92, 246, 0.25)'
                }}
              >
                ✨ Create Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-5 w-5 text-orange-600">⚠️</div>
              Payment Confirmation Required
            </DialogTitle>
            <DialogDescription>
              Please review the payment details before proceeding with checkout.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Payment Summary */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="font-medium text-slate-800 mb-3">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Bill Total:</span>
                  <span className="font-medium">₹{roundedTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Paid:</span>
                  <span className="font-medium text-green-600">₹{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-semibold">Remaining:</span>
                  <span className="font-bold text-red-600">₹{(roundedTotal - totalPaid).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Warning Message */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-5 text-orange-600">⚠️</div>
                <span className="font-medium text-orange-800">Important Notice</span>
              </div>
              <p className="text-sm text-orange-700">
                {totalPaid === 0 ? 
                  `This will create an UNPAID bill. Customer owes ₹${roundedTotal.toFixed(2)}` :
                  `This will create a PARTIALLY PAID bill. Customer owes ₹${(roundedTotal - totalPaid).toFixed(2)} more`
                }
              </p>
            </div>

            {/* Confirmation Checkbox */}
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="confirmUnpaid" 
                checked={confirmUnpaid} 
                onChange={(e) => setConfirmUnpaid(e.target.checked)}
                className="rounded border-orange-300"
              />
              <label htmlFor="confirmUnpaid" className="text-sm text-orange-700 cursor-pointer">
                I confirm this {totalPaid === 0 ? 'unpaid' : 'partially paid'} bill
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPaymentModal(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                console.log('🔍 Modal button clicked!')
                console.log('🔍 confirmUnpaid:', confirmUnpaid)
                console.log('🔍 roundedTotal:', roundedTotal)
                console.log('🔍 totalPaid:', totalPaid)
                console.log('🔍 isProcessing:', isProcessing)
                
                if (isProcessing) {
                  console.log('❌ Already processing, ignoring click')
                  return
                }
                
                if (confirmUnpaid) {
                  console.log('✅ Checkbox confirmed, proceeding with checkout...')
                  setShowPaymentModal(false)
                  console.log('🔍 Calling handleCheckout...')
                  handleCheckout()
                } else {
                  console.log('❌ Checkbox not confirmed')
                  toast({
                    title: "Confirmation Required",
                    description: "Please confirm the unpaid/partial payment bill",
                    variant: "destructive",
                  })
                }
              }}
              disabled={!confirmUnpaid || isProcessing}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm & Collect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={walletLedgerOpen} onOpenChange={setWalletLedgerOpen}>
        <DialogContent
          overlayClassName="z-[109]"
          className="max-w-3xl gap-0 overflow-hidden p-0 z-[110] flex max-h-[min(85vh,48rem)] flex-col sm:max-w-3xl"
        >
          <DialogHeader className="shrink-0 flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b px-5 py-4 text-left sm:text-left">
            <div className="min-w-0 space-y-1">
              <DialogTitle>Wallet activity</DialogTitle>
              <DialogDescription>{selectedCustomer?.name}</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setWalletLedgerOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {walletLedgerLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-sm">Loading transactions…</span>
              </div>
            ) : walletLedgerRows.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No wallet transactions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Bill / receipt</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletLedgerRows.map((row) => {
                    const st = walletActivityStatusDisplay(row.statusLabel)
                    return (
                    <TableRow key={row._id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(row.createdAt), "dd MMM yyyy, h:mm a")}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium text-gray-900">
                          {row.billNo ? `#${row.billNo}` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.walletPlan}</div>
                        {row.description ? (
                          <div className="text-xs text-muted-foreground mt-0.5">{row.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell
                          className={cn(
                            "text-right font-mono text-sm font-semibold tabular-nums",
                            st === "Debit" && "text-red-700",
                            st === "Credit" && "text-emerald-700"
                          )}
                      >
                        {st === "Debit"
                          ? `−₹${row.amount.toFixed(2)}`
                          : `+₹${row.amount.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                            className={cn(
                              "text-xs font-medium",
                              st === "Debit" &&
                                "border-red-200 bg-red-50 text-red-800",
                              st === "Credit" &&
                                "border-emerald-200 bg-emerald-50 text-emerald-800"
                            )}
                        >
                          {st}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Collection Modal for Dues */}
      <PaymentCollectionModal
        isOpen={showDuesPaymentModal}
        onClose={() => {
          setShowDuesPaymentModal(false)
          setSelectedBillForPayment(null)
          setShowDuesDialog(true) // Reopen dues dialog when payment modal is closed
        }}
        sale={selectedBillForPayment}
        onPaymentCollected={handlePaymentCollected}
      />

      <Dialog
        open={historyInvoicePreviewOpen}
        onOpenChange={(next) => {
          if (!next) {
            setHistoryInvoicePreviewOpen(false)
            setHistoryInvoicePreviewReceipt(null)
            setHistoryInvoicePreviewSettings(null)
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {historyInvoicePreviewReceipt
                ? `Invoice #${historyInvoicePreviewReceipt.receiptNumber}`
                : "Invoice preview"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Invoice preview for the selected bill
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
            {historyInvoicePreviewLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                Loading invoice…
              </div>
            ) : historyInvoicePreviewReceipt ? (
              <ReceiptPreview
                receipt={historyInvoicePreviewReceipt}
                businessSettings={historyInvoicePreviewSettings}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <PostPaymentReceiptModal
        key={postPaymentModal?.receipt?.receiptNumber ?? "post-payment-idle"}
        open={!!postPaymentModal}
        onOpenChange={(next) => {
          if (!next) setPostPaymentModal(null)
        }}
        receipt={postPaymentModal?.receipt ?? null}
        returnPath={postPaymentModal?.returnPath ?? "/quick-sale"}
      />

      {/* Dues Settlement Dialog - Rendered at root level */}
      {showDuesDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 99999 }}>
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ zIndex: 100000 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Settle Dues - {selectedCustomer?.name}</h2>
              <Button 
                onClick={() => setShowDuesDialog(false)}
                variant="outline"
                size="sm"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {unpaidBills.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No pending bills found</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-red-600" />
                      <span className="font-semibold text-red-900">Total Outstanding</span>
                    </div>
                    <span className="text-2xl font-bold text-red-600">
                      ₹{unpaidBills.reduce((sum, bill) => sum + bill.remainingAmount, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
                
                {unpaidBills.map((bill) => (
                  <div key={bill.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-800">Bill #{bill.billNo}</h3>
                        <p className="text-sm text-gray-600">
                          {format(new Date(bill.date), "dd MMM yyyy")} at {bill.time}
                        </p>
                        <p className="text-sm text-gray-600">Staff: {bill.staffName}</p>
                      </div>
                      <Badge variant="destructive">Partial</Badge>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-3 p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-600">Total Amount</p>
                        <p className="text-lg font-semibold text-gray-900">₹{bill.totalAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Paid Amount</p>
                        <p className="text-lg font-semibold text-green-600">₹{bill.paidAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Remaining</p>
                        <p className="text-lg font-bold text-red-600">₹{bill.remainingAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleCollectPayment(bill)}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Collect Payment
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
    </div>
  )
}
