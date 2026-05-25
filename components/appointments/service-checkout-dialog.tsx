"use client"

import { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, forwardRef, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  CalendarDays,
  CreditCard,
  Gift,
  ShoppingBag,
  Wallet,
  Boxes,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Percent,
  Coins,
  MoreVertical,
  AlertTriangle,
  ArrowLeft,
  X,
} from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { useCurrency } from "@/hooks/use-currency"
import { effectiveMembershipPlanDiscountPercent } from "@/lib/membership-plan-discount"
import { cn } from "@/lib/utils"
import { expandBundleToLines, isBundleService } from "@/lib/bundle-service"
import { clientStore, type Client } from "@/lib/client-store"
import {
  customerDropdownList,
  findWalkInClient,
  formatClientPhoneForDisplay,
  prependWalkInIfMissing,
} from "@/lib/walk-in-client"
import { ClientDetailsDrawer } from "@/components/clients/client-details-drawer"
import {
  ClientWalletAPI,
  ClientsAPI,
  AnalyticsAPI,
  MembershipAPI,
  PackagesAPI,
  ProductsAPI,
  RewardPointsAPI,
  SalesAPI,
  SettingsAPI,
  StaffDirectoryAPI,
} from "@/lib/api"
import type { AnalyticsTopService } from "@/lib/types/analytics"
import {
  clearServiceCheckoutDraftByRef,
  dispatchServiceCheckoutDraftChanged,
  findLatestServiceCheckoutDraftRefForContext,
  readServiceCheckoutDraftByRef,
  removeOtherServiceCheckoutDraftsForContext,
  upsertServiceCheckoutDraft,
} from "@/lib/service-checkout-draft-storage"
import {
  eligibleRedemptionSubtotal,
  mergePaymentConfiguration,
  type PaymentRedemptionLine,
} from "@/lib/payment-redemption-eligibility"
import {
  filterWalletsForQuickSaleDisplay,
  isLikelyMongoObjectId,
  pickWalletIdForChangeCredit,
  buildCombinedQuickSaleWalletRow,
} from "@/lib/quick-sale-helpers"
import { previewRedemptionLive } from "@/lib/reward-points-preview"
import {
  completeServiceCheckoutInline,
  type CheckoutPaymentMethodChoice,
  type ServiceCheckoutTenderSplit,
} from "@/lib/complete-service-checkout-inline"
import {
  PINNED_CHECKOUT_SERVICES_EVENT,
  readPinnedServiceIds,
  writePinnedServiceIds,
} from "@/lib/pinned-checkout-services"

export type CheckoutTipLine = {
  id: string
  staffId: string
  /** Tip amount in ₹ for this staff member. */
  amount: number
}

export type CheckoutCartDiscountMode = "fixed" | "percentage"

export type ServiceCheckoutLine = {
  id: string
  serviceId: string
  staffId: string
  name: string
  duration: number
  /** Unit price before quantity multiplier. */
  price: number
  quantity?: number
  /** Line discount: percent (0–100) or fixed ₹ off line subtotal before tax. */
  discountValue?: number
  /** true = `discountValue` is % off line; false = fixed ₹ off (price × qty). */
  discountIsPercent?: boolean
  /** From appointment booking: compact row + price; edits open the sheet (still editable before payment). */
  locked?: boolean
  /** Discount was applied from the client’s active membership; cleared when membership is removed. */
  membershipAutoDiscount?: boolean
  /** Line prices come from a catalog bundle — do not apply membership included-service / % discount. */
  fromBundle?: boolean
}

/** Create scheduled appointment docs before Quick Sale when checking out from a new (calendar) booking. */
export type EnsureAppointmentBookingContext = {
  lines: ServiceCheckoutLine[]
  customer: Client
  appointmentDate: Date | undefined
  appointmentTime: string
  notes: string
}

export type EnsureAppointmentBookingResult = {
  appointmentId: string
  linkedAppointmentIds: string[]
  bookingGroupId: string | null
}

export type ServiceCheckoutProductLine = {
  id: string
  productId: string
  staffId: string
  name: string
  price: number
  quantity: number
  /** Line discount: percent (0–100) or fixed ₹ off line subtotal before tax. */
  discountValue?: number
  /** true = `discountValue` is % off line; false = fixed ₹ off (price × qty). */
  discountIsPercent?: boolean
}

export type ServiceCheckoutMembershipLine = {
  id: string
  planId: string
  staffId: string
  planName: string
  price: number
  durationInDays: number
  quantity: number
  discountValue?: number
  discountIsPercent?: boolean
}

export type ServiceCheckoutPrepaidLine = {
  id: string
  planId: string
  staffId: string
  planName: string
  creditAmount: number
  validityDays: number
  price: number
  quantity: number
  discountValue?: number
  discountIsPercent?: boolean
}

export type ServiceCheckoutPackageLine = {
  id: string
  packageId: string
  staffId: string
  packageName: string
  price: number
  totalSittings: number
  validityDays: number
  quantity: number
  discountValue?: number
  discountIsPercent?: boolean
}

function formatDurationShort(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}min` : `${h}h`
}

function serviceLineQuantity(line: ServiceCheckoutLine): number {
  return Math.max(1, Math.floor(Number(line.quantity) || 1))
}

/** Same rules as appointment form booking: active, scheduling explicitly on (excludes Off / false / unset). */
function isStaffEligibleForAppointmentScheduling(user: any): boolean {
  const hasValidId = user._id || user.id
  if (!hasValidId) return false
  const role = user.role
  if (role !== "staff" && role !== "manager" && role !== "admin") return false
  if (user.isActive !== true) return false
  if (user.allowAppointmentScheduling !== true) return false
  return true
}

/** Line subtotal after optional line-level discount (percent or fixed ₹). */
function lineNetAfterLineDiscount(
  unitPrice: number,
  quantity: number,
  discountValue: number | undefined,
  discountIsPercent: boolean | undefined
): number {
  const base = Math.max(0, Number(unitPrice) || 0) * Math.max(1, Math.floor(Number(quantity) || 1))
  const d = Math.max(0, Number(discountValue) || 0)
  if (d <= 0) return base
  const isPct = discountIsPercent !== false
  if (isPct) {
    const pct = Math.min(100, d)
    return Math.max(0, base * (1 - pct / 100))
  }
  return Math.max(0, base - d)
}

function catalogProductStockUnits(product: any | undefined): number {
  if (!product) return 0
  return Math.max(0, Math.floor(Number(product.stock ?? product.quantity ?? 0) || 0))
}

/** Upper bound for this line’s quantity given catalog stock and qty on other cart lines (same productId). */
function maxProductLineQtyFromStock(
  line: ServiceCheckoutProductLine,
  allLines: ServiceCheckoutProductLine[],
  catalogProducts: any[]
): number {
  const pid = String(line.productId)
  const p = catalogProducts.find((x: any) => String(x._id || x.id) === pid)
  if (!p) return Number.MAX_SAFE_INTEGER
  const stock = catalogProductStockUnits(p)
  const elsewhere = allLines
    .filter((l) => l.id !== line.id && String(l.productId) === pid)
    .reduce((sum, l) => sum + Math.max(1, Math.floor(Number(l.quantity) || 1)), 0)
  return Math.max(0, stock - elsewhere)
}

/** Quick Sale payload uses a single 0–100 percent per line; fixed ₹ is converted. */
function lineDiscountAsPayloadPercent(
  unitPrice: number,
  quantity: number,
  discountValue: number | undefined,
  discountIsPercent: boolean | undefined
): number {
  const base = Math.max(0, Number(unitPrice) || 0) * Math.max(1, Math.floor(Number(quantity) || 1))
  const d = Math.max(0, Number(discountValue) || 0)
  if (d <= 0 || base <= 0) return 0
  if (discountIsPercent !== false) return Math.min(100, d)
  return Math.min(100, (d / base) * 100)
}

function cloneCheckoutTipLines(lines: CheckoutTipLine[]): CheckoutTipLine[] {
  return lines.map((l) => ({ ...l }))
}

type ServiceCheckoutMembershipSnapshot = {
  subscription?: any
  plan?: any
  usageSummary?: any[]
  freeServicesRemaining?: number
  totalSavedViaMembership?: number
} | null

function getActiveMembershipPlanName(data: ServiceCheckoutMembershipSnapshot): string {
  if (!data?.subscription) return "NA"
  const sub = data.subscription
  const plan = data.plan ?? sub.planId
  const isActive = sub.status === "ACTIVE"
  const isExpired =
    sub.status === "EXPIRED" ||
    (sub.expiryDate != null &&
      String(sub.expiryDate) !== "" &&
      new Date(sub.expiryDate) < new Date())
  if (!isActive || isExpired) return "NA"
  if (plan && typeof plan === "object") {
    const name = (plan.planName || plan.name || "").trim()
    if (name) return name
  }
  return "NA"
}

/** Align with Quick Sale membership pricing: included-service balances + plan % off remaining. */
function applyMembershipToCheckoutServiceLines(
  lines: ServiceCheckoutLine[],
  membershipData: ServiceCheckoutMembershipSnapshot,
  catalogServices: any[]
): ServiceCheckoutLine[] {
  if (!membershipData?.plan) {
    return lines.map((l) => {
      if (!l.serviceId || !l.membershipAutoDiscount) return l
      return {
        ...l,
        discountValue: 0,
        discountIsPercent: true,
        membershipAutoDiscount: false,
      }
    })
  }

  const usageMap = new Map(
    (membershipData.usageSummary || []).map((u: any) => [
      String(u.serviceId || u.serviceId?._id),
      u,
    ])
  )
  const remaining: Record<string, number> = {}
  usageMap.forEach((u: any, sid: string) => {
    remaining[sid] = typeof u.remaining === "number" ? u.remaining : 0
  })

  return lines.map((line) => {
    if (!line.serviceId || line.membershipAutoDiscount === false || line.fromBundle) return line

    const sid = String(line.serviceId)
    const discountPct = effectiveMembershipPlanDiscountPercent(membershipData.plan, sid)
    const u = usageMap.get(sid)
    const svc = catalogServices.find((s: any) => String(s._id || s.id) === sid)
    const basePrice = Number(svc?.price ?? line.price) || 0
    const q = serviceLineQuantity(line)

    if (!u) {
      if (discountPct > 0) {
        return {
          ...line,
          price: basePrice || line.price,
          discountValue: discountPct,
          discountIsPercent: true,
          membershipAutoDiscount: true,
        }
      }
      return {
        ...line,
        price: basePrice || line.price,
        discountValue: 0,
        discountIsPercent: true,
        membershipAutoDiscount: true,
      }
    }

    if (remaining[sid] <= 0) {
      if (discountPct > 0) {
        return {
          ...line,
          price: basePrice || line.price,
          discountValue: discountPct,
          discountIsPercent: true,
          membershipAutoDiscount: true,
        }
      }
      return {
        ...line,
        price: basePrice || line.price,
        discountValue: 0,
        discountIsPercent: true,
        membershipAutoDiscount: true,
      }
    }

    const freeUnits = Math.min(q, remaining[sid])
    remaining[sid] -= freeUnits
    const paidUnits = q - freeUnits

    if (paidUnits === 0) {
      return {
        ...line,
        price: basePrice || line.price,
        discountValue: 100,
        discountIsPercent: true,
        membershipAutoDiscount: true,
      }
    }

    const avgDiscount = (freeUnits * 100 + paidUnits * discountPct) / q
    return {
      ...line,
      price: basePrice || line.price,
      discountValue: Math.round(avgDiscount * 100) / 100,
      discountIsPercent: true,
      membershipAutoDiscount: true,
    }
  })
}

type CheckoutPaymentTaxSettings = {
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

function deriveCheckoutPreferredPaymentMethod(opts: {
  cash: number
  card: number
  online: number
  wallet: number
  loyaltyPoints: number
}): CheckoutPaymentMethodChoice {
  const { cash, card, online, wallet, loyaltyPoints } = opts
  const tiers: Array<{ k: CheckoutPaymentMethodChoice; v: number }> = [
    { k: "cash", v: cash },
    { k: "card", v: card },
    { k: "online", v: online },
    { k: "wallet", v: wallet },
  ]
  let best: CheckoutPaymentMethodChoice = "cash"
  let bestV = -1
  for (const t of tiers) {
    if (t.v > bestV + 1e-9) {
      bestV = t.v
      best = t.k
    }
  }
  if (bestV < 0.01 && loyaltyPoints > 0) return "reward"
  if (bestV < 0.01) return "cash"
  return best
}

function lineGrossPayableForCheckout(
  net: number,
  rate: number,
  taxable: boolean,
  ts: CheckoutPaymentTaxSettings | null
): number {
  if (!ts) return net
  const enableTax = ts.enableTax !== false
  const inclusive = ts.priceInclusiveOfTax !== false
  if (!enableTax || !taxable || rate <= 0) return net
  if (inclusive) return net
  return net + (net * rate) / 100
}

function CheckoutLineDiscountRow({
  discountValue,
  discountIsPercent,
  onDiscountValueChange,
  onSetPercentMode,
  onSetFixedMode,
}: {
  discountValue: number
  discountIsPercent: boolean
  onDiscountValueChange: (v: number) => void
  onSetPercentMode: () => void
  onSetFixedMode: () => void
}) {
  const [discountFieldFocused, setDiscountFieldFocused] = useState(false)

  const modeChipClass = (active: boolean) =>
    cn(
      "flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      active
        ? "bg-violet-600 text-white shadow-sm"
        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
    )

  const isZeroish = Math.abs(Number(discountValue) || 0) < Number.EPSILON
  const inputDisplayValue =
    discountFieldFocused && isZeroish
      ? ""
      : Number.isNaN(discountValue)
        ? ""
        : discountValue

  return (
    <div
      className="flex h-7 w-[min(100%,6.5rem)] shrink-0 items-stretch rounded-md border border-border/80 bg-muted/45 p-px shadow-sm"
      role="group"
      aria-label="Line discount"
    >
      <div className="flex min-w-0 flex-1 items-center gap-px border-r border-border/45 px-1 pr-0.5">
        <span
          className="shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground"
          aria-hidden
        >
          {discountIsPercent ? "%" : "₹"}
        </span>
        <Input
          type="number"
          min={0}
          max={discountIsPercent ? 100 : undefined}
          step={discountIsPercent ? 1 : 0.01}
          className="h-6 min-w-0 flex-1 border-0 bg-transparent p-0 pl-0.5 text-right text-[11px] font-medium leading-none shadow-none outline-none focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={inputDisplayValue}
          onFocus={() => setDiscountFieldFocused(true)}
          onBlur={() => setDiscountFieldFocused(false)}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === "" || raw === ".") {
              onDiscountValueChange(0)
              return
            }
            let n = parseFloat(raw)
            if (Number.isNaN(n)) n = 0
            n = Math.max(0, n)
            if (discountIsPercent) n = Math.min(100, n)
            onDiscountValueChange(n)
          }}
          aria-label={discountIsPercent ? "Discount percent" : "Discount amount"}
        />
      </div>
      <button
        type="button"
        className={modeChipClass(!discountIsPercent)}
        onClick={onSetFixedMode}
        aria-label="Fixed rupee discount"
        aria-pressed={!discountIsPercent}
      >
        <Coins className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={modeChipClass(discountIsPercent)}
        onClick={onSetPercentMode}
        aria-label="Percent discount"
        aria-pressed={discountIsPercent}
      >
        <Percent className="h-3 w-3" />
      </button>
    </div>
  )
}

function cloneLines(lines: ServiceCheckoutLine[]): ServiceCheckoutLine[] {
  return lines.map((l) => ({ ...l }))
}

function cloneProductLines(lines: ServiceCheckoutProductLine[]): ServiceCheckoutProductLine[] {
  return lines.map((l) => ({ ...l }))
}

function cloneMembershipLines(
  lines: ServiceCheckoutMembershipLine[]
): ServiceCheckoutMembershipLine[] {
  return lines.map((l) => ({ ...l }))
}

function clonePrepaidLines(lines: ServiceCheckoutPrepaidLine[]): ServiceCheckoutPrepaidLine[] {
  return lines.map((l) => ({ ...l }))
}

function clonePackageLines(lines: ServiceCheckoutPackageLine[]): ServiceCheckoutPackageLine[] {
  return lines.map((l) => ({ ...l }))
}

/** Pick catalog services ordered by bill frequency (units sold), then fill from catalog. */
function resolveFrequentCatalogServices(
  catalog: any[],
  ranked: AnalyticsTopService[],
  limit = 10
): any[] {
  if (!catalog.length) return []
  const catalogById = new Map<string, any>()
  const catalogByName = new Map<string, any>()
  for (const svc of catalog) {
    const id = String(svc._id || svc.id || "")
    if (id) catalogById.set(id, svc)
    const nameKey = String(svc.name || "")
      .trim()
      .toLowerCase()
    if (nameKey && !catalogByName.has(nameKey)) catalogByName.set(nameKey, svc)
  }

  const picked: any[] = []
  const seen = new Set<string>()

  const tryAdd = (svc: any | undefined) => {
    if (!svc || picked.length >= limit) return
    const sid = String(svc._id || svc.id || "")
    if (!sid || seen.has(sid)) return
    seen.add(sid)
    picked.push(svc)
  }

  for (const row of ranked) {
    if (picked.length >= limit) break
    const key = String(row.id || "")
    if (key && !key.startsWith("__name__")) {
      tryAdd(catalogById.get(key))
      continue
    }
    const fromKey =
      key.startsWith("__name__") ? key.slice("__name__".length).trim().toLowerCase() : ""
    const fromRowName = String(row.name || "")
      .trim()
      .toLowerCase()
    tryAdd(catalogByName.get(fromKey) ?? catalogByName.get(fromRowName))
  }

  for (const svc of catalog) {
    if (picked.length >= limit) break
    tryAdd(svc)
  }

  return picked
}

type ServiceCheckoutCategory =
  | "services"
  | "products"
  | "memberships"
  | "prepaidPlans"
  | "packages"
  | "giftVoucher"

const CATEGORY_TILES: Array<{
  id: ServiceCheckoutCategory
  label: string
  Icon: ComponentType<{ className?: string }>
  comingSoon?: boolean
}> = [
  { id: "services", label: "Services", Icon: CalendarDays },
  { id: "products", label: "Products", Icon: ShoppingBag },
  { id: "memberships", label: "Memberships", Icon: CreditCard },
  { id: "prepaidPlans", label: "Prepaid Plans", Icon: Wallet },
  { id: "packages", label: "Packages", Icon: Boxes },
  { id: "giftVoucher", label: "Gift Voucher", Icon: Gift, comingSoon: true },
]

/** Served from `public/images/product-placeholder.png` — default retail product artwork when no upload / broken URL. */
const CHECKOUT_PRODUCT_PLACEHOLDER_IMAGE = "/images/product-placeholder.png"

function CheckoutProductThumb({ imageUrl }: { imageUrl?: string | null }) {
  const [userImageBroken, setUserImageBroken] = useState(false)
  const [placeholderBroken, setPlaceholderBroken] = useState(false)
  const trimmed = typeof imageUrl === "string" ? imageUrl.trim() : ""
  const userSrc = trimmed && !userImageBroken ? trimmed : null
  const src = userSrc ?? CHECKOUT_PRODUCT_PLACEHOLDER_IMAGE

  if (placeholderBroken) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted ring-1 ring-border/50"
        aria-hidden
      >
        <ShoppingBag className="h-10 w-10 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border/50">
      {/* eslint-disable-next-line @next/next/no-img-element -- product.imageUrl may be data URLs from inventory */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => {
          if (userSrc) setUserImageBroken(true)
          else setPlaceholderBroken(true)
        }}
      />
    </div>
  )
}

export interface ServiceCheckoutDialogProps {
  /** `dialog` = centered modal (standalone page). `drawer` = full-panel overlay inside the appointment side sheet. */
  variant?: "dialog" | "drawer"
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Client | null
  staff: any[]
  catalogServices: any[]
  initialLines: ServiceCheckoutLine[]
  appointmentDate: Date | undefined
  appointmentTime: string
  notes: string
  isEditMode: boolean
  appointmentId?: string
  existingGroupAppointmentIds: string[]
  existingBookingGroupId: string | null
  /** Return true once to restore cart from saved draft when opening. */
  consumeResumeDraftIntent?: () => boolean
  /** Storage token from a calendar pill (`draftRef`) — required when resuming a saved draft. */
  resumeSavedDraftToken?: string | null
  /** Re-link checkout (and optionally persisted appointment docs) to another client. */
  onCustomerChange?: (client: Client) => void | Promise<void>
  /**
   * New appointment flow only: persist calendar booking before opening Quick Sale so the bill links to
   * scheduled appointment cards (avoids standalone walk-in rows). Return null if creation failed (toast).
   */
  ensureAppointmentBookingBeforeCheckout?: (
    ctx: EnsureAppointmentBookingContext
  ) => Promise<EnsureAppointmentBookingResult | null>
  /** Called after bill is saved inline (e.g. close parent appointment drawer and return to calendar). */
  onSuccessfulCheckout?: () => void
  /** Called when the payment step (vs catalog) toggles — drawer host can mirror title in sheet header. */
  onPaymentStepChange?: (inPaymentStep: boolean) => void
}

export type ServiceCheckoutDialogHandle = {
  /** Leave payment step and return to catalog (wallet/payment fields stay loaded). */
  closePaymentStep: () => void
}

export const ServiceCheckoutDialog = forwardRef<ServiceCheckoutDialogHandle, ServiceCheckoutDialogProps>(
  function ServiceCheckoutDialog(
    {
  variant = "dialog",
  open,
  onOpenChange,
  customer,
  staff,
  catalogServices,
  initialLines,
  appointmentDate,
  appointmentTime,
  notes,
  isEditMode,
  appointmentId,
  existingGroupAppointmentIds,
  existingBookingGroupId,
  consumeResumeDraftIntent,
  resumeSavedDraftToken = null,
  onCustomerChange,
  ensureAppointmentBookingBeforeCheckout,
  onSuccessfulCheckout,
  onPaymentStepChange,
}: ServiceCheckoutDialogProps,
  ref
) {
  const router = useRouter()
  const { toast } = useToast()
  const { formatAmount } = useCurrency()
  const [lines, setLines] = useState<ServiceCheckoutLine[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<ServiceCheckoutCategory>("services")
  /** Quick-access "favorite" services pinned beside the default frequent sellers. */
  const [pinnedServiceIds, setPinnedServiceIds] = useState<string[]>([])
  const [frequentServicesRanked, setFrequentServicesRanked] = useState<AnalyticsTopService[] | null>(
    null
  )
  const [pinPickerOpen, setPinPickerOpen] = useState(false)
  const [pinPickerSearch, setPinPickerSearch] = useState("")
  const [navigating, setNavigating] = useState(false)
  const snapshotRef = useRef<ServiceCheckoutLine[]>([])
  const productSnapshotRef = useRef<ServiceCheckoutProductLine[]>([])
  const membershipSnapshotRef = useRef<ServiceCheckoutMembershipLine[]>([])
  const prepaidSnapshotRef = useRef<ServiceCheckoutPrepaidLine[]>([])
  const packageSnapshotRef = useRef<ServiceCheckoutPackageLine[]>([])
  const wasOpenRef = useRef(false)
  /** Latest save / resume token for this checkout session (clear on continue or cancel draft). */
  const persistedDraftRef = useRef<string | null>(null)
  const [productLines, setProductLines] = useState<ServiceCheckoutProductLine[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [catalogProducts, setCatalogProducts] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [membershipLines, setMembershipLines] = useState<ServiceCheckoutMembershipLine[]>([])
  const [membershipSearch, setMembershipSearch] = useState("")
  const [catalogMembershipPlans, setCatalogMembershipPlans] = useState<any[]>([])
  const [loadingMemberships, setLoadingMemberships] = useState(false)

  const [prepaidLines, setPrepaidLines] = useState<ServiceCheckoutPrepaidLine[]>([])
  const [prepaidSearch, setPrepaidSearch] = useState("")
  const [catalogPrepaidPlans, setCatalogPrepaidPlans] = useState<any[]>([])
  const [loadingPrepaidCatalog, setLoadingPrepaidCatalog] = useState(false)

  const [packageLines, setPackageLines] = useState<ServiceCheckoutPackageLine[]>([])
  const [packageSearch, setPackageSearch] = useState("")
  const [catalogPackages, setCatalogPackages] = useState<any[]>([])
  const [loadingPackages, setLoadingPackages] = useState(false)
  /** Loaded for checkout; options always filtered with isStaffEligibleForAppointmentScheduling. */
  const [saleStaffCatalog, setSaleStaffCatalog] = useState<any[]>([])

  const [editingServiceLineId, setEditingServiceLineId] = useState<string | null>(null)
  const [serviceEditDraft, setServiceEditDraft] = useState<{
    price: number
    quantity: number
    staffId: string
  } | null>(null)

  const [cancelDraftDialogOpen, setCancelDraftDialogOpen] = useState(false)
  const [hasPersistedDraft, setHasPersistedDraft] = useState(false)

  const [changeClientQuery, setChangeClientQuery] = useState("")
  const [changeClientResults, setChangeClientResults] = useState<Client[]>([])
  const [changeClientSearching, setChangeClientSearching] = useState(false)
  const [changingClient, setChangingClient] = useState(false)
  const [isChangingClientProfile, setIsChangingClientProfile] = useState(false)
  const [inlineClientPickerOpen, setInlineClientPickerOpen] = useState(false)
  const [showNewClientDialog, setShowNewClientDialog] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  })
  const clientSearchInputRef = useRef<HTMLInputElement>(null)
  const changeClientSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clientDirEpoch, bumpClientDir] = useReducer((n: number) => n + 1, 0)
  const clientProfileId = customer?._id || customer?.id
  const showInlineClientSearch = !clientProfileId && Boolean(onCustomerChange)
  const showClientSearchBox = showInlineClientSearch || isChangingClientProfile
  const [clientDetailsDrawerOpen, setClientDetailsDrawerOpen] = useState(false)
  const [checkoutTaxSettings, setCheckoutTaxSettings] = useState<CheckoutPaymentTaxSettings | null>(null)
  const [checkoutMembershipData, setCheckoutMembershipData] =
    useState<ServiceCheckoutMembershipSnapshot>(null)
  const [checkoutClientStats, setCheckoutClientStats] = useState<{
    loading: boolean
    totalVisits: number
    totalRevenue: number
    duesAmount: number
  } | null>(null)
  /** Payment breakdown (Subtotal / Tax / Total); To pay stays visible when collapsed. */
  const [cartBreakdownOpen, setCartBreakdownOpen] = useState(false)
  const [checkoutTipLines, setCheckoutTipLines] = useState<CheckoutTipLine[]>([])
  const [checkoutCartDiscountType, setCheckoutCartDiscountType] =
    useState<CheckoutCartDiscountMode>("fixed")
  const [checkoutCartDiscountValue, setCheckoutCartDiscountValue] = useState(0)
  const [checkoutSaleNote, setCheckoutSaleNote] = useState("")
  const [tipDialogOpen, setTipDialogOpen] = useState(false)
  const [tipDraftLines, setTipDraftLines] = useState<CheckoutTipLine[]>([])
  const [cartDiscountDialogOpen, setCartDiscountDialogOpen] = useState(false)
  const [cartDiscountDraftType, setCartDiscountDraftType] =
    useState<CheckoutCartDiscountMode>("fixed")
  const [cartDiscountDraft, setCartDiscountDraft] = useState("")
  const [saleNoteDialogOpen, setSaleNoteDialogOpen] = useState(false)
  const [saleNoteDraft, setSaleNoteDraft] = useState("")
  const [cancelSaleDialogOpen, setCancelSaleDialogOpen] = useState(false)
  /** Mirrors Settings paymentConfiguration for wallet/reward eligibility in the payment-method dialog. */
  const [checkoutPaymentConfiguration, setCheckoutPaymentConfiguration] = useState<unknown>(null)
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false)
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false)
  const [paymentDialogShowWallet, setPaymentDialogShowWallet] = useState(false)
  const [paymentDialogShowReward, setPaymentDialogShowReward] = useState(false)
  const [paymentDialogWalletBalanceText, setPaymentDialogWalletBalanceText] = useState("")
  const [paymentDialogRewardBalanceText, setPaymentDialogRewardBalanceText] = useState("")
  const [paymentDialogWalletsRaw, setPaymentDialogWalletsRaw] = useState<any[]>([])
  /** Uncombined usable wallets (for change-to-wallet target pick); UI may show combined row. */
  const [paymentDialogWalletsUncombined, setPaymentDialogWalletsUncombined] = useState<any[]>([])
  const [paymentDialogRewardSettings, setPaymentDialogRewardSettings] = useState<any>(null)
  const [paymentDialogLoyaltyBalance, setPaymentDialogLoyaltyBalance] = useState(0)
  const [payCash, setPayCash] = useState(0)
  const [payCard, setPayCard] = useState(0)
  const [payOnline, setPayOnline] = useState(0)
  const [payWallet, setPayWallet] = useState(0)
  const [payLoyaltyPoints, setPayLoyaltyPoints] = useState(0)
  const [paySelectedWalletId, setPaySelectedWalletId] = useState("")
  /** Quick Sale–style confirmation when amount collected is below amount due (partial bill). */
  const [checkoutPartialPaymentConfirmOpen, setCheckoutPartialPaymentConfirmOpen] = useState(false)
  const [checkoutPartialPaymentConfirmAck, setCheckoutPartialPaymentConfirmAck] = useState(false)
  const [showCreditChangeConfirm, setShowCreditChangeConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    void SettingsAPI.getPaymentSettings()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return
        const d = res.data as Record<string, unknown>
        setCheckoutTaxSettings({
          enableTax: d.enableTax !== false,
          priceInclusiveOfTax: d.priceInclusiveOfTax !== false,
          serviceTaxRate: Number(d.serviceTaxRate) || 5,
          membershipTaxRate: Number(d.membershipTaxRate ?? d.serviceTaxRate) || 5,
          packageTaxRate: Number(d.packageTaxRate ?? d.serviceTaxRate) || 5,
          prepaidWalletTaxRate: Number(d.prepaidWalletTaxRate ?? d.serviceTaxRate) || 5,
          essentialProductRate: Number(d.essentialProductRate) || 5,
          intermediateProductRate: Number(d.intermediateProductRate) || 12,
          standardProductRate: Number(d.standardProductRate) || 18,
          luxuryProductRate: Number(d.luxuryProductRate) || 28,
          exemptProductRate: Number(d.exemptProductRate) || 0,
        })
        setCheckoutPaymentConfiguration(
          d.paymentConfiguration !== undefined ? d.paymentConfiguration : null
        )
      })
      .catch(() => {
        if (!cancelled) {
          setCheckoutTaxSettings(null)
          setCheckoutPaymentConfiguration(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open || !customer) {
      setCheckoutMembershipData(null)
      return
    }
    const cid = String(customer._id || customer.id || "")
    if (!cid) {
      setCheckoutMembershipData(null)
      return
    }
    const asOf = appointmentDate
      ? format(appointmentDate, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd")
    let cancelled = false
    void MembershipAPI.getByCustomer(cid, { asOfDate: asOf })
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) setCheckoutMembershipData(res.data as ServiceCheckoutMembershipSnapshot)
        else setCheckoutMembershipData(null)
      })
      .catch(() => {
        if (!cancelled) setCheckoutMembershipData(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, customer, appointmentDate])

  useEffect(() => {
    if (!open || !clientProfileId) {
      setCheckoutClientStats(null)
      return
    }
    const fallbackVisits = customer?.totalVisits ?? 0
    const fallbackRevenue = customer?.totalSpent ?? 0
    const fallbackDues = customer?.totalDues ?? 0
    const phone = String(customer?.phone || "").trim()

    if (!phone) {
      setCheckoutClientStats({
        loading: false,
        totalVisits: fallbackVisits,
        totalRevenue: fallbackRevenue,
        duesAmount: fallbackDues,
      })
      return
    }

    let cancelled = false
    setCheckoutClientStats({
      loading: true,
      totalVisits: fallbackVisits,
      totalRevenue: fallbackRevenue,
      duesAmount: fallbackDues,
    })

    void SalesAPI.getByClient(phone)
      .then((res) => {
        if (cancelled) return
        const salesList = Array.isArray(res?.data) ? res.data : []
        const totalVisits = salesList.length
        const totalRevenue = salesList.reduce(
          (acc: number, s: any) => acc + (Number(s?.grossTotal) || Number(s?.netTotal) || 0),
          0
        )
        const duesAmount = salesList.reduce((acc: number, s: any) => {
          const remaining = Number(s?.paymentStatus?.remainingAmount) ?? 0
          return remaining > 0 ? acc + remaining : acc
        }, 0)
        setCheckoutClientStats({ loading: false, totalVisits, totalRevenue, duesAmount })
      })
      .catch(() => {
        if (!cancelled) {
          setCheckoutClientStats({
            loading: false,
            totalVisits: fallbackVisits,
            totalRevenue: fallbackRevenue,
            duesAmount: fallbackDues,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    open,
    clientProfileId,
    customer?.phone,
    customer?.totalVisits,
    customer?.totalSpent,
    customer?.totalDues,
  ])

  const serviceLinesMembershipSignature = useMemo(
    () =>
      lines
        .map((l) => {
          const manual = l.membershipAutoDiscount === false ? "0" : "1"
          return `${l.id}:${l.serviceId}:${serviceLineQuantity(l)}:${manual}`
        })
        .join("|"),
    [lines]
  )

  useEffect(() => {
    if (!open) return
    setLines((prev) =>
      applyMembershipToCheckoutServiceLines(prev, checkoutMembershipData, catalogServices)
    )
  }, [open, checkoutMembershipData, catalogServices, serviceLinesMembershipSignature])

  useEffect(() => {
    if (!open) {
      setCartBreakdownOpen(false)
      setPaymentMethodDialogOpen(false)
      setShowCreditChangeConfirm(false)
      setInlineClientPickerOpen(false)
      setIsChangingClientProfile(false)
    }
  }, [open])

  useEffect(() => {
    if (!open || !showClientSearchBox) return
    void clientStore.loadClients().finally(() => bumpClientDir())
    return clientStore.subscribe(bumpClientDir)
  }, [open, showClientSearchBox])

  useEffect(() => {
    if (!showClientSearchBox) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest(".checkout-client-search-container")) {
        setInlineClientPickerOpen(false)
        if (isChangingClientProfile) {
          setIsChangingClientProfile(false)
          setChangeClientQuery("")
          setChangeClientResults([])
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showClientSearchBox, isChangingClientProfile])

  useEffect(() => {
    if (!showClientSearchBox) return
    const trimmed = changeClientQuery.trim()
    if (trimmed.length < 2) {
      setChangeClientResults([])
      setChangeClientSearching(false)
      return
    }
    if (changeClientSearchTimerRef.current) clearTimeout(changeClientSearchTimerRef.current)
    changeClientSearchTimerRef.current = setTimeout(() => {
      void (async () => {
        setChangeClientSearching(true)
        try {
          const results = await clientStore.searchClients(trimmed)
          setChangeClientResults(results || [])
        } catch {
          setChangeClientResults([])
        } finally {
          setChangeClientSearching(false)
        }
      })()
    }, 300)
    return () => {
      if (changeClientSearchTimerRef.current) clearTimeout(changeClientSearchTimerRef.current)
    }
  }, [changeClientQuery, showClientSearchBox])

  useEffect(() => {
    if (!open) setClientDetailsDrawerOpen(false)
  }, [open])

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const clientId = customer ? String(customer._id || customer.id || "") : ""
      const resume = consumeResumeDraftIntent?.() === true
      if (resume && clientId && resumeSavedDraftToken) {
        const draft = readServiceCheckoutDraftByRef(resumeSavedDraftToken)
        if (draft && String(draft.clientId) === clientId) {
          persistedDraftRef.current = resumeSavedDraftToken
          snapshotRef.current = cloneLines(draft.bookingSnapshot)
          productSnapshotRef.current = []
          membershipSnapshotRef.current = []
          prepaidSnapshotRef.current = []
          packageSnapshotRef.current = []
          setLines(cloneLines(draft.lines))
          setProductLines(cloneProductLines(draft.productLines))
          setMembershipLines(cloneMembershipLines(draft.membershipLines))
          setPrepaidLines(clonePrepaidLines(draft.prepaidLines))
          setPackageLines(clonePackageLines(draft.packageLines || []))
          if (Array.isArray(draft.checkoutTipLines) && draft.checkoutTipLines.length > 0) {
            setCheckoutTipLines(cloneCheckoutTipLines(draft.checkoutTipLines as CheckoutTipLine[]))
          } else {
            setCheckoutTipLines([])
          }
          if (
            draft.checkoutCartDiscountType === "percentage" ||
            draft.checkoutCartDiscountType === "fixed"
          ) {
            setCheckoutCartDiscountType(draft.checkoutCartDiscountType)
            setCheckoutCartDiscountValue(
              typeof draft.checkoutCartDiscountValue === "number"
                ? Math.max(0, draft.checkoutCartDiscountValue)
                : 0
            )
          } else if (typeof draft.checkoutCartDiscount === "number" && draft.checkoutCartDiscount > 0) {
            setCheckoutCartDiscountType("fixed")
            setCheckoutCartDiscountValue(Math.max(0, draft.checkoutCartDiscount))
          } else {
            setCheckoutCartDiscountType("fixed")
            setCheckoutCartDiscountValue(0)
          }
          setCheckoutSaleNote(typeof draft.checkoutSaleNote === "string" ? draft.checkoutSaleNote : "")
          setSearch("")
          setCategory("services")
          setProductSearch("")
          setMembershipSearch("")
          setPrepaidSearch("")
          setPackageSearch("")
          setHasPersistedDraft(true)
          wasOpenRef.current = open
          return
        }
      }

      persistedDraftRef.current = null
      const snap = cloneLines(initialLines).map((l) => ({
        ...l,
        locked: true,
        quantity: serviceLineQuantity(l),
      }))
      snapshotRef.current = snap
      setLines(snap.length > 0 ? snap : [])
      setSearch("")
      setCategory("services")
      productSnapshotRef.current = []
      setProductLines([])
      setProductSearch("")
      membershipSnapshotRef.current = []
      setMembershipLines([])
      setMembershipSearch("")
      prepaidSnapshotRef.current = []
      setPrepaidLines([])
      setPrepaidSearch("")
      packageSnapshotRef.current = []
      setPackageLines([])
      setPackageSearch("")
      clearCheckoutExtras()
      setHasPersistedDraft(false)
    }
    wasOpenRef.current = open
  }, [open, initialLines, customer, appointmentId, consumeResumeDraftIntent, resumeSavedDraftToken])

  useEffect(() => {
    if (!open) {
      setEditingServiceLineId(null)
      setServiceEditDraft(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingProducts(true)
    ProductsAPI.getAll({ limit: 1000 })
      .then((res) => {
        if (cancelled || !res?.success) {
          if (!cancelled) setCatalogProducts([])
          return
        }
        const sellable = (res.data || []).filter((product: any) => {
          const productType = product.productType || "retail"
          return productType === "retail" || productType === "both"
        })
        if (!cancelled) setCatalogProducts(sellable)
      })
      .catch(() => {
        if (!cancelled) setCatalogProducts([])
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingMemberships(true)
    MembershipAPI.getPlans({ isActive: true })
      .then((res) => {
        if (cancelled || !res?.success) {
          if (!cancelled) setCatalogMembershipPlans([])
          return
        }
        const active = (res.data || []).filter((p: any) => p.isActive !== false)
        if (!cancelled) setCatalogMembershipPlans(active)
      })
      .catch(() => {
        if (!cancelled) setCatalogMembershipPlans([])
      })
      .finally(() => {
        if (!cancelled) setLoadingMemberships(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingPrepaidCatalog(true)
    ClientWalletAPI.listPlans({ status: "active" })
      .then((res) => {
        if (cancelled || !res?.success) {
          if (!cancelled) setCatalogPrepaidPlans([])
          return
        }
        if (!cancelled) setCatalogPrepaidPlans(res.data?.plans || [])
      })
      .catch(() => {
        if (!cancelled) setCatalogPrepaidPlans([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPrepaidCatalog(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingPackages(true)
    PackagesAPI.list({ status: "ACTIVE", limit: 500 })
      .then((res) => {
        if (cancelled || !res?.success) {
          if (!cancelled) setCatalogPackages([])
          return
        }
        if (!cancelled) setCatalogPackages(res.data?.packages || [])
      })
      .catch(() => {
        if (!cancelled) setCatalogPackages([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPackages(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    StaffDirectoryAPI.getAll()
      .then((res) => {
        if (cancelled || !res?.success) {
          if (!cancelled) setSaleStaffCatalog([])
          return
        }
        const list = (res.data || []).filter(isStaffEligibleForAppointmentScheduling)
        if (!cancelled) setSaleStaffCatalog(list)
      })
      .catch(() => {
        if (!cancelled) setSaleStaffCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const staffOptions = useMemo(() => {
    const raw = saleStaffCatalog.length > 0 ? saleStaffCatalog : staff
    return raw
      .filter(isStaffEligibleForAppointmentScheduling)
      .map((m: any) => ({
        id: String(m._id || m.id || ""),
        name: m.name || "Staff",
      }))
      .filter((s) => s.id)
  }, [saleStaffCatalog, staff])

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (catalogServices || []).filter((s: any) => {
      if (!q) return true
      const name = (s.name || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogServices, search])

  /** Hydrate pinned IDs from localStorage on mount and keep tabs in sync. */
  useEffect(() => {
    setPinnedServiceIds(readPinnedServiceIds())
    if (typeof window === "undefined") return
    const refresh = () => setPinnedServiceIds(readPinnedServiceIds())
    window.addEventListener(PINNED_CHECKOUT_SERVICES_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(PINNED_CHECKOUT_SERVICES_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFrequentServicesRanked(null)
    void AnalyticsAPI.getServicesTab()
      .then((res) => {
        if (cancelled) return
        if (!res.success || !res.data?.services) {
          setFrequentServicesRanked([])
          return
        }
        const breakdown =
          res.data.services.allServicesBreakdown ?? res.data.services.topServices ?? []
        const ranked = [...breakdown].sort(
          (a, b) =>
            (b.units || 0) - (a.units || 0) ||
            (b.bookings || 0) - (a.bookings || 0) ||
            (b.revenue || 0) - (a.revenue || 0)
        )
        setFrequentServicesRanked(ranked)
      })
      .catch(() => {
        if (!cancelled) setFrequentServicesRanked([])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  /** Default quick-access set when no search query: most frequently sold services (last ~12 months). */
  const topTenServices = useMemo(() => {
    const catalog = catalogServices || []
    if (!catalog.length) return []
    if (frequentServicesRanked === null) return catalog.slice(0, 10)
    if (frequentServicesRanked.length === 0) return catalog.slice(0, 10)
    return resolveFrequentCatalogServices(catalog, frequentServicesRanked, 10)
  }, [catalogServices, frequentServicesRanked])

  const topTenServiceIdSet = useMemo(
    () => new Set(topTenServices.map((s: any) => String(s._id || s.id))),
    [topTenServices]
  )

  /** Resolve pinned IDs against the live catalog (skip removed/disabled), excluding frequent defaults. */
  const pinnedServices = useMemo(() => {
    const out: any[] = []
    for (const id of pinnedServiceIds) {
      if (topTenServiceIdSet.has(id)) continue
      const svc = (catalogServices || []).find((s: any) => String(s._id || s.id) === id)
      if (svc) out.push(svc)
    }
    return out
  }, [pinnedServiceIds, catalogServices, topTenServiceIdSet])

  /** Services available to pin: everything in the catalog that isn't already shown by default. */
  const pinPickerCandidates = useMemo(() => {
    const alreadyShown = new Set<string>(topTenServiceIdSet)
    for (const svc of pinnedServices) alreadyShown.add(String(svc._id || svc.id))
    const q = pinPickerSearch.trim().toLowerCase()
    if (!q) return []
    return (catalogServices || [])
      .filter((s: any) => {
        const id = String(s._id || s.id)
        if (alreadyShown.has(id)) return false
        return (s.name || "").toLowerCase().includes(q)
      })
      .sort((a: any, b: any) => {
        const aName = String(a?.name || "")
        const bName = String(b?.name || "")
        return aName.localeCompare(bName, "en", { sensitivity: "base" })
      })
  }, [catalogServices, topTenServiceIdSet, pinnedServices, pinPickerSearch])

  const addPinnedService = useCallback((serviceId: string) => {
    if (!serviceId) return
    setPinnedServiceIds((prev) => {
      if (prev.includes(serviceId)) return prev
      const next = [...prev, serviceId]
      writePinnedServiceIds(next)
      return next
    })
  }, [])

  const removePinnedService = useCallback((serviceId: string) => {
    if (!serviceId) return
    setPinnedServiceIds((prev) => {
      const next = prev.filter((id) => id !== serviceId)
      writePinnedServiceIds(next)
      return next
    })
  }, [])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return (catalogProducts || []).filter((p: any) => {
      if (!q) return true
      const name = (p.name || "").toLowerCase()
      const categoryName = (p.category || "").toLowerCase()
      const barcode = String(p.barcode || "").toLowerCase()
      const sku = String(p.sku || "").toLowerCase()
      return name.includes(q) || categoryName.includes(q) || barcode.includes(q) || sku.includes(q)
    })
  }, [catalogProducts, productSearch])

  const filteredMembershipPlans = useMemo(() => {
    const q = membershipSearch.trim().toLowerCase()
    return (catalogMembershipPlans || []).filter((plan: any) => {
      if (!q) return true
      const name = (plan.planName || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogMembershipPlans, membershipSearch])

  const filteredPrepaidPlans = useMemo(() => {
    const q = prepaidSearch.trim().toLowerCase()
    return (catalogPrepaidPlans || []).filter((plan: any) => {
      if (!q) return true
      const name = (plan.name || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogPrepaidPlans, prepaidSearch])

  const filteredPackages = useMemo(() => {
    const q = packageSearch.trim().toLowerCase()
    return (catalogPackages || []).filter((pkg: any) => {
      if (!q) return true
      const name = (pkg.name || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogPackages, packageSearch])

  const cartPricing = useMemo(() => {
    const ts = checkoutTaxSettings
    const enableTax = ts?.enableTax !== false
    const inclusive = ts?.priceInclusiveOfTax !== false
    const sRate = ts?.serviceTaxRate ?? 5
    const mRate = ts?.membershipTaxRate ?? sRate
    const prRate = ts?.prepaidWalletTaxRate ?? sRate
    const pkRate = ts?.packageTaxRate ?? sRate

    let lineNetSum = 0
    let taxSum = 0
    let toPay = 0
    /** Same cart with membership benefit removed on auto-discount service lines (list × qty, tax recomputed). */
    let lineNetSumExclMembership = 0
    let taxSumExclMembership = 0
    /** Pre-tax value of lines: excl. membership benefit on services, vs current (for display / membership savings). */
    let subtotalPreTaxExclMembership = 0
    let subtotalPreTaxCurrent = 0
    /** Sum of pre-tax amounts from line gross (price × qty) before line-item discounts. */
    let subtotalPreTaxGrossBeforeLineDiscounts = 0

    const netToPreTaxLine = (net: number, rate: number, taxable: boolean) => {
      if (!enableTax || !taxable || rate <= 0) return net
      if (inclusive) return net / (1 + rate / 100)
      return net
    }

    const addLine = (
      netCurrent: number,
      netExclMembership: number,
      rate: number,
      taxable: boolean
    ) => {
      lineNetSum += netCurrent
      lineNetSumExclMembership += netExclMembership
      subtotalPreTaxCurrent += netToPreTaxLine(netCurrent, rate, taxable)
      subtotalPreTaxExclMembership += netToPreTaxLine(netExclMembership, rate, taxable)
      const apply = enableTax && taxable && rate > 0
      if (!apply) {
        toPay += netCurrent
        return
      }
      if (inclusive) {
        taxSum += netCurrent - netCurrent / (1 + rate / 100)
        taxSumExclMembership += netExclMembership - netExclMembership / (1 + rate / 100)
        toPay += netCurrent
      } else {
        const tCur = (netCurrent * rate) / 100
        const tEx = (netExclMembership * rate) / 100
        taxSum += tCur
        taxSumExclMembership += tEx
        toPay += netCurrent + tCur
      }
    }

    lines.forEach((l) => {
      const qty = serviceLineQuantity(l)
      const price = Number(l.price) || 0
      const grossLine = price * qty
      const netCurrent = lineNetAfterLineDiscount(
        price,
        qty,
        l.discountValue,
        l.discountIsPercent
      )
      const netExclMembership = l.membershipAutoDiscount ? price * qty : netCurrent
      const svc = catalogServices.find((s: any) => String(s._id || s.id) === String(l.serviceId))
      const rate = sRate
      const taxable = !!(svc?.taxApplicable === true)
      subtotalPreTaxGrossBeforeLineDiscounts += netToPreTaxLine(grossLine, rate, taxable)
      addLine(netCurrent, netExclMembership, rate, taxable)
    })

    productLines.forEach((l) => {
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const price = Number(l.price) || 0
      const grossLine = price * q
      const net = lineNetAfterLineDiscount(price, q, l.discountValue, l.discountIsPercent)
      const p = catalogProducts.find((x: any) => String(x._id || x.id) === String(l.productId))
      let rate = ts?.standardProductRate ?? 18
      if (p?.taxCategory && ts) {
        switch (p.taxCategory) {
          case "essential":
            rate = ts.essentialProductRate
            break
          case "intermediate":
            rate = ts.intermediateProductRate
            break
          case "standard":
            rate = ts.standardProductRate
            break
          case "luxury":
            rate = ts.luxuryProductRate
            break
          case "exempt":
            rate = ts.exemptProductRate
            break
          default:
            rate = ts.standardProductRate
        }
      }
      subtotalPreTaxGrossBeforeLineDiscounts += netToPreTaxLine(grossLine, rate, true)
      addLine(net, net, rate, true)
    })

    membershipLines.forEach((l) => {
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const price = Number(l.price) || 0
      const grossLine = price * q
      const net = lineNetAfterLineDiscount(price, q, l.discountValue, l.discountIsPercent)
      subtotalPreTaxGrossBeforeLineDiscounts += netToPreTaxLine(grossLine, mRate, true)
      addLine(net, net, mRate, true)
    })

    prepaidLines.forEach((l) => {
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const price = Number(l.price) || 0
      const grossLine = price * q
      const net = lineNetAfterLineDiscount(price, q, l.discountValue, l.discountIsPercent)
      subtotalPreTaxGrossBeforeLineDiscounts += netToPreTaxLine(grossLine, prRate, true)
      addLine(net, net, prRate, true)
    })

    packageLines.forEach((l) => {
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const price = Number(l.price) || 0
      const grossLine = price * q
      const net = lineNetAfterLineDiscount(price, q, l.discountValue, l.discountIsPercent)
      subtotalPreTaxGrossBeforeLineDiscounts += netToPreTaxLine(grossLine, pkRate, true)
      addLine(net, net, pkRate, true)
    })

    return {
      lineNetSum,
      taxSum,
      toPay,
      lineNetSumExclMembership,
      taxSumExclMembership,
      subtotalPreTaxExclMembership,
      subtotalPreTaxCurrent,
      subtotalPreTaxGrossBeforeLineDiscounts,
    }
  }, [
    lines,
    productLines,
    membershipLines,
    prepaidLines,
    packageLines,
    checkoutTaxSettings,
    catalogServices,
    catalogProducts,
  ])

  const inclusivePricing = checkoutTaxSettings?.priceInclusiveOfTax !== false
  const taxEnabled = checkoutTaxSettings?.enableTax !== false
  const cartToPay = cartPricing.toPay
  const membershipDiscountPreTaxRupees = Math.max(
    0,
    cartPricing.subtotalPreTaxExclMembership - cartPricing.subtotalPreTaxCurrent
  )

  const grossPreTaxTotal = cartPricing.subtotalPreTaxGrossBeforeLineDiscounts
  const totalPreTaxLineDiscountEffect = Math.max(
    0,
    grossPreTaxTotal - cartPricing.subtotalPreTaxCurrent
  )
  /** Line-item (non-membership) discounts in pre-tax rupees; membership savings use the row below. */
  const itemManualDiscountPreTaxRupees = Math.max(
    0,
    totalPreTaxLineDiscountEffect - membershipDiscountPreTaxRupees
  )

  const cartDiscountApplied = useMemo(() => {
    const toPay = Math.max(0, cartPricing.toPay)
    if (toPay <= 0) return 0
    if (checkoutCartDiscountType === "percentage") {
      const pct = Math.min(100, Math.max(0, checkoutCartDiscountValue))
      if (pct <= 0) return 0
      return Math.min((toPay * pct) / 100, toPay)
    }
    return Math.min(Math.max(0, checkoutCartDiscountValue), toPay)
  }, [checkoutCartDiscountType, checkoutCartDiscountValue, cartPricing.toPay])
  const cartToPayAfterDiscount = Math.max(0, cartPricing.toPay - cartDiscountApplied)

  const checkoutTipTotal = useMemo(
    () =>
      checkoutTipLines
        .filter((t) => t.staffId && t.amount > 0)
        .reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0),
    [checkoutTipLines]
  )

  /** Scale tax & pre-tax base by cart discount so GST matches amount payable (same proportion as total). */
  const cartPostDiscountFactor =
    cartPricing.toPay > 1e-9
      ? Math.min(1, Math.max(0, cartToPayAfterDiscount / cartPricing.toPay))
      : 0
  const cartTaxAfterCartDiscount = taxEnabled ? cartPricing.taxSum * cartPostDiscountFactor : 0
  const cartPreTaxBaseAfterCartDiscount = inclusivePricing
    ? (cartPricing.lineNetSum - cartPricing.taxSum) * cartPostDiscountFactor
    : cartPricing.lineNetSum * cartPostDiscountFactor

  const serviceCheckoutRedemptionLines = useMemo((): PaymentRedemptionLine[] => {
    const ts = checkoutTaxSettings
    const out: PaymentRedemptionLine[] = []
    if (!ts) return out
    const toPay = cartPricing.toPay
    const disc =
      toPay <= 0
        ? 0
        : checkoutCartDiscountType === "percentage"
          ? Math.min((toPay * Math.min(100, Math.max(0, checkoutCartDiscountValue))) / 100, toPay)
          : Math.min(Math.max(0, checkoutCartDiscountValue), toPay)
    const afterPay = Math.max(0, toPay - disc)
    const factor = toPay > 1e-9 ? afterPay / toPay : 0
    const cartDiscounted = factor < 1 - 1e-9
    const sRate = ts.serviceTaxRate ?? 5
    const mRate = ts.membershipTaxRate ?? sRate
    const prRate = ts.prepaidWalletTaxRate ?? sRate
    const pkRate = ts.packageTaxRate ?? sRate

    for (const l of lines) {
      if (!l.serviceId) continue
      const qty = serviceLineQuantity(l)
      const undiscountedNet = (Number(l.price) || 0) * qty
      const net = lineNetAfterLineDiscount(
        Number(l.price) || 0,
        qty,
        l.discountValue,
        l.discountIsPercent
      )
      const svc = catalogServices.find((s: any) => String(s._id || s.id) === String(l.serviceId))
      const taxable = !!(svc?.taxApplicable === true)
      const gross = lineGrossPayableForCheckout(net, sRate, taxable, ts)
      out.push({
        type: "service",
        total: gross * factor,
        isDiscounted: cartDiscounted || net < undiscountedNet - 0.01,
      })
    }
    for (const l of productLines) {
      if (!l.productId) continue
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const undiscountedNet = (Number(l.price) || 0) * q
      const net = lineNetAfterLineDiscount(Number(l.price) || 0, q, l.discountValue, l.discountIsPercent)
      const p = catalogProducts.find((x: any) => String(x._id || x.id) === String(l.productId))
      let rate = ts.standardProductRate ?? 18
      if (p?.taxCategory) {
        switch (p.taxCategory) {
          case "essential":
            rate = ts.essentialProductRate
            break
          case "intermediate":
            rate = ts.intermediateProductRate
            break
          case "standard":
            rate = ts.standardProductRate
            break
          case "luxury":
            rate = ts.luxuryProductRate
            break
          case "exempt":
            rate = ts.exemptProductRate
            break
          default:
            rate = ts.standardProductRate
        }
      }
      const gross = lineGrossPayableForCheckout(net, rate, true, ts)
      out.push({
        type: "product",
        total: gross * factor,
        isDiscounted: cartDiscounted || net < undiscountedNet - 0.01,
      })
    }
    for (const l of membershipLines) {
      if (!l.planId) continue
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const undiscountedNet = (Number(l.price) || 0) * q
      const net = lineNetAfterLineDiscount(Number(l.price) || 0, q, l.discountValue, l.discountIsPercent)
      const gross = lineGrossPayableForCheckout(net, mRate, true, ts)
      out.push({
        type: "membership",
        total: gross * factor,
        isDiscounted: cartDiscounted || net < undiscountedNet - 0.01,
      })
    }
    for (const l of prepaidLines) {
      if (!l.planId) continue
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const net = lineNetAfterLineDiscount(Number(l.price) || 0, q, l.discountValue, l.discountIsPercent)
      const gross = lineGrossPayableForCheckout(net, prRate, true, ts)
      out.push({ type: "prepaid_wallet", total: gross * factor })
    }
    for (const l of packageLines) {
      if (!l.packageId) continue
      const q = Math.max(1, Math.floor(Number(l.quantity) || 1))
      const undiscountedNet = (Number(l.price) || 0) * q
      const net = lineNetAfterLineDiscount(Number(l.price) || 0, q, l.discountValue, l.discountIsPercent)
      const gross = lineGrossPayableForCheckout(net, pkRate, true, ts)
      out.push({
        type: "package",
        total: gross * factor,
        isDiscounted: cartDiscounted || net < undiscountedNet - 0.01,
      })
    }
    return out
  }, [
    checkoutTaxSettings,
    cartPricing.toPay,
    checkoutCartDiscountType,
    checkoutCartDiscountValue,
    lines,
    productLines,
    membershipLines,
    prepaidLines,
    packageLines,
    catalogServices,
    catalogProducts,
  ])

  const paymentDialogPayCfg = useMemo(
    () => mergePaymentConfiguration(checkoutPaymentConfiguration as any),
    [checkoutPaymentConfiguration]
  )

  const paymentEligibleWalletSub = useMemo(() => {
    if (paymentDialogPayCfg.billingRedemption.allowRedemptionInBilling === false) return 0
    if (paymentDialogPayCfg.walletRedemption.enabled === false) return 0
    return eligibleRedemptionSubtotal(serviceCheckoutRedemptionLines, paymentDialogPayCfg, "wallet")
  }, [paymentDialogPayCfg, serviceCheckoutRedemptionLines])

  const paymentEligibleRewardRounded = useMemo(() => {
    if (paymentDialogPayCfg.billingRedemption.allowRedemptionInBilling === false) return 0
    if (paymentDialogPayCfg.rewardPointRedemption.enabled === false) return 0
    return Math.round(eligibleRedemptionSubtotal(serviceCheckoutRedemptionLines, paymentDialogPayCfg, "reward"))
  }, [paymentDialogPayCfg, serviceCheckoutRedemptionLines])

  const paymentBaseRounded = useMemo(() => Math.round(cartToPayAfterDiscount), [cartToPayAfterDiscount])
  /** Cart subtotal (rounded) + tips; matches amount due before loyalty in payment sheet when points = 0. */
  const cartToPayIncludingTips = paymentBaseRounded + checkoutTipTotal

  const paymentLoyaltyPreview = useMemo(() => {
    if (!paymentDialogRewardSettings?.enabled) {
      return { ok: true as const, pointsToRedeem: 0, discountRupees: 0, error: undefined as string | undefined }
    }
    const cid = customer ? String(customer._id || customer.id || "") : ""
    if (!cid || !isLikelyMongoObjectId(cid)) {
      return { ok: true as const, pointsToRedeem: 0, discountRupees: 0, error: undefined as string | undefined }
    }
    const allowBill = paymentDialogPayCfg.billingRedemption.allowRedemptionInBilling !== false
    const cap = allowBill ? paymentEligibleRewardRounded : paymentBaseRounded
    return previewRedemptionLive(
      paymentDialogRewardSettings,
      cap,
      payLoyaltyPoints,
      paymentDialogLoyaltyBalance
    )
  }, [
    paymentDialogRewardSettings,
    paymentDialogPayCfg,
    paymentEligibleRewardRounded,
    paymentBaseRounded,
    payLoyaltyPoints,
    paymentDialogLoyaltyBalance,
    customer,
  ])

  const paymentDueAfterLoyalty = useMemo(() => {
    const disc =
      paymentLoyaltyPreview.ok && paymentLoyaltyPreview.discountRupees > 0
        ? paymentLoyaltyPreview.discountRupees
        : 0
    return Math.max(0, paymentBaseRounded - disc) + checkoutTipTotal
  }, [paymentBaseRounded, paymentLoyaltyPreview, checkoutTipTotal])

  const paymentPayableAfterWallet = useMemo(
    () => Math.max(0, paymentDueAfterLoyalty - payWallet),
    [paymentDueAfterLoyalty, payWallet]
  )

  const paymentDialogStackWalletAndReward = useMemo(
    () => paymentDialogPayCfg.billingRedemption.allowWalletAndPointsTogether !== false,
    [paymentDialogPayCfg]
  )

  const paymentSelectedWalletRow = useMemo(() => {
    if (!paySelectedWalletId || !paymentDialogWalletsRaw.length) return null
    return (
      paymentDialogWalletsRaw.find((w: any) => String(w._id) === String(paySelectedWalletId)) ?? null
    )
  }, [paySelectedWalletId, paymentDialogWalletsRaw])

  const paymentWalletRedemptionTileDisabled = useMemo(
    () => !paymentDialogShowWallet || paymentDialogPayCfg.walletRedemption.enabled === false,
    [paymentDialogShowWallet, paymentDialogPayCfg]
  )

  const paymentTotalTenderEntered = useMemo(
    () => payCash + payCard + payOnline + payWallet,
    [payCash, payCard, payOnline, payWallet]
  )
  const paymentRemainingDue = useMemo(
    () => Math.max(0, paymentDueAfterLoyalty - paymentTotalTenderEntered),
    [paymentDueAfterLoyalty, paymentTotalTenderEntered]
  )

  const formatCheckoutInr = (amount: number) =>
    amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })

  /** True when a cart discount is already configured (amount or % on file, or non-zero applied). */
  const hasCheckoutCartDiscount =
    cartDiscountApplied > 0 || checkoutCartDiscountValue > 0

  function openCartDiscountDialog() {
    setCartDiscountDraftType(checkoutCartDiscountType)
    const v = checkoutCartDiscountValue
    if (v > 0) {
      setCartDiscountDraft(String(v))
    } else if (cartDiscountApplied > 0) {
      setCartDiscountDraft(String(cartDiscountApplied))
    } else {
      setCartDiscountDraft("")
    }
    setCartDiscountDialogOpen(true)
  }

  const cartHasAnyItem =
    lines.length > 0 ||
    productLines.length > 0 ||
    membershipLines.length > 0 ||
    prepaidLines.length > 0 ||
    packageLines.length > 0

  const clientInitial =
    customer?.name?.trim()?.charAt(0)?.toUpperCase() ||
    customer?.phone?.trim()?.charAt(0) ||
    "?"

  function restoreBookingLines() {
    setLines(cloneLines(snapshotRef.current))
    setProductLines(cloneProductLines(productSnapshotRef.current))
    setMembershipLines(cloneMembershipLines(membershipSnapshotRef.current))
    setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
    setPackageLines(clonePackageLines(packageSnapshotRef.current))
    toast({
      title: "Cart restored",
      description: "Booking snapshot restored for services, products, and add-ons.",
    })
  }

  function defaultStaffAcrossCart() {
    return (
      lines.find((l) => l.staffId)?.staffId ||
      productLines.find((l) => l.staffId)?.staffId ||
      membershipLines.find((l) => l.staffId)?.staffId ||
      prepaidLines.find((l) => l.staffId)?.staffId ||
      packageLines.find((l) => l.staffId)?.staffId ||
      staffOptions[0]?.id ||
      ""
    )
  }

  function clearCheckoutExtras() {
    setCheckoutTipLines([])
    setCheckoutCartDiscountType("fixed")
    setCheckoutCartDiscountValue(0)
    setCheckoutSaleNote("")
  }

  function openTipDialog() {
    const def = defaultStaffAcrossCart()
    if (checkoutTipLines.length > 0) {
      setTipDraftLines(cloneCheckoutTipLines(checkoutTipLines))
    } else {
      setTipDraftLines([
        { id: `tip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, staffId: def, amount: 0 },
      ])
    }
    setTipDialogOpen(true)
  }

  function commitTipDialog() {
    const next = tipDraftLines
      .map((l) => ({
        id: l.id,
        staffId: String(l.staffId || "").trim(),
        amount: Math.max(0, Number(l.amount) || 0),
      }))
      .filter((l) => l.staffId && l.amount > 0)
    setCheckoutTipLines(next)
    setTipDialogOpen(false)
  }

  function addCatalogService(svc: any) {
    const defaultStaffId = defaultStaffAcrossCart()

    if (isBundleService(svc)) {
      const expanded = expandBundleToLines(svc, catalogServices || [])
      if (!expanded.length) {
        toast({
          title: "Bundle error",
          description: "Could not expand bundle services.",
          variant: "destructive",
        })
        return
      }
      setLines((prev) => {
        const ts = Date.now()
        const additions = expanded.map((line, i) => ({
          id: `add-${ts}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          serviceId: line.serviceId,
          staffId: defaultStaffId,
          name: line.name || "Service",
          duration: Number(line.duration) || 60,
          price: Number(line.price) || 0,
          quantity: 1,
          locked: false,
          discountValue: 0,
          discountIsPercent: true,
          membershipAutoDiscount: false,
          fromBundle: true,
        }))
        return [...prev, ...additions]
      })
      return
    }

    const sid = String(svc._id || svc.id || "")
    if (!sid) return
    setLines((prev) => [
      ...prev,
      {
        id: `add-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        serviceId: sid,
        staffId: defaultStaffId,
        name: svc.name || "Service",
        duration: Number(svc.duration) || 60,
        price: Number(svc.price) || 0,
        quantity: 1,
        locked: false,
        discountValue: 0,
        discountIsPercent: true,
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  function setServiceLineQuantity(lineId: string, quantity: number) {
    const q = Math.max(1, Math.floor(quantity) || 1)
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: q } : l))
    )
  }

  function setServiceLineStaff(lineId: string, staffId: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, staffId } : l))
    )
  }

  function patchServiceLine(lineId: string, patch: Partial<ServiceCheckoutLine>) {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function openServiceEdit(lineId: string) {
    const line = lines.find((l) => l.id === lineId)
    if (!line) return
    setEditingServiceLineId(lineId)
    setServiceEditDraft({
      price: Math.max(0, Number(line.price) || 0),
      quantity: serviceLineQuantity(line),
      staffId: line.staffId || "",
    })
  }

  function closeServiceEdit() {
    setEditingServiceLineId(null)
    setServiceEditDraft(null)
  }

  function applyServiceEdit() {
    if (!editingServiceLineId || !serviceEditDraft) return
    setLines((prev) =>
      prev.map((l) =>
        l.id === editingServiceLineId
          ? {
              ...l,
              price: serviceEditDraft.price,
              quantity: Math.max(1, Math.floor(serviceEditDraft.quantity) || 1),
              staffId: serviceEditDraft.staffId,
            }
          : l
      )
    )
    closeServiceEdit()
  }

  function removeServiceFromEditDialog() {
    if (!editingServiceLineId) return
    removeLine(editingServiceLineId)
    closeServiceEdit()
  }

  function addCatalogProduct(p: any) {
    const pid = String(p._id || p.id || "")
    if (!pid) return
    const stockQty = catalogProductStockUnits(p)
    if (stockQty <= 0) return
    const unitsInCart = productLines
      .filter((l) => String(l.productId) === pid)
      .reduce((sum, l) => sum + Math.max(1, Math.floor(Number(l.quantity) || 1)), 0)
    if (unitsInCart >= stockQty) return
    const defaultStaffId = defaultStaffAcrossCart()
    const unit = Number(p.price) || 0
    setProductLines((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: pid,
        staffId: defaultStaffId,
        name: p.name || "Product",
        price: unit,
        quantity: 1,
        discountValue: 0,
        discountIsPercent: true,
      },
    ])
  }

  function removeProductLine(id: string) {
    setProductLines((prev) => prev.filter((l) => l.id !== id))
  }

  function setProductQuantity(lineId: string, quantity: number) {
    const qRaw = Math.max(1, Math.floor(quantity) || 1)
    setProductLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l
        const cap = maxProductLineQtyFromStock(l, prev, catalogProducts)
        const q = Math.min(qRaw, Math.max(1, cap))
        return { ...l, quantity: q }
      })
    )
  }

  function setProductLineStaff(lineId: string, staffId: string) {
    setProductLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, staffId } : l))
    )
  }

  function patchProductLine(lineId: string, patch: Partial<ServiceCheckoutProductLine>) {
    setProductLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function patchMembershipLine(lineId: string, patch: Partial<ServiceCheckoutMembershipLine>) {
    setMembershipLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function patchPrepaidLine(lineId: string, patch: Partial<ServiceCheckoutPrepaidLine>) {
    setPrepaidLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function patchPackageLine(lineId: string, patch: Partial<ServiceCheckoutPackageLine>) {
    setPackageLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function addCatalogMembershipPlan(plan: any) {
    const planId = String(plan._id || plan.id || "")
    if (!planId) return
    const defaultStaffId = defaultStaffAcrossCart()
    setMembershipLines((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        planId,
        staffId: defaultStaffId,
        planName: plan.planName || "Membership",
        price: Number(plan.price) || 0,
        durationInDays: Number(plan.durationInDays) || 0,
        quantity: 1,
        discountValue: 0,
        discountIsPercent: true,
      },
    ])
  }

  function removeMembershipLine(id: string) {
    setMembershipLines((prev) => prev.filter((l) => l.id !== id))
  }

  function setMembershipQuantity(lineId: string, quantity: number) {
    const q = Math.max(1, Math.floor(quantity) || 1)
    setMembershipLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: q } : l))
    )
  }

  function setMembershipLineStaff(lineId: string, staffId: string) {
    setMembershipLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, staffId } : l))
    )
  }

  function addCatalogPrepaidPlan(plan: any) {
    const planId = String(plan._id || plan.id || "")
    if (!planId) return
    const defaultStaffId = defaultStaffAcrossCart()
    const pay = Number(plan.payAmount) || 0
    setPrepaidLines((prev) => [
      ...prev,
      {
        id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        planId,
        staffId: defaultStaffId,
        planName: plan.name || "Prepaid plan",
        creditAmount: Number(plan.creditAmount) || 0,
        validityDays: Number(plan.validityDays) || 0,
        price: pay,
        quantity: 1,
        discountValue: 0,
        discountIsPercent: true,
      },
    ])
  }

  function removePrepaidLine(id: string) {
    setPrepaidLines((prev) => prev.filter((l) => l.id !== id))
  }

  function setPrepaidQuantity(lineId: string, quantity: number) {
    const q = Math.max(1, Math.floor(quantity) || 1)
    setPrepaidLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: q } : l))
    )
  }

  function setPrepaidLineStaff(lineId: string, staffId: string) {
    setPrepaidLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, staffId } : l))
    )
  }

  function addCatalogPackage(pkg: any) {
    const packageId = String(pkg._id || pkg.id || "")
    if (!packageId) return
    const defaultStaffId = defaultStaffAcrossCart()
    setPackageLines((prev) => [
      ...prev,
      {
        id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        packageId,
        staffId: defaultStaffId,
        packageName: pkg.name || "Package",
        price: Number(pkg.total_price) || 0,
        totalSittings: Number(pkg.total_sittings) || 0,
        validityDays: Number(pkg.validity_days) || 0,
        quantity: 1,
        discountValue: 0,
        discountIsPercent: true,
      },
    ])
  }

  function removePackageLine(id: string) {
    setPackageLines((prev) => prev.filter((l) => l.id !== id))
  }

  function setPackageQuantity(lineId: string, quantity: number) {
    const q = Math.max(1, Math.floor(quantity) || 1)
    setPackageLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: q } : l))
    )
  }

  function setPackageLineStaff(lineId: string, staffId: string) {
    setPackageLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, staffId } : l))
    )
  }

  function validateCheckoutBeforePayment(): boolean {
    if (!customer) {
      toast({ title: "Select a client", description: "Choose a client before checkout.", variant: "destructive" })
      return false
    }
    const hasExtras =
      productLines.length > 0 ||
      membershipLines.length > 0 ||
      prepaidLines.length > 0 ||
      packageLines.length > 0
    if (lines.length === 0 && !hasExtras) {
      toast({
        title: "Cart is empty",
        description: "Add at least one service, product, or other item.",
        variant: "destructive",
      })
      return false
    }
    if (lines.length > 0) {
      const missingStaff = lines.some((l) => l.serviceId && !l.staffId)
      if (missingStaff) {
        toast({ title: "Assign staff", description: "Every service needs a staff member.", variant: "destructive" })
        return false
      }
      const missingService = lines.some((l) => !l.serviceId)
      if (missingService) {
        toast({ title: "Invalid line", description: "Remove empty service rows.", variant: "destructive" })
        return false
      }
    }
    if (membershipLines.length > 0 && membershipLines.some((l) => l.planId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every membership line needs a staff member.",
        variant: "destructive",
      })
      return false
    }
    if (prepaidLines.length > 0 && prepaidLines.some((l) => l.planId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every prepaid plan line needs a staff member.",
        variant: "destructive",
      })
      return false
    }
    if (packageLines.length > 0 && packageLines.some((l) => l.packageId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every package line needs a staff member.",
        variant: "destructive",
      })
      return false
    }
    if (productLines.length > 0 && productLines.some((l) => l.productId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every product line needs a staff member.",
        variant: "destructive",
      })
      return false
    }
    return true
  }

  useEffect(() => {
    if (!paymentMethodDialogOpen || !customer) return
    const cid = String(customer._id || customer.id || "")
    const payCfg = mergePaymentConfiguration(checkoutPaymentConfiguration as any)
    let cancelled = false
    setPaymentMethodLoading(true)
    setShowCreditChangeConfirm(false)
    setPayCash(0)
    setPayCard(0)
    setPayOnline(0)
    setPayWallet(0)
    setPayLoyaltyPoints(0)

    void (async () => {
      const allowBill = payCfg.billingRedemption.allowRedemptionInBilling !== false
      const eligibleW =
        allowBill && payCfg.walletRedemption.enabled !== false
          ? eligibleRedemptionSubtotal(serviceCheckoutRedemptionLines, payCfg, "wallet")
          : 0
      const eligibleR =
        allowBill && payCfg.rewardPointRedemption.enabled !== false
          ? Math.round(eligibleRedemptionSubtotal(serviceCheckoutRedemptionLines, payCfg, "reward"))
          : 0

      let wallets: any[] = []
      let walletBranchSettings: any = null
      try {
        const ws = await ClientWalletAPI.getSettings()
        if (ws.success && ws.data) walletBranchSettings = ws.data
      } catch {
        walletBranchSettings = null
      }
      if (cid && isLikelyMongoObjectId(cid)) {
        try {
          const wres = await ClientWalletAPI.getClientWallets(cid)
          if (wres.success && wres.data?.wallets) {
            wallets = filterWalletsForQuickSaleDisplay(wres.data.wallets as any[])
          }
        } catch {
          wallets = []
        }
      }
      let walletsForUi = wallets
      if (walletBranchSettings?.combineMultipleWallets && wallets.length > 1) {
        walletsForUi = [buildCombinedQuickSaleWalletRow(wallets)]
      }

      let loyalty = 0
      let rewardSettings: any = null
      try {
        const rs = await RewardPointsAPI.getSettings()
        if (rs.success && rs.data) rewardSettings = rs.data
      } catch {
        rewardSettings = null
      }
      if (cid && isLikelyMongoObjectId(cid)) {
        try {
          const cres = await ClientsAPI.getById(cid)
          if (cres.success && cres.data) loyalty = Number((cres.data as any).rewardPointsBalance) || 0
        } catch {
          loyalty = 0
        }
      }

      const showWallet = walletsForUi.length > 0 && eligibleW > 0
      const showReward =
        !!rewardSettings?.enabled &&
        loyalty > 0 &&
        !!cid &&
        isLikelyMongoObjectId(cid) &&
        eligibleR > 0

      const walletSum = wallets.reduce((s, w) => s + (Number(w.remainingBalance) || 0), 0)
      if (cancelled) return
      setPaymentDialogWalletsRaw(walletsForUi)
      setPaymentDialogWalletsUncombined(wallets)
      setPaymentDialogRewardSettings(rewardSettings)
      setPaymentDialogLoyaltyBalance(loyalty)
      setPaySelectedWalletId(walletsForUi.length ? String(walletsForUi[0]._id) : "")
      setPaymentDialogShowWallet(showWallet)
      setPaymentDialogShowReward(showReward)
      setPaymentDialogWalletBalanceText(
        showWallet
          ? `Balance ≈ ₹${walletSum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
          : ""
      )
      setPaymentDialogRewardBalanceText(
        showReward ? `${loyalty.toLocaleString("en-IN")} pts available` : ""
      )
      setPaymentMethodLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [paymentMethodDialogOpen, customer, serviceCheckoutRedemptionLines, checkoutPaymentConfiguration])

  function continueToPayment() {
    if (!validateCheckoutBeforePayment()) return
    setPaymentMethodDialogOpen(true)
  }

  const closePaymentStep = useCallback(() => {
    if (navigating) return
    setShowCreditChangeConfirm(false)
    setPaymentMethodDialogOpen(false)
  }, [navigating])

  useImperativeHandle(
    ref,
    () => ({
      closePaymentStep: () => {
        closePaymentStep()
      },
    }),
    [closePaymentStep]
  )

  useEffect(() => {
    onPaymentStepChange?.(paymentMethodDialogOpen)
  }, [paymentMethodDialogOpen, onPaymentStepChange])

  async function confirmPaymentMethodAndContinue(opts?: {
    skipPartialConfirm?: boolean
    creditBillChangeToWallet?: boolean
  }) {
    const due = paymentDueAfterLoyalty
    const cash = Math.max(0, Number(payCash) || 0)
    const card = Math.max(0, Number(payCard) || 0)
    const online = Math.max(0, Number(payOnline) || 0)
    const wallet = Math.max(0, Number(payWallet) || 0)
    const pts = Math.max(0, Math.floor(Number(payLoyaltyPoints) || 0))

    if (!paymentDialogStackWalletAndReward && wallet > 1e-6 && pts > 0) {
      toast({
        title: "Wallet and points",
        description: "This location does not allow combining wallet redemption with reward points on one bill.",
        variant: "destructive",
      })
      return
    }

    if (pts > 0 && paymentDialogShowReward) {
      if (!paymentLoyaltyPreview.ok) {
        toast({
          title: "Invalid reward points",
          description: paymentLoyaltyPreview.error || "Adjust points or remove them to continue.",
          variant: "destructive",
        })
        return
      }
    }

    if (wallet > 0) {
      if (!paymentDialogShowWallet) {
        toast({
          title: "Wallet not available",
          description: "Wallet payment isn't offered for this cart.",
          variant: "destructive",
        })
        return
      }
      if (!paySelectedWalletId) {
        toast({
          title: "Select a wallet",
          description: "Choose which prepaid wallet to debit.",
          variant: "destructive",
        })
        return
      }
      const wSel = paymentDialogWalletsRaw.find((x: any) => String(x._id) === String(paySelectedWalletId))
      if (!wSel) {
        toast({
          title: "Wallet unavailable",
          description: "The selected wallet is no longer available.",
          variant: "destructive",
        })
        return
      }
      const bal = Number(wSel.remainingBalance) || 0
      if (wallet > bal + 1e-6) {
        toast({
          title: "Wallet over balance",
          description: `This wallet has ₹${formatCheckoutInr(bal)} left.`,
          variant: "destructive",
        })
        return
      }
      const maxWalletForBill = Math.min(due, paymentEligibleWalletSub)
      if (wallet > maxWalletForBill + 1e-6) {
        toast({
          title: "Wallet limit",
          description: `Up to ₹${formatCheckoutInr(maxWalletForBill)} from wallet applies to this bill.`,
          variant: "destructive",
        })
        return
      }
    }

    const totalPaid = cash + card + online + wallet

    if (due <= 0.01) {
      if (totalPaid > 0.05) {
        toast({
          title: "Nothing to collect",
          description: "Reward discount covers this amount due. Clear cash, card, online, and wallet fields.",
          variant: "destructive",
        })
        return
      }
    } else {
      if (totalPaid < 0.005) {
        toast({
          title: "No payment entered",
          description: "Enter at least one tender amount for this bill, or reduce reward points if the client pays nothing now.",
          variant: "destructive",
        })
        return
      }
    }

    const isPartialPayment = due > 0.01 && totalPaid + 0.02 < due
    if (isPartialPayment && opts?.skipPartialConfirm !== true) {
      setCheckoutPartialPaymentConfirmAck(false)
      setCheckoutPartialPaymentConfirmOpen(true)
      return
    }

    if (due > 0.01 && totalPaid > due + 0.05 && opts?.creditBillChangeToWallet !== true) {
      const PAY_EPS = 0.01
      const isCashOnly =
        cash >= PAY_EPS && card < PAY_EPS && online < PAY_EPS && wallet < PAY_EPS
      const cid = String(customer?._id || customer?.id || "")
      if (!isCashOnly) {
        toast({
          title: "Overpaid",
          description:
            "Change can be credited to prepaid only when the bill is paid entirely in cash. Remove card, online, or wallet payment, or reduce tender amounts to match the bill total.",
          variant: "destructive",
        })
        return
      }
      if (!isLikelyMongoObjectId(cid)) {
        toast({
          title: "Customer required",
          description:
            "Select a saved customer from search to credit change to the prepaid wallet. Reduce cash to the bill total or adjust payment.",
          variant: "destructive",
        })
        return
      }
      if (paymentDialogWalletsUncombined.length > 0) {
        const widPick = pickWalletIdForChangeCredit(paymentDialogWalletsUncombined, paySelectedWalletId)
        if (!widPick) {
          toast({
            title: "Wallet error",
            description: "Could not pick a wallet for the credit. Refresh and try again.",
            variant: "destructive",
          })
          return
        }
      }
      setShowCreditChangeConfirm(true)
      return
    }

    const preferred = deriveCheckoutPreferredPaymentMethod({
      cash,
      card,
      online,
      wallet,
      loyaltyPoints: pts,
    })
    const tenderSplit: ServiceCheckoutTenderSplit = {
      cashAmount: cash,
      cardAmount: card,
      onlineAmount: online,
      walletPayAmount: wallet,
      loyaltyPointsInput: pts,
      selectedWalletId: String(paySelectedWalletId || "").trim(),
    }

    setNavigating(true)
    try {
      if (persistedDraftRef.current) {
        clearServiceCheckoutDraftByRef(persistedDraftRef.current)
        persistedDraftRef.current = null
      }
      setHasPersistedDraft(false)
      dispatchServiceCheckoutDraftChanged()

      let ensuredBooking: EnsureAppointmentBookingResult | null = null
      if (
        !isEditMode &&
        lines.length > 0 &&
        typeof ensureAppointmentBookingBeforeCheckout === "function"
      ) {
        // Only book the services that were on the cart when the checkout
        // dialog opened. Services added inside the dialog should flow into the
        // Sale only (annotated `lineSource: walk_in` server-side), not become
        // Appointment documents — keeps post-checkout adds out of calendar
        // bookings and the dashboard "Appointment Value" metric.
        const bookedSnapshotIds = new Set(
          (snapshotRef.current || []).map((l) => l.id)
        )
        const bookedLines = lines.filter((l) => bookedSnapshotIds.has(l.id))
        if (bookedLines.length > 0) {
          const linkResult = await ensureAppointmentBookingBeforeCheckout({
            lines: bookedLines,
            customer: customer!,
            appointmentDate,
            appointmentTime,
            notes,
          })
          if (!linkResult) {
            setNavigating(false)
            return
          }
          ensuredBooking = linkResult
        }
      }

      const saleData: Record<string, unknown> = {
        clientId: customer!._id || customer!.id,
        clientName: customer!.name,
        clientPhone: customer!.phone || "",
        clientEmail: customer!.email || "",
        date: appointmentDate ? format(appointmentDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        time: appointmentTime || "",
        /** Quick Sale opens in payment-only mode; cart/discounts/tips are final from checkout. */
        appointmentPricingFinalized: true,
        checkoutPreferredPaymentMethod: preferred,
        notes: [notes?.trim(), checkoutSaleNote.trim()].filter(Boolean).join("\n\n") || "",
        services: lines.map((s) => {
          const sid = String(s.staffId || "")
          const q = serviceLineQuantity(s)
          const staffMember =
            staff.find((st: any) => String(st._id || st.id) === sid) ||
            saleStaffCatalog.find((st: any) => String(st._id || st.id) === sid)
          return {
            serviceId: s.serviceId,
            staffId: s.staffId,
            staffName: staffMember?.name || "",
            name: s.name,
            price: s.price,
            duration: s.duration,
            quantity: q,
            discount: lineDiscountAsPayloadPercent(s.price, q, s.discountValue, s.discountIsPercent),
          }
        }),
        ...(productLines.length > 0
          ? {
              products: productLines.map((p) => {
                const q = Math.max(1, Math.floor(Number(p.quantity) || 1))
                return {
                  productId: p.productId,
                  staffId: p.staffId || "",
                  name: p.name,
                  price: p.price,
                  quantity: q,
                  discount: lineDiscountAsPayloadPercent(p.price, q, p.discountValue, p.discountIsPercent),
                }
              }),
            }
          : {}),
        ...(membershipLines.length > 0
          ? {
              memberships: membershipLines.map((m) => {
                const q = Math.max(1, Math.floor(Number(m.quantity) || 1))
                return {
                  planId: m.planId,
                  staffId: m.staffId || "",
                  planName: m.planName,
                  price: m.price,
                  durationInDays: m.durationInDays,
                  quantity: q,
                  discount: lineDiscountAsPayloadPercent(m.price, q, m.discountValue, m.discountIsPercent),
                }
              }),
            }
          : {}),
        ...(prepaidLines.length > 0
          ? {
              prepaidPlans: prepaidLines.map((pr) => {
                const q = Math.max(1, Math.floor(Number(pr.quantity) || 1))
                return {
                  planId: pr.planId,
                  staffId: pr.staffId || "",
                  planName: pr.planName,
                  creditAmount: pr.creditAmount,
                  validityDays: pr.validityDays,
                  price: pr.price,
                  quantity: q,
                  discount: lineDiscountAsPayloadPercent(pr.price, q, pr.discountValue, pr.discountIsPercent),
                }
              }),
            }
          : {}),
        ...(packageLines.length > 0
          ? {
              packages: packageLines.map((pk) => {
                const q = Math.max(1, Math.floor(Number(pk.quantity) || 1))
                return {
                  packageId: pk.packageId,
                  staffId: pk.staffId || "",
                  packageName: pk.packageName,
                  totalSittings: pk.totalSittings,
                  validityDays: pk.validityDays,
                  price: pk.price,
                  quantity: q,
                  discount: lineDiscountAsPayloadPercent(pk.price, q, pk.discountValue, pk.discountIsPercent),
                }
              }),
            }
          : {}),
        ...(checkoutTipLines.filter((t) => t.staffId && t.amount > 0).length > 0
          ? {
              checkoutTips: checkoutTipLines
                .filter((t) => t.staffId && t.amount > 0)
                .map((t) => ({ staffId: t.staffId, amount: Math.max(0, Number(t.amount) || 0) })),
            }
          : {}),
        ...(checkoutCartDiscountType === "fixed" && cartDiscountApplied > 0
          ? { cartDiscountFixed: cartDiscountApplied }
          : {}),
        ...(checkoutCartDiscountType === "percentage" && checkoutCartDiscountValue > 0
          ? {
              cartDiscountPercent: Math.min(100, Math.max(0, checkoutCartDiscountValue)),
            }
          : {}),
      }
      if (ensuredBooking) {
        saleData.appointmentId = ensuredBooking.appointmentId
        saleData.linkedAppointmentIds = ensuredBooking.linkedAppointmentIds
        if (ensuredBooking.bookingGroupId) {
          saleData.bookingGroupId = ensuredBooking.bookingGroupId
        }
      } else if (isEditMode && appointmentId) {
        saleData.appointmentId = appointmentId
        if (existingGroupAppointmentIds?.length > 0) {
          saleData.linkedAppointmentIds = existingGroupAppointmentIds
        }
        if (existingBookingGroupId) {
          saleData.bookingGroupId = existingBookingGroupId
        }
      }
      setPaymentMethodDialogOpen(false)

      if (!checkoutTaxSettings) {
        toast({
          title: "Settings still loading",
          description: "Wait a moment, then try payment again.",
          variant: "destructive",
        })
        return
      }

      const staffMerged: any[] = (() => {
        const m = new Map<string, any>()
        for (const s of staff || []) {
          const id = String(s._id || s.id)
          if (id) m.set(id, s)
        }
        for (const s of saleStaffCatalog || []) {
          const id = String(s._id || s.id)
          if (id) m.set(id, s)
        }
        return Array.from(m.values())
      })()

      const inlineResult = await completeServiceCheckoutInline({
        saleData,
        paymentMethod: preferred,
        tenderSplit,
        customer: customer!,
        staff: staffMerged,
        catalogServices,
        catalogProducts,
        catalogMembershipPlans,
        catalogPrepaidPlans,
        catalogPackages,
        checkoutTaxSettings,
        checkoutPaymentConfiguration,
        creditBillChangeToWallet: opts?.creditBillChangeToWallet === true,
      })

      if (inlineResult.ok) {
        const remaining = Math.max(0, due - totalPaid)
        toast(
          isPartialPayment
            ? {
                title: "Partial payment recorded",
                description: `${inlineResult.billNo} saved. ₹${formatCheckoutInr(remaining)} balance remains on this bill.`,
              }
            : {
                title: "Bill created",
                description: `${inlineResult.billNo} was saved successfully.`,
              }
        )
        onOpenChange(false)
        onSuccessfulCheckout?.()
        return
      }

      toast({
        title: "Finishing in Quick Sale",
        description: inlineResult.error || "Opening Quick Sale to complete the bill.",
      })
      router.push(`/quick-sale?appointment=${btoa(JSON.stringify(saleData))}`)
      onOpenChange(false)
    } finally {
      setNavigating(false)
    }
  }

  function saveCheckoutDraft() {
    if (!customer) {
      toast({
        title: "Select a client",
        description: "Choose a client before saving a draft.",
        variant: "destructive",
      })
      return
    }
    const clientId = String(customer._id || customer.id || "")
    if (!clientId) return
    const appointmentIdNorm = appointmentId ? String(appointmentId) : null
    const existingRef =
      persistedDraftRef.current ||
      findLatestServiceCheckoutDraftRefForContext(clientId, appointmentIdNorm)
    const draftRef = upsertServiceCheckoutDraft(
      {
        clientId,
        clientName: customer.name?.trim() || undefined,
        appointmentId: appointmentIdNorm,
        bookingSnapshot: cloneLines(snapshotRef.current),
        lines: cloneLines(lines),
        productLines: cloneProductLines(productLines),
        membershipLines: cloneMembershipLines(membershipLines),
        prepaidLines: clonePrepaidLines(prepaidLines),
        packageLines: clonePackageLines(packageLines),
        checkoutTipLines: cloneCheckoutTipLines(checkoutTipLines),
        checkoutCartDiscountType,
        checkoutCartDiscountValue,
        checkoutSaleNote,
        savedAt: new Date().toISOString(),
      },
      existingRef
    )
    removeOtherServiceCheckoutDraftsForContext(clientId, appointmentIdNorm, draftRef)
    persistedDraftRef.current = draftRef
    setHasPersistedDraft(true)
    dispatchServiceCheckoutDraftChanged()
    toast({
      title: "Draft saved",
      description: "Your cart was saved. Tap the pill at the bottom-right of the calendar to resume.",
    })
    onOpenChange(false)
  }

  function applyCancelDraftSale() {
    if (!customer) return
    const clientId = String(customer._id || customer.id || "")
    if (!clientId) return
    if (persistedDraftRef.current) {
      clearServiceCheckoutDraftByRef(persistedDraftRef.current)
      persistedDraftRef.current = null
    }
    dispatchServiceCheckoutDraftChanged()
    setHasPersistedDraft(false)
    setLines(cloneLines(snapshotRef.current))
    setProductLines(cloneProductLines(productSnapshotRef.current))
    setMembershipLines(cloneMembershipLines(membershipSnapshotRef.current))
    setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
    setPackageLines(clonePackageLines(packageSnapshotRef.current))
    clearCheckoutExtras()
    setCancelDraftDialogOpen(false)
    toast({
      title: "Draft canceled",
      description: "Add-on items were removed from the cart. Booked services are unchanged.",
    })
  }

  function applyCancelSale() {
    if (persistedDraftRef.current) {
      clearServiceCheckoutDraftByRef(persistedDraftRef.current)
      persistedDraftRef.current = null
    }
    dispatchServiceCheckoutDraftChanged()
    setHasPersistedDraft(false)
    setLines(cloneLines(snapshotRef.current))
    setProductLines(cloneProductLines(productSnapshotRef.current))
    setMembershipLines(cloneMembershipLines(membershipSnapshotRef.current))
    setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
    setPackageLines(clonePackageLines(packageSnapshotRef.current))
    clearCheckoutExtras()
    setCancelSaleDialogOpen(false)
    onOpenChange(false)
    toast({
      title: "Sale cancelled",
      description: "The checkout was closed and your cart was reset to the booking.",
    })
  }

  const visitBadges = useMemo(() => {
    const tags: { label: string; className: string }[] = []
    const visits = customer?.totalVisits
    if (visits === 0 || visits === 1) {
      tags.push({ label: "First visit", className: "bg-sky-100 text-sky-800 border-sky-200/80" })
    }
    const spent = customer?.totalSpent
    if (typeof spent === "number" && spent >= 15000) {
      tags.push({ label: "High spender", className: "bg-violet-100 text-violet-800 border-violet-200/80" })
    }
    return tags
  }, [customer?.totalSpent, customer?.totalVisits])

  const showClientActionsMenu = Boolean(clientProfileId) || Boolean(onCustomerChange)

  const activeMembershipPlanName = useMemo(
    () => getActiveMembershipPlanName(checkoutMembershipData),
    [checkoutMembershipData]
  )

  const inlineClientPickerOptions = useMemo(() => {
    const catalog = clientStore.getClients()
    const q = changeClientQuery.trim()
    if (q.length < 2) {
      return customerDropdownList(catalog, q)
    }
    const walkIn = findWalkInClient(catalog)
    const base = prependWalkInIfMissing(walkIn, changeClientResults)
    return customerDropdownList(base, q)
  }, [changeClientQuery, changeClientResults, clientDirEpoch])

  const openInlineClientPicker = useCallback(() => {
    setInlineClientPickerOpen(true)
    void clientStore.loadClients().finally(() => bumpClientDir())
    if (!changeClientQuery.trim()) {
      void clientStore.preloadRecent().finally(() => bumpClientDir())
    }
  }, [changeClientQuery])

  const beginChangeClientProfile = useCallback(() => {
    setChangeClientQuery("")
    setChangeClientResults([])
    setIsChangingClientProfile(true)
    setInlineClientPickerOpen(true)
    void clientStore.loadClients().finally(() => bumpClientDir())
    requestAnimationFrame(() => clientSearchInputRef.current?.focus())
  }, [])

  const cancelChangeClientProfile = useCallback(() => {
    setIsChangingClientProfile(false)
    setInlineClientPickerOpen(false)
    setChangeClientQuery("")
    setChangeClientResults([])
  }, [])

  const handleCreateNewClient = useCallback(() => {
    const q = changeClientQuery.trim()
    const isPhone = /^\d+$/.test(q)
    setNewClient({
      firstName: isPhone ? "" : q,
      lastName: "",
      phone: isPhone ? q.slice(0, 10) : "",
      email: "",
    })
    setShowNewClientDialog(true)
    setInlineClientPickerOpen(false)
  }, [changeClientQuery])

  const pickCheckoutClient = useCallback(
    async (c: Client) => {
      if (!onCustomerChange) return
      const nextId = String(c._id || c.id || "")
      const curId = String(customer?._id || customer?.id || "")
      if (nextId && curId && nextId === curId) {
        setIsChangingClientProfile(false)
        setInlineClientPickerOpen(false)
        return
      }
      setChangingClient(true)
      try {
        await onCustomerChange(c)
        setIsChangingClientProfile(false)
        setInlineClientPickerOpen(false)
        setChangeClientQuery("")
        setChangeClientResults([])
      } finally {
        setChangingClient(false)
      }
    },
    [onCustomerChange, customer]
  )

  const handleSaveNewClient = useCallback(async () => {
    if (!newClient.firstName.trim()) {
      toast({
        title: "Missing information",
        description: "Please provide a first name.",
        variant: "destructive",
      })
      return
    }

    const phoneNumber = (newClient.phone || changeClientQuery.trim()).replace(/\D/g, "").slice(0, 10)
    if (!/^\d{10}$/.test(phoneNumber)) {
      toast({
        title: "Invalid phone number",
        description: "Phone number must be exactly 10 digits.",
        variant: "destructive",
      })
      return
    }

    setCreatingClient(true)
    try {
      const name = newClient.lastName.trim()
        ? `${newClient.firstName.trim()} ${newClient.lastName.trim()}`
        : newClient.firstName.trim()
      const success = await clientStore.addClient({
        id: `new-${Date.now()}`,
        name,
        phone: phoneNumber,
        email: newClient.email.trim() || undefined,
        status: "active",
      })

      if (!success) {
        toast({
          title: "Error",
          description: "Failed to create client. Please try again.",
          variant: "destructive",
        })
        return
      }

      bumpClientDir()
      const createdClient = clientStore
        .getClients()
        .find(
          (c) =>
            c.phone === phoneNumber && c._id && !String(c._id).startsWith("new-")
        )

      if (createdClient) {
        await pickCheckoutClient(createdClient)
      }

      setNewClient({ firstName: "", lastName: "", phone: "", email: "" })
      setShowNewClientDialog(false)
      toast({
        title: "Client created",
        description: "New client has been added and selected for checkout.",
      })
    } catch {
      toast({
        title: "Error",
        description: "Failed to create client. Please try again.",
        variant: "destructive",
      })
    } finally {
      setCreatingClient(false)
    }
  }, [newClient, changeClientQuery, toast, pickCheckoutClient])

  const editingServiceLine = editingServiceLineId
    ? lines.find((l) => l.id === editingServiceLineId)
    : undefined

  const serviceLineEditDialog = (
    <Dialog
      open={!!editingServiceLineId}
      onOpenChange={(next) => {
        if (!next) closeServiceEdit()
      }}
    >
      <DialogContent
        className="z-[200] gap-4 sm:max-w-md"
        overlayClassName="z-[190]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {editingServiceLine ? `Edit ${editingServiceLine.name}` : "Edit service"}
          </DialogTitle>
        </DialogHeader>
        {serviceEditDraft && editingServiceLine ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="svc-checkout-price">Price (₹)</Label>
                <Input
                  id="svc-checkout-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={serviceEditDraft.price}
                  onChange={(e) =>
                    setServiceEditDraft((d) =>
                      d ? { ...d, price: Math.max(0, parseFloat(e.target.value) || 0) } : d
                    )
                  }
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <div className="flex h-10 items-center gap-0 rounded-lg border border-border/80 bg-background">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 shrink-0 rounded-none rounded-l-lg px-3 hover:bg-muted/80"
                    onClick={() =>
                      setServiceEditDraft((d) =>
                        d
                          ? {
                              ...d,
                              quantity: Math.max(1, (Math.floor(d.quantity) || 1) - 1),
                            }
                          : d
                      )
                    }
                    disabled={Math.max(1, Math.floor(serviceEditDraft.quantity) || 1) <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">
                    {Math.max(1, Math.floor(serviceEditDraft.quantity) || 1)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 shrink-0 rounded-none rounded-r-lg px-3 hover:bg-muted/80"
                    onClick={() =>
                      setServiceEditDraft((d) =>
                        d
                          ? {
                              ...d,
                              quantity: Math.max(1, Math.floor(d.quantity) || 1) + 1,
                            }
                          : d
                      )
                    }
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Staff</Label>
              {staffOptions.length > 0 ? (
                <Select
                  value={serviceEditDraft.staffId || undefined}
                  onValueChange={(v) =>
                    setServiceEditDraft((d) => (d ? { ...d, staffId: v } : d))
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg text-sm">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    className="z-[260] max-h-[min(24rem,70vh)]"
                  >
                    {staffOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  No staff loaded — refresh the page or add staff in settings.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Discounts</Label>
              <p className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Line discounts can be applied on Quick Sale before taking payment.
              </p>
            </div>
            <div className="flex flex-row flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Item total
                </p>
                <p className="text-lg font-semibold tabular-nums text-foreground">
                  ₹
                  {(
                    serviceEditDraft.price *
                    Math.max(1, Math.floor(serviceEditDraft.quantity) || 1)
                  ).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-full border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={removeServiceFromEditDialog}
                  aria-label="Remove from cart"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-full bg-violet-600 px-6 font-semibold text-white hover:bg-violet-700"
                  onClick={applyServiceEdit}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )

  /** Cart Selects must stack above the checkout drawer shell (z-[100]). */
  const cartSelectContentClass = cn(
    "max-h-[min(24rem,70vh)]",
    variant === "drawer" && "z-[110]"
  )
  const draftDropdownContentClass = cn(variant === "drawer" && "z-[110]")
  /** Select Payment step (inside checkout panel) — poppers must stack above drawer z-[100]. */
  const paymentSheetSelectContentClass = "z-[225]"
  /** Dialogs in checkout extras (tip, etc.) use z-[200]; Radix Select popper copies inner computed z-index onto its wrapper — must exceed dialog. */
  const checkoutModalSelectContentClass = "!z-[9999]"

  const serviceCheckoutPaymentFormFields = (
    <div className="space-y-4 px-5 py-4">

            {paymentDialogShowWallet && paymentDialogWalletsRaw.length > 1 ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Wallet</Label>
                <Select
                  value={paySelectedWalletId || undefined}
                  onValueChange={(v) => {
                    setPaySelectedWalletId(v)
                    setPayWallet(0)
                  }}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent position="popper" className={paymentSheetSelectContentClass}>
                    {paymentDialogWalletsRaw.map((w: any) => (
                      <SelectItem key={String(w._id)} value={String(w._id)}>
                        {(w.planSnapshot && w.planSnapshot.planName) || "Wallet"} — ₹
                        {Number(w.remainingBalance || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}{" "}
                        left
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {paymentDialogShowWallet || paymentDialogShowReward ? (
              <div className="flex flex-row flex-nowrap items-stretch gap-3">
                {paymentDialogShowWallet && paySelectedWalletId ? (
                  <div
                    role="button"
                    tabIndex={paymentWalletRedemptionTileDisabled ? -1 : 0}
                    onClick={() => {
                      if (paymentWalletRedemptionTileDisabled) return
                      const w = paymentSelectedWalletRow
                      if (!w) return
                      setPayWallet(
                        Math.min(
                          Number(w.remainingBalance) || 0,
                          Math.max(0, Math.min(paymentDueAfterLoyalty, paymentEligibleWalletSub))
                        )
                      )
                    }}
                    onKeyDown={(e) => {
                      if (paymentWalletRedemptionTileDisabled) return
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        const w = paymentSelectedWalletRow
                        if (!w) return
                        setPayWallet(
                          Math.min(
                            Number(w.remainingBalance) || 0,
                            Math.max(0, Math.min(paymentDueAfterLoyalty, paymentEligibleWalletSub))
                          )
                        )
                      }
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition-colors",
                      paymentWalletRedemptionTileDisabled
                        ? "cursor-not-allowed border-cyan-200/55 bg-cyan-50/15 opacity-50"
                        : cn(
                            "cursor-pointer",
                            payWallet > 0
                              ? "border-cyan-300/70 bg-cyan-50/35 hover:bg-cyan-50/50"
                              : "border-cyan-200/65 bg-cyan-50/20 hover:bg-cyan-50/35"
                          )
                    )}
                  >
                    <span className="text-sm font-semibold text-cyan-800">Wallet (₹)</span>
                    {paymentDialogWalletBalanceText ? (
                      <span className="text-[11px] text-cyan-900/80">{paymentDialogWalletBalanceText}</span>
                    ) : null}
                    <Input
                      type="number"
                      value={payWallet || ""}
                      onChange={(e) => setPayWallet(Math.max(0, Number(e.target.value) || 0))}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.stopPropagation()}
                      min={0}
                      disabled={paymentWalletRedemptionTileDisabled}
                      className="h-8 w-full rounded-lg border-cyan-200/90 bg-white text-center text-sm font-medium text-slate-900 [appearance:textfield] placeholder:text-slate-400 focus:border-cyan-400/85 focus:ring-cyan-100/80 disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{ textAlign: "center" }}
                      placeholder="0"
                    />
                  </div>
                ) : null}
                {paymentDialogShowReward && paymentDialogRewardSettings ? (
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition-colors",
                      paymentDialogPayCfg.rewardPointRedemption.enabled === false
                        ? "border-rose-200/55 bg-rose-50/15 opacity-50"
                        : payLoyaltyPoints > 0
                          ? "border-rose-300/70 bg-rose-50/35 hover:bg-rose-50/45"
                          : "border-rose-200/65 bg-rose-50/20 hover:bg-rose-50/32"
                    )}
                  >
                    <span className="text-sm font-semibold text-rose-800">Points</span>
                    {paymentDialogLoyaltyBalance >= (paymentDialogRewardSettings.minRedeemPoints || 0) ? (
                      paymentDialogRewardBalanceText ? (
                        <span className="text-[11px] text-rose-900/80">{paymentDialogRewardBalanceText}</span>
                      ) : null
                    ) : (
                      <span className="px-1 text-center text-[11px] leading-snug text-rose-900/80">
                        Need {paymentDialogRewardSettings.minRedeemPoints || 0}+ pts (have{" "}
                        {paymentDialogLoyaltyBalance})
                      </span>
                    )}
                    {paymentDialogLoyaltyBalance >= (paymentDialogRewardSettings.minRedeemPoints || 0) ? (
                      <Input
                        type="number"
                        min={0}
                        step={paymentDialogRewardSettings.redeemPointsStep || 1}
                        value={payLoyaltyPoints || ""}
                        onChange={(e) =>
                          setPayLoyaltyPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                        }
                        onFocus={(e) => e.target.select()}
                        className="h-8 w-full rounded-lg border-rose-200/90 bg-white text-center text-sm font-medium text-slate-900 [appearance:textfield] placeholder:text-slate-400 focus:border-rose-400/85 focus:ring-rose-100/80 disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        style={{ textAlign: "center" }}
                        placeholder="0"
                        title={`Balance ${paymentDialogLoyaltyBalance}, step ${paymentDialogRewardSettings.redeemPointsStep || 1}`}
                        aria-label={`Reward points to redeem. Balance ${paymentDialogLoyaltyBalance}`}
                        disabled={paymentDialogPayCfg.rewardPointRedemption.enabled === false}
                      />
                    ) : null}
                    {!paymentLoyaltyPreview.ok && payLoyaltyPoints > 0 && paymentLoyaltyPreview.error ? (
                      <p className="text-center text-xs text-red-600">{paymentLoyaltyPreview.error}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPayCash(paymentPayableAfterWallet)
                  setPayCard(0)
                  setPayOnline(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setPayCash(paymentPayableAfterWallet)
                    setPayCard(0)
                    setPayOnline(0)
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors cursor-pointer",
                  payCash > 0
                    ? "border-green-400 bg-green-200 hover:bg-green-300"
                    : "border-green-200 bg-green-50/50 hover:bg-green-50"
                )}
              >
                <span className="text-sm font-medium text-green-700">Cash</span>
                <Input
                  type="number"
                  value={payCash || ""}
                  onChange={(e) => setPayCash(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  min={0}
                  className="h-8 w-full rounded-lg border-green-300 text-center text-sm [appearance:textfield] focus:border-green-400 focus:ring-green-200 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ textAlign: "center" }}
                  placeholder="0"
                />
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPayCard(paymentPayableAfterWallet)
                  setPayCash(0)
                  setPayOnline(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setPayCard(paymentPayableAfterWallet)
                    setPayCash(0)
                    setPayOnline(0)
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors cursor-pointer",
                  payCard > 0
                    ? "border-blue-400 bg-blue-200 hover:bg-blue-300"
                    : "border-blue-200 bg-blue-50/50 hover:bg-blue-50"
                )}
              >
                <span className="text-sm font-medium text-blue-700">Card</span>
                <Input
                  type="number"
                  value={payCard || ""}
                  onChange={(e) => setPayCard(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  min={0}
                  className="h-8 w-full rounded-lg border-blue-300 text-center text-sm [appearance:textfield] focus:border-blue-400 focus:ring-blue-200 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ textAlign: "center" }}
                  placeholder="0"
                />
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPayOnline(paymentPayableAfterWallet)
                  setPayCash(0)
                  setPayCard(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setPayOnline(paymentPayableAfterWallet)
                    setPayCash(0)
                    setPayCard(0)
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors cursor-pointer",
                  payOnline > 0
                    ? "border-purple-400 bg-purple-200 hover:bg-purple-300"
                    : "border-purple-200 bg-purple-50/50 hover:bg-purple-50"
                )}
              >
                <span className="text-sm font-medium text-purple-700">Online</span>
                <Input
                  type="number"
                  value={payOnline || ""}
                  onChange={(e) => setPayOnline(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  min={0}
                  className="h-8 w-full rounded-lg border-purple-300 text-center text-sm [appearance:textfield] focus:border-purple-400 focus:ring-purple-200 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ textAlign: "center" }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-emerald-800">Total paid</span>
                <span className="font-bold tabular-nums text-emerald-700">
                  ₹{formatCheckoutInr(paymentTotalTenderEntered)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800/90">
                <span>vs amount due</span>
                <span className="tabular-nums">₹{formatCheckoutInr(paymentDueAfterLoyalty)}</span>
              </div>
              {paymentDueAfterLoyalty > 0.01 ? (
                <p className="mt-1.5 text-xs text-emerald-900/80">
                  {paymentTotalTenderEntered > paymentDueAfterLoyalty + 0.05
                    ? `Over by ₹${formatCheckoutInr(paymentTotalTenderEntered - paymentDueAfterLoyalty)}`
                    : paymentTotalTenderEntered + 0.02 < paymentDueAfterLoyalty
                      ? `Partial payment: ₹${formatCheckoutInr(
                          paymentDueAfterLoyalty - paymentTotalTenderEntered
                        )} will stay due on the bill.`
                      : "Full amount collected for this bill."}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-emerald-900/80">
                  No cash tender needed if reward covers the full amount due.
                </p>
              )}
            </div>
    </div>
  )
  const mainColumns = (
        <div
          className={cn(
            "flex flex-1 min-h-0",
            variant === "drawer" ? "flex-row" : "flex-col md:flex-row"
          )}
        >
          <div
            className={cn(
              "flex-1 min-w-0 flex flex-col bg-muted/20 border-border/70",
              variant === "drawer"
                ? "min-h-0 border-r border-border/60"
                : "border-b md:border-b-0 md:border-r"
            )}
          >
            {!paymentMethodDialogOpen ? (
              <>
            <div className="p-5 pb-4 space-y-4 shrink-0">
              {category === "services" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search services"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 rounded-lg bg-background"
                  />
                </div>
              ) : category === "products" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products (name, category, barcode)"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 rounded-lg bg-background"
                  />
                </div>
              ) : category === "memberships" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search membership plans"
                    value={membershipSearch}
                    onChange={(e) => setMembershipSearch(e.target.value)}
                    className="pl-9 rounded-lg bg-background"
                  />
                </div>
              ) : category === "prepaidPlans" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search prepaid plans"
                    value={prepaidSearch}
                    onChange={(e) => setPrepaidSearch(e.target.value)}
                    className="pl-9 rounded-lg bg-background"
                  />
                </div>
              ) : category === "packages" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search packages"
                    value={packageSearch}
                    onChange={(e) => setPackageSearch(e.target.value)}
                    className="pl-9 rounded-lg bg-background"
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CATEGORY_TILES.map(({ id, label, Icon, comingSoon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCategory(id)}
                    className={cn(
                      "relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition-colors",
                      category === id
                        ? "border-violet-400 bg-violet-50/80 shadow-sm"
                        : comingSoon
                          ? "cursor-default border-border/50 bg-muted/50 text-muted-foreground opacity-60 hover:bg-muted/60"
                          : "border-border/80 bg-background hover:bg-muted/50"
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-1">
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          category === id ? "text-violet-600" : comingSoon ? "text-muted-foreground" : "text-violet-600"
                        )}
                      />
                      {comingSoon ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            category === id
                              ? "bg-slate-200/90 text-slate-600"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          Soon
                        </span>
                      ) : null}
                    </div>
                    <span className="font-medium leading-snug">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-[200px] md:min-h-0">
              <div className="p-5 pt-0 pb-6 space-y-4">
                {category === "services" && (
                  <>
                    {search.trim().length === 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {topTenServices.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No services available yet.
                          </p>
                        ) : (
                          <>
                            {topTenServices.map((svc: any) => {
                              const sid = String(svc._id || svc.id)
                              const price = Number(svc.price) || 0
                              return (
                                <button
                                  key={`top-${sid}`}
                                  type="button"
                                  onClick={() => addCatalogService(svc)}
                                  className={cn(
                                    "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                    "hover:border-violet-300/80 hover:bg-violet-50/40 transition-colors"
                                  )}
                                >
                                  <span
                                    className="w-1 self-stretch rounded-full bg-sky-400 shrink-0"
                                    aria-hidden
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-foreground truncate">{svc.name || "Service"}</div>
                                    <div className="text-sm text-muted-foreground">₹{price}</div>
                                  </div>
                                </button>
                              )
                            })}
                            {pinnedServices.map((svc: any) => {
                              const sid = String(svc._id || svc.id)
                              const price = Number(svc.price) || 0
                              return (
                                <div key={`pinned-${sid}`} className="relative group">
                                  <button
                                    type="button"
                                    onClick={() => addCatalogService(svc)}
                                    className={cn(
                                      "flex w-full gap-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 pr-8 text-left",
                                      "hover:border-violet-300/80 hover:bg-violet-50 transition-colors"
                                    )}
                                  >
                                    <span
                                      className="w-1 self-stretch rounded-full bg-violet-500 shrink-0"
                                      aria-hidden
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-foreground truncate">{svc.name || "Service"}</div>
                                      <div className="text-sm text-muted-foreground">₹{price}</div>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Unpin ${svc.name || "service"}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      removePinnedService(sid)
                                    }}
                                    className={cn(
                                      "absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md",
                                      "text-muted-foreground hover:bg-violet-100 hover:text-foreground transition-colors",
                                      "opacity-0 group-hover:opacity-100 focus:opacity-100"
                                    )}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            })}
                            <button
                              type="button"
                              onClick={() => {
                                setPinPickerSearch("")
                                setPinPickerOpen(true)
                              }}
                              className={cn(
                                "flex gap-3 rounded-xl border border-dashed border-border bg-background/40 p-3 text-left text-muted-foreground",
                                "hover:border-violet-300 hover:bg-violet-50/40 hover:text-foreground transition-colors"
                              )}
                            >
                              <span
                                className="flex h-full w-7 shrink-0 items-center justify-center self-stretch rounded-full bg-violet-100 text-violet-600"
                                aria-hidden
                              >
                                <Plus className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium leading-snug">Add service</div>
                                <div className="text-xs leading-snug">
                                  Pin a service for quick access
                                </div>
                              </div>
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredCatalog.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No services match your search.
                          </p>
                        ) : (
                          filteredCatalog.map((svc: any) => {
                            const sid = String(svc._id || svc.id)
                            const price = Number(svc.price) || 0
                            return (
                              <button
                                key={sid}
                                type="button"
                                onClick={() => addCatalogService(svc)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-violet-300/80 hover:bg-violet-50/40 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-sky-400 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">{svc.name || "Service"}</div>
                                  <div className="text-sm text-muted-foreground">₹{price}</div>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </>
                )}

                {category === "products" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Retail products</h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 underline-offset-2 hover:underline"
                        onClick={() => setProductLines(cloneProductLines(productSnapshotRef.current))}
                      >
                        Clear products
                      </button>
                    </div>
                    {loadingProducts ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading products…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredProducts.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No products match your search.
                          </p>
                        ) : (
                          filteredProducts.map((p: any) => {
                            const pid = String(p._id || p.id)
                            const price = Number(p.price) || 0
                            const stockQty = catalogProductStockUnits(p)
                            const unitsInCart = productLines
                              .filter((l) => String(l.productId) === pid)
                              .reduce((sum, l) => sum + Math.max(1, Math.floor(Number(l.quantity) || 1)), 0)
                            const outOfStock = stockQty <= 0
                            const cartAtStockCap = stockQty > 0 && unitsInCart >= stockQty
                            const cannotAddProduct = outOfStock || cartAtStockCap
                            return (
                              <button
                                key={pid}
                                type="button"
                                disabled={cannotAddProduct}
                                onClick={() => addCatalogProduct(p)}
                                aria-label={
                                  outOfStock
                                    ? `${p.name || "Product"}, out of stock`
                                    : cartAtStockCap
                                      ? `${p.name || "Product"}, all available stock is already in the cart`
                                      : `${p.name || "Product"}, ₹${price}, Stock ${stockQty}`
                                }
                                className={cn(
                                  "flex w-full flex-col gap-2 rounded-xl border border-border/80 p-3 text-left transition-colors",
                                  cannotAddProduct
                                    ? "cursor-not-allowed border-border/50 bg-muted/30 text-muted-foreground opacity-70"
                                    : "bg-background hover:border-amber-300/90 hover:bg-amber-50/50"
                                )}
                              >
                                <CheckoutProductThumb imageUrl={p.imageUrl} />
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <span
                                    className={cn(
                                      "min-w-0 flex-1 font-medium leading-snug line-clamp-2",
                                      cannotAddProduct ? "text-muted-foreground" : "text-foreground"
                                    )}
                                  >
                                    {p.name || "Product"}
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0 text-sm font-semibold tabular-nums",
                                      cannotAddProduct ? "text-muted-foreground" : "text-foreground"
                                    )}
                                  >
                                    ₹{price}
                                  </span>
                                </div>
                                <div
                                  className={cn(
                                    "text-xs tabular-nums",
                                    outOfStock ? "text-destructive font-medium" : "text-muted-foreground"
                                  )}
                                >
                                  Stock: {stockQty}
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </>
                )}

                {category === "memberships" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Membership plans</h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 underline-offset-2 hover:underline"
                        onClick={() =>
                          setMembershipLines(cloneMembershipLines(membershipSnapshotRef.current))
                        }
                      >
                        Clear memberships
                      </button>
                    </div>
                    {loadingMemberships ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading plans…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredMembershipPlans.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No plans match your search.
                          </p>
                        ) : (
                          filteredMembershipPlans.map((plan: any) => {
                            const pid = String(plan._id || plan.id)
                            const price = Number(plan.price) || 0
                            const days = Number(plan.durationInDays) || 0
                            return (
                              <button
                                key={pid}
                                type="button"
                                onClick={() => addCatalogMembershipPlan(plan)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-violet-300/90 hover:bg-violet-50/40 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-violet-500 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">
                                    {plan.planName || "Plan"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    ₹{price}
                                    {days ? ` · ${days} days` : ""}
                                  </div>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </>
                )}

                {category === "prepaidPlans" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Prepaid wallet plans</h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 underline-offset-2 hover:underline"
                        onClick={() =>
                          setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
                        }
                      >
                        Clear prepaid
                      </button>
                    </div>
                    {loadingPrepaidCatalog ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading prepaid plans…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredPrepaidPlans.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No prepaid plans match your search.
                          </p>
                        ) : (
                          filteredPrepaidPlans.map((plan: any) => {
                            const id = String(plan._id || plan.id)
                            const pay = Number(plan.payAmount) || 0
                            const credit = Number(plan.creditAmount) || 0
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => addCatalogPrepaidPlan(plan)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-cyan-400/90 hover:bg-cyan-50/40 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-cyan-500 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">
                                    {plan.name || "Plan"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    Pay ₹{pay}
                                    {credit ? ` · Credit ₹${credit}` : ""}
                                  </div>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </>
                )}

                {category === "packages" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Packages</h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 underline-offset-2 hover:underline"
                        onClick={() =>
                          setPackageLines(clonePackageLines(packageSnapshotRef.current))
                        }
                      >
                        Clear packages
                      </button>
                    </div>
                    {loadingPackages ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading packages…
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredPackages.length === 0 ? (
                          <p className="text-sm text-muted-foreground col-span-full py-6 text-center">
                            No packages match your search.
                          </p>
                        ) : (
                          filteredPackages.map((pkg: any) => {
                            const id = String(pkg._id || pkg.id)
                            const price = Number(pkg.total_price) || 0
                            const sittings = Number(pkg.total_sittings) || 0
                            const days = Number(pkg.validity_days) || 0
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => addCatalogPackage(pkg)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-amber-400/90 hover:bg-amber-50/40 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-amber-500 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">
                                    {pkg.name || "Package"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    ₹{price}
                                    {sittings ? ` · ${sittings} sittings` : ""}
                                    {days ? ` · ${days} days` : ""}
                                  </div>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </>
                )}

                {category === "giftVoucher" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Gift Voucher</h3>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 border border-amber-200/80">
                        Coming soon
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Buying and redeeming gift vouchers from this checkout step is not available yet. We&apos;ll add it here in a future release.
                    </p>
                    <div className="rounded-xl border border-dashed border-amber-200/70 bg-amber-50/50 p-3 text-sm text-amber-950/80">
                      <div className="flex items-start gap-3">
                        <Gift className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                        <span>For now, complete the service sale with Continue to payment and use your existing gift flows on Quick Sale when supported.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {!(variant === "drawer" && onPaymentStepChange) ? (
                  <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-3 sm:px-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={closePaymentStep}
                      disabled={navigating}
                      aria-label="Back to services and products"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </Button>
                    <h2 className="text-base font-semibold tracking-tight">Select Payment</h2>
                  </div>
                ) : null}
                {paymentMethodLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin shrink-0" aria-hidden />
                    Loading payment options…
                  </div>
                ) : (
                  <ScrollArea className="min-h-0 flex-1">{serviceCheckoutPaymentFormFields}</ScrollArea>
                )}
              </div>
            )}
          </div>

          <div
            className={cn(
              "shrink-0 flex flex-col bg-background min-h-0 overflow-hidden",
              variant === "drawer"
                ? "w-[min(100%,400px)] sm:w-[420px] border-l-2 border-violet-200/40 bg-gradient-to-b from-slate-50/90 to-background shadow-[-10px_0_32px_-16px_rgba(0,0,0,0.15)]"
                : "w-full min-h-[280px] md:min-h-0 md:w-[420px]"
            )}
          >
            <div className="p-4 border-b border-border/60 space-y-3 shrink-0">
              {showClientSearchBox ? (
                <div className="relative checkout-client-search-container">
                  <div
                    className="relative flex w-full items-center gap-2 rounded-full border border-violet-200/70 bg-gradient-to-r from-violet-50/80 to-slate-50/60 px-3 py-2 shadow-sm transition-colors focus-within:border-violet-300/80 focus-within:ring-2 focus-within:ring-violet-400/40"
                    onClick={openInlineClientPicker}
                  >
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground pointer-events-none" aria-hidden />
                    <Input
                      ref={clientSearchInputRef}
                      className="h-7 flex-1 border-0 bg-transparent px-0 py-0 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder={
                        isChangingClientProfile
                          ? "Search to change client…"
                          : "Search client by name, phone, or email…"
                      }
                      value={changeClientQuery}
                      onChange={(e) => {
                        setChangeClientQuery(e.target.value)
                        setInlineClientPickerOpen(true)
                      }}
                      onFocus={openInlineClientPicker}
                      disabled={changingClient}
                      autoFocus={!isChangingClientProfile}
                    />
                    {isChangingClientProfile ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-violet-100/80 hover:text-foreground"
                        aria-label="Cancel change client"
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelChangeClientProfile()
                        }}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    ) : (
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground opacity-70 transition-transform",
                          inlineClientPickerOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    )}
                  </div>
                  {inlineClientPickerOpen ? (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1.5 max-h-[220px] overflow-y-auto rounded-2xl border border-violet-200/60 bg-background shadow-lg">
                      {changeClientSearching && changeClientQuery.trim().length >= 2 ? (
                        <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                          Searching…
                        </div>
                      ) : inlineClientPickerOptions.length === 0 ? (
                        changeClientQuery.trim().length >= 2 ? (
                          <button
                            type="button"
                            disabled={changingClient || creatingClient}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors rounded-2xl hover:bg-violet-50/80 disabled:pointer-events-none disabled:opacity-50"
                            onClick={handleCreateNewClient}
                          >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                              <Plus className="h-4 w-4 text-emerald-700" aria-hidden />
                            </span>
                            <span className="min-w-0 font-medium text-foreground">
                              Add client: &quot;{changeClientQuery.trim()}&quot;
                            </span>
                          </button>
                        ) : (
                          <p className="px-3 py-4 text-center text-sm text-muted-foreground">No clients found.</p>
                        )
                      ) : (
                        inlineClientPickerOptions.map((c) => {
                          const id = String(c._id || c.id || "")
                          return (
                            <button
                              key={id || c.name}
                              type="button"
                              disabled={changingClient}
                              className="w-full px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-violet-50/80 disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => void pickCheckoutClient(c)}
                            >
                              <span className="block truncate font-medium text-foreground">{c.name || "Client"}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {formatClientPhoneForDisplay(c)}
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {showClientActionsMenu ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-full border border-violet-200/70 bg-gradient-to-r from-violet-50/80 to-slate-50/60 px-3 py-2 shadow-sm text-left transition-colors hover:border-violet-300/80 hover:from-violet-50 hover:to-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                          aria-label="Client actions"
                        >
                          <Avatar className="h-9 w-9 border border-violet-200/80 shrink-0">
                            <AvatarFallback className="bg-violet-100 text-violet-800 text-sm font-semibold">
                              {clientInitial}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate text-sm leading-tight">
                              {customer?.name || "Walk-in"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate leading-tight">
                              {customer?.email || customer?.phone || "—"}
                            </p>
                          </div>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" aria-hidden />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {clientProfileId ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              setClientDetailsDrawerOpen(true)
                            }}
                          >
                            View client profile
                          </DropdownMenuItem>
                        ) : null}
                        {clientProfileId && onCustomerChange ? <DropdownMenuSeparator /> : null}
                        {onCustomerChange ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              beginChangeClientProfile()
                            }}
                          >
                            Change client profile
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-full border border-violet-200/70 bg-gradient-to-r from-violet-50/80 to-slate-50/60 px-3 py-2 shadow-sm">
                      <Avatar className="h-9 w-9 border border-violet-200/80 shrink-0">
                        <AvatarFallback className="bg-violet-100 text-violet-800 text-sm font-semibold">
                          {clientInitial}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate text-sm leading-tight">
                          {customer?.name || "Walk-in"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate leading-tight">
                          {customer?.email || customer?.phone || "—"}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {visitBadges.map((t) => (
                      <span
                        key={t.label}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium",
                          t.className
                        )}
                      >
                        {t.label}
                      </span>
                    ))}
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px]">
                      <span className="shrink-0 text-muted-foreground">Visits</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {checkoutClientStats?.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
                        ) : (
                          checkoutClientStats?.totalVisits ?? customer?.totalVisits ?? 0
                        )}
                      </span>
                    </span>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px]">
                      <span className="shrink-0 text-muted-foreground">Revenue</span>
                      <span className="min-w-0 truncate font-semibold tabular-nums text-foreground">
                        {checkoutClientStats?.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
                        ) : (
                          formatAmount(checkoutClientStats?.totalRevenue ?? customer?.totalSpent ?? 0)
                        )}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                        (checkoutClientStats?.duesAmount ?? customer?.totalDues ?? 0) > 0
                          ? "border-red-200/80 bg-red-50/80"
                          : "border-slate-200/80 bg-slate-50/80"
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0",
                          (checkoutClientStats?.duesAmount ?? customer?.totalDues ?? 0) > 0
                            ? "text-red-700/90"
                            : "text-muted-foreground"
                        )}
                      >
                        Dues
                      </span>
                      <span
                        className={cn(
                          "min-w-0 truncate font-semibold tabular-nums",
                          (checkoutClientStats?.duesAmount ?? customer?.totalDues ?? 0) > 0
                            ? "text-red-900"
                            : "text-foreground"
                        )}
                      >
                        {checkoutClientStats?.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
                        ) : (
                          formatAmount(checkoutClientStats?.duesAmount ?? customer?.totalDues ?? 0)
                        )}
                      </span>
                    </span>
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-[11px]">
                      <span className="shrink-0 text-muted-foreground">Membership</span>
                      <span className="min-w-0 truncate font-semibold text-foreground">
                        {activeMembershipPlanName === "NA" ? "None" : activeMembershipPlanName}
                      </span>
                      {activeMembershipPlanName !== "NA" ? (
                        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                          {checkoutMembershipData?.subscription?.status === "ACTIVE" &&
                          !checkoutMembershipData?.subscription?.expiryDate
                            ? "· No end date"
                            : checkoutMembershipData?.subscription?.expiryDate
                              ? `· till ${format(new Date(checkoutMembershipData.subscription.expiryDate), "dd MMM yyyy")}`
                              : null}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </>
              )}
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-3 space-y-2">
                {!cartHasAnyItem ? (
                  <p className="text-sm text-muted-foreground text-center py-8 px-2">
                    No items in cart yet.
                  </p>
                ) : null}
                {lines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const isLocked = line.locked === true
                  const qty = serviceLineQuantity(line)
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const staffTriggerId = `cart-service-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md",
                        isLocked &&
                          "border-violet-200/35 bg-gradient-to-br from-violet-50/50 via-background to-muted/20"
                      )}
                    >
                      <span
                        className="w-1 self-stretch shrink-0 rounded-full bg-sky-500/90"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {line.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Service · ₹
                              {unit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} each ·{" "}
                              {formatDurationShort(line.duration)} · {staffName}
                              {qty > 1 ? ` · ×${qty}` : ""}
                            </p>
                          </div>
                          <div className="relative flex min-h-8 min-w-[4.5rem] shrink-0 items-center justify-end gap-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums text-foreground transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:opacity-100 md:group-hover:opacity-0 md:group-hover:invisible",
                                "md:group-focus-within:opacity-0 md:group-focus-within:invisible"
                              )}
                            >
                              ₹{lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </p>
                            <div
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:pointer-events-none md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2",
                                "md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                                "md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                              )}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => openServiceEdit(line.id)}
                                aria-label="Edit service line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeLine(line.id)
                                }}
                                aria-label="Remove line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setServiceLineQuantity(line.id, qty - 1)}
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">
                                {qty}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setServiceLineQuantity(line.id, qty + 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <CheckoutLineDiscountRow
                              discountValue={discVal}
                              discountIsPercent={discIsPct}
                              onDiscountValueChange={(v) =>
                                patchServiceLine(line.id, {
                                  discountValue: v,
                                  membershipAutoDiscount: false,
                                })
                              }
                              onSetPercentMode={() =>
                                patchServiceLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                  membershipAutoDiscount: false,
                                })
                              }
                              onSetFixedMode={() =>
                                patchServiceLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
                                  membershipAutoDiscount: false,
                                })
                              }
                            />
                            {staffOptions.length > 0 ? (
                              <div className="min-w-0 w-full sm:w-[9.5rem] sm:max-w-[9.5rem] sm:flex-1">
                                <Select
                                  value={line.staffId || undefined}
                                  onValueChange={(v) => setServiceLineStaff(line.id, v)}
                                >
                                  <SelectTrigger
                                    id={staffTriggerId}
                                    className="h-8 w-full max-w-none rounded-lg px-2 text-xs"
                                  >
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={cartSelectContentClass}>
                                    {staffOptions.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {productLines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
                  const stockCap = maxProductLineQtyFromStock(line, productLines, catalogProducts)
                  const hasStockCap = stockCap < Number.MAX_SAFE_INTEGER
                  const atStockCap = hasStockCap && qty >= stockCap
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const staffTriggerId = `cart-product-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md"
                      )}
                    >
                      <span
                        className="w-1 self-stretch shrink-0 rounded-full bg-amber-500/90"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">{line.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Product · ₹
                              {unit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} each · {staffName}
                              {qty > 1 ? ` · ×${qty}` : ""}
                            </p>
                          </div>
                          <div className="relative flex min-h-8 min-w-[4.5rem] shrink-0 items-center justify-end gap-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums text-foreground transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:opacity-100 md:group-hover:opacity-0 md:group-hover:invisible",
                                "md:group-focus-within:opacity-0 md:group-focus-within:invisible"
                              )}
                            >
                              ₹{lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </p>
                            <div
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:pointer-events-none md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2",
                                "md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                                "md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                              )}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  document.getElementById(staffTriggerId)?.focus()
                                }}
                                aria-label="Focus staff for this line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeProductLine(line.id)
                                }}
                                aria-label="Remove product"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setProductQuantity(line.id, qty - 1)}
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setProductQuantity(line.id, qty + 1)}
                                disabled={atStockCap}
                                aria-label={atStockCap ? "Maximum stock reached for this product" : "Increase quantity"}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <CheckoutLineDiscountRow
                              discountValue={discVal}
                              discountIsPercent={discIsPct}
                              onDiscountValueChange={(v) =>
                                patchProductLine(line.id, { discountValue: v })
                              }
                              onSetPercentMode={() =>
                                patchProductLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                })
                              }
                              onSetFixedMode={() =>
                                patchProductLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
                                })
                              }
                            />
                            {staffOptions.length > 0 ? (
                              <div className="min-w-0 w-full sm:w-[9.5rem] sm:max-w-[9.5rem] sm:flex-1">
                                <Select
                                  value={line.staffId || undefined}
                                  onValueChange={(v) => setProductLineStaff(line.id, v)}
                                >
                                  <SelectTrigger
                                    id={staffTriggerId}
                                    className="h-8 w-full max-w-none rounded-lg px-2 text-xs"
                                  >
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={cartSelectContentClass}>
                                    {staffOptions.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {membershipLines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const staffTriggerId = `cart-membership-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md"
                      )}
                    >
                      <span className="w-1 self-stretch shrink-0 rounded-full bg-violet-500" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {line.planName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Membership · ₹
                              {unit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} each · {staffName}
                              {qty > 1 ? ` · ×${qty}` : ""}
                            </p>
                          </div>
                          <div className="relative flex min-h-8 min-w-[4.5rem] shrink-0 items-center justify-end gap-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums text-foreground transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:opacity-100 md:group-hover:opacity-0 md:group-hover:invisible",
                                "md:group-focus-within:opacity-0 md:group-focus-within:invisible"
                              )}
                            >
                              ₹{lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </p>
                            <div
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:pointer-events-none md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2",
                                "md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                                "md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                              )}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  document.getElementById(staffTriggerId)?.focus()
                                }}
                                aria-label="Focus staff for this line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeMembershipLine(line.id)
                                }}
                                aria-label="Remove membership"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setMembershipQuantity(line.id, qty - 1)}
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setMembershipQuantity(line.id, qty + 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <CheckoutLineDiscountRow
                              discountValue={discVal}
                              discountIsPercent={discIsPct}
                              onDiscountValueChange={(v) =>
                                patchMembershipLine(line.id, { discountValue: v })
                              }
                              onSetPercentMode={() =>
                                patchMembershipLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                })
                              }
                              onSetFixedMode={() =>
                                patchMembershipLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
                                })
                              }
                            />
                            {staffOptions.length > 0 ? (
                              <div className="min-w-0 w-full sm:w-[9.5rem] sm:max-w-[9.5rem] sm:flex-1">
                                <Select
                                  value={line.staffId || undefined}
                                  onValueChange={(v) => setMembershipLineStaff(line.id, v)}
                                >
                                  <SelectTrigger
                                    id={staffTriggerId}
                                    className="h-8 w-full max-w-none rounded-lg px-2 text-xs"
                                  >
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={cartSelectContentClass}>
                                    {staffOptions.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {prepaidLines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const credit = Number(line.creditAmount) || 0
                  const staffTriggerId = `cart-prepaid-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md"
                      )}
                    >
                      <span className="w-1 self-stretch shrink-0 rounded-full bg-cyan-500" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {line.planName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Prepaid · Pay ₹
                              {unit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} each · Credit ₹
                              {credit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} · {staffName}
                              {qty > 1 ? ` · ×${qty}` : ""}
                            </p>
                          </div>
                          <div className="relative flex min-h-8 min-w-[4.5rem] shrink-0 items-center justify-end gap-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums text-foreground transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:opacity-100 md:group-hover:opacity-0 md:group-hover:invisible",
                                "md:group-focus-within:opacity-0 md:group-focus-within:invisible"
                              )}
                            >
                              ₹{lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </p>
                            <div
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:pointer-events-none md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2",
                                "md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                                "md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                              )}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  document.getElementById(staffTriggerId)?.focus()
                                }}
                                aria-label="Focus staff for this line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removePrepaidLine(line.id)
                                }}
                                aria-label="Remove prepaid plan"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setPrepaidQuantity(line.id, qty - 1)}
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setPrepaidQuantity(line.id, qty + 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <CheckoutLineDiscountRow
                              discountValue={discVal}
                              discountIsPercent={discIsPct}
                              onDiscountValueChange={(v) =>
                                patchPrepaidLine(line.id, { discountValue: v })
                              }
                              onSetPercentMode={() =>
                                patchPrepaidLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                })
                              }
                              onSetFixedMode={() =>
                                patchPrepaidLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
                                })
                              }
                            />
                            {staffOptions.length > 0 ? (
                              <div className="min-w-0 w-full sm:w-[9.5rem] sm:max-w-[9.5rem] sm:flex-1">
                                <Select
                                  value={line.staffId || undefined}
                                  onValueChange={(v) => setPrepaidLineStaff(line.id, v)}
                                >
                                  <SelectTrigger
                                    id={staffTriggerId}
                                    className="h-8 w-full max-w-none rounded-lg px-2 text-xs"
                                  >
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={cartSelectContentClass}>
                                    {staffOptions.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {packageLines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const sittings = Number(line.totalSittings) || 0
                  const staffTriggerId = `cart-package-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md"
                      )}
                    >
                      <span className="w-1 self-stretch shrink-0 rounded-full bg-amber-500" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {line.packageName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Package · ₹
                              {unit.toLocaleString("en-IN", { maximumFractionDigits: 2 })} each
                              {sittings ? ` · ${sittings} sittings` : ""} · {staffName}
                              {qty > 1 ? ` · ×${qty}` : ""}
                            </p>
                          </div>
                          <div className="relative flex min-h-8 min-w-[4.5rem] shrink-0 items-center justify-end gap-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold tabular-nums text-foreground transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:opacity-100 md:group-hover:opacity-0 md:group-hover:invisible",
                                "md:group-focus-within:opacity-0 md:group-focus-within:invisible"
                              )}
                            >
                              ₹{lineTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                            </p>
                            <div
                              className={cn(
                                "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
                                "max-md:opacity-100",
                                "md:pointer-events-none md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2",
                                "md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
                                "md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
                              )}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  document.getElementById(staffTriggerId)?.focus()
                                }}
                                aria-label="Focus staff for this line"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removePackageLine(line.id)
                                }}
                                aria-label="Remove package"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 items-center gap-0.5 rounded-lg border border-border/80 bg-background">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setPackageQuantity(line.id, qty - 1)}
                                disabled={qty <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-md p-0"
                                onClick={() => setPackageQuantity(line.id, qty + 1)}
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <CheckoutLineDiscountRow
                              discountValue={discVal}
                              discountIsPercent={discIsPct}
                              onDiscountValueChange={(v) =>
                                patchPackageLine(line.id, { discountValue: v })
                              }
                              onSetPercentMode={() =>
                                patchPackageLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                })
                              }
                              onSetFixedMode={() =>
                                patchPackageLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
                                })
                              }
                            />
                            {staffOptions.length > 0 ? (
                              <div className="min-w-0 w-full sm:w-[9.5rem] sm:max-w-[9.5rem] sm:flex-1">
                                <Select
                                  value={line.staffId || undefined}
                                  onValueChange={(v) => setPackageLineStaff(line.id, v)}
                                >
                                  <SelectTrigger
                                    id={staffTriggerId}
                                    className="h-8 w-full max-w-none rounded-lg px-2 text-xs"
                                  >
                                    <SelectValue placeholder="Staff" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={cartSelectContentClass}>
                                    {staffOptions.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>

            <div className="space-y-3 shrink-0 bg-muted/10 p-4 pt-2">
              <Collapsible open={cartBreakdownOpen} onOpenChange={setCartBreakdownOpen}>
                <div className="space-y-2">
                  {cartBreakdownOpen ? (
                    <div className="relative flex items-center justify-center pb-2 pt-1">
                      <div
                        className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border/60"
                        aria-hidden
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="relative z-10 h-7 w-7 shrink-0 rounded-full border-border/80 bg-background shadow-sm"
                        aria-expanded={cartBreakdownOpen}
                        aria-label="Hide payment breakdown"
                        onClick={() => setCartBreakdownOpen(false)}
                      >
                        <ChevronDown
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-t border-border/60 pt-3" aria-hidden />
                  )}

                  {!cartBreakdownOpen ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span
                          className="text-muted-foreground"
                          title="Sum of line amounts before GST, using catalog line total (price × qty) before line-item discounts."
                        >
                          Total amount (Excl. GST)
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          ₹{formatCheckoutInr(grossPreTaxTotal)}
                        </span>
                      </div>
                      {itemManualDiscountPreTaxRupees > 0.01 ? (
                        <div className="flex items-center justify-between text-sm">
                          <span
                            className="text-muted-foreground"
                            title="Pre-tax value of discounts applied on individual items (excludes membership plan savings)."
                          >
                            Discount
                          </span>
                          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                            −₹{formatCheckoutInr(itemManualDiscountPreTaxRupees)}
                          </span>
                        </div>
                      ) : null}
                      {membershipDiscountPreTaxRupees > 0.01 ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Membership Discount</span>
                          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                            −₹{formatCheckoutInr(membershipDiscountPreTaxRupees)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-sm">
                        <span
                          className="text-muted-foreground"
                          title="Inclusive of GST. Before cart discount only."
                        >
                          {cartDiscountApplied > 0 ? "Due (incl. GST, before cart)" : "Total (incl. GST)"}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          ₹{formatCheckoutInr(cartToPay)}
                        </span>
                      </div>
                      {cartDiscountApplied > 0 ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Cart Discount</span>
                          <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                            −₹{formatCheckoutInr(cartDiscountApplied)}
                          </span>
                        </div>
                      ) : null}
                      {paymentMethodDialogOpen ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Amount Received</span>
                          <span className="tabular-nums text-muted-foreground">
                            ₹{formatCheckoutInr(paymentTotalTenderEntered)}
                          </span>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-md text-left text-base font-bold text-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={false}
                        aria-label="Show payment breakdown"
                        onClick={() => setCartBreakdownOpen(true)}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          To pay
                          <ChevronRight
                            className="h-4 w-4 shrink-0 font-normal text-muted-foreground"
                            aria-hidden
                          />
                        </span>
                        <span className="tabular-nums">
                          ₹
                          {formatCheckoutInr(
                            paymentMethodDialogOpen ? paymentRemainingDue : cartToPayIncludingTips
                          )}
                        </span>
                      </button>
                    </>
                  ) : null}

                  <CollapsibleContent
                    className={cn("space-y-2", "data-[state=closed]:animate-none")}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className="text-muted-foreground"
                        title="Sum of line amounts before GST, using catalog line total (price × qty) before line-item discounts."
                      >
                        Total amount (Excl. GST)
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        ₹{formatCheckoutInr(grossPreTaxTotal)}
                      </span>
                    </div>
                    {itemManualDiscountPreTaxRupees > 0.01 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span
                          className="text-muted-foreground"
                          title="Pre-tax value of discounts applied on individual items (excludes membership plan savings)."
                        >
                          Discount
                        </span>
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                          −₹{formatCheckoutInr(itemManualDiscountPreTaxRupees)}
                        </span>
                      </div>
                    ) : null}
                    {membershipDiscountPreTaxRupees > 0.01 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Membership Discount</span>
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                          −₹{formatCheckoutInr(membershipDiscountPreTaxRupees)}
                        </span>
                      </div>
                    ) : null}
                    {cartDiscountApplied > 0 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Cart Discount
                          {checkoutCartDiscountType === "percentage" && checkoutCartDiscountValue > 0
                            ? ` (${Math.min(100, checkoutCartDiscountValue)}%)`
                            : null}
                        </span>
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                          −₹{formatCheckoutInr(cartDiscountApplied)}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between text-sm">
                      <span
                        className="text-muted-foreground"
                        title="After membership, cart, and line discounts. Excludes GST — see Tax below."
                      >
                        Subtotal
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        ₹{formatCheckoutInr(cartPreTaxBaseAfterCartDiscount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="tabular-nums text-muted-foreground">
                        ₹{formatCheckoutInr(cartTaxAfterCartDiscount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span>Total</span>
                      <span className="tabular-nums">₹{formatCheckoutInr(cartToPayAfterDiscount)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openTipDialog()}
                      className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left text-sm outline-none ring-offset-background transition-colors hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-300/80 dark:hover:bg-violet-950/40"
                      aria-label="Edit tips"
                      title="Edit tips"
                    >
                      <span className="font-medium text-violet-700 dark:text-violet-300">Tips</span>
                      <span className="tabular-nums font-medium text-violet-800 dark:text-violet-200">
                        ₹{formatCheckoutInr(checkoutTipTotal)}
                      </span>
                    </button>
                  </CollapsibleContent>

                  {cartBreakdownOpen ? (
                    <div className="border-t border-border/60 pt-2">
                      {paymentMethodDialogOpen ? (
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Amount Received</span>
                          <span className="tabular-nums text-muted-foreground">
                            ₹{formatCheckoutInr(paymentTotalTenderEntered)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-base font-bold text-foreground">
                        <span>To pay</span>
                        <span className="tabular-nums">
                          ₹
                          {formatCheckoutInr(
                            paymentMethodDialogOpen ? paymentRemainingDue : cartToPayIncludingTips
                          )}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Collapsible>
              <div className="flex items-center gap-2">
                {paymentMethodDialogOpen ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1 min-w-0 rounded-lg font-semibold"
                      onClick={closePaymentStep}
                      disabled={navigating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="h-11 flex-1 min-w-0 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                      disabled={navigating || paymentMethodLoading}
                      onClick={() => void confirmPaymentMethodAndContinue()}
                    >
                      {navigating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" aria-hidden />
                          Saving…
                        </>
                      ) : (
                        paymentRemainingDue <= 0.01 ? "Complete billing" : "Save Part-Paid"
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-full border-border/80"
                      aria-label="Checkout options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className={draftDropdownContentClass}>
                    {checkoutTipTotal < 0.01 ? (
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          openTipDialog()
                        }}
                      >
                        <Coins className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                        Add tip
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        openCartDiscountDialog()
                      }}
                    >
                      <Percent className="mr-2 h-4 w-4 shrink-0" aria-hidden />
                      {hasCheckoutCartDiscount ? "Edit cart discount" : "Add cart discount"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        setSaleNoteDraft(checkoutSaleNote)
                        setSaleNoteDialogOpen(true)
                      }}
                    >
                      Add sale note
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        saveCheckoutDraft()
                      }}
                    >
                      Save draft
                    </DropdownMenuItem>
                    {hasPersistedDraft ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                          e.preventDefault()
                          setCancelDraftDialogOpen(true)
                        }}
                      >
                        Cancel draft
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(e) => {
                        e.preventDefault()
                        setCancelSaleDialogOpen(true)
                      }}
                    >
                      Cancel sale
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  className="flex-1 min-w-0 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-semibold h-11"
                  disabled={
                    navigating ||
                    !customer ||
                    !cartHasAnyItem ||
                    (lines.length > 0 &&
                      (lines.some((l) => l.serviceId && !l.staffId) || lines.some((l) => !l.serviceId))) ||
                    (membershipLines.length > 0 && membershipLines.some((l) => !l.staffId)) ||
                    (prepaidLines.length > 0 && prepaidLines.some((l) => !l.staffId)) ||
                    (packageLines.length > 0 && packageLines.some((l) => !l.staffId)) ||
                    (productLines.length > 0 && productLines.some((l) => !l.staffId))
                  }
                  onClick={() => void continueToPayment()}
                >
                  {navigating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening checkout…
                    </>
                  ) : (
                    "Continue to payment"
                  )}
                </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
  )

  const newClientDialog = (
    <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
      <DialogContent className="z-[200] gap-4 sm:max-w-md" overlayClassName="z-[190]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">Create new client</DialogTitle>
          <DialogDescription>Add a new client to use for this checkout.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="checkout-new-client-first">First name *</Label>
              <Input
                id="checkout-new-client-first"
                value={newClient.firstName}
                onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
                disabled={creatingClient}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-new-client-last">Last name</Label>
              <Input
                id="checkout-new-client-last"
                value={newClient.lastName}
                onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                disabled={creatingClient}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="checkout-new-client-phone">Phone *</Label>
            <Input
              id="checkout-new-client-phone"
              type="tel"
              placeholder="10-digit phone number"
              maxLength={10}
              value={newClient.phone}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 10)
                setNewClient({ ...newClient, phone: value })
              }}
              disabled={creatingClient}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checkout-new-client-email">Email</Label>
            <Input
              id="checkout-new-client-email"
              type="email"
              value={newClient.email}
              onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
              disabled={creatingClient}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowNewClientDialog(false)}
            disabled={creatingClient}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSaveNewClient()} disabled={creatingClient}>
            {creatingClient ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create client"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const cancelDraftConfirmDialog = (
    <AlertDialog open={cancelDraftDialogOpen} onOpenChange={setCancelDraftDialogOpen}>
      <AlertDialogContent className="z-[200]">
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel draft sale?</AlertDialogTitle>
          <AlertDialogDescription>
            Canceling will remove this sale from your saved drafts and clear add-on items from the cart. The
            appointment will be unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={applyCancelDraftSale}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const pinServicePickerDialog = (
    <Dialog
      open={pinPickerOpen}
      onOpenChange={(next) => {
        setPinPickerOpen(next)
        if (!next) setPinPickerSearch("")
      }}
    >
      <DialogContent
        className="z-[200] gap-4 sm:max-w-xl h-[min(85vh,520px)] overflow-hidden flex flex-col"
        overlayClassName="z-[190]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">Add a quick-access service</DialogTitle>
          <DialogDescription>
            Pin frequently-sold services so they appear beside your usual quick picks next time.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col space-y-3">
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="rounded-lg pl-9"
              placeholder="Search services…"
              value={pinPickerSearch}
              onChange={(e) => setPinPickerSearch(e.target.value)}
              autoFocus
            />
          </div>
          <ScrollArea className="flex-1 min-h-0 rounded-lg border border-border/70">
            <div className="py-1 pl-1 pr-4">
              {pinPickerCandidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {pinPickerSearch.trim()
                    ? "No services match your search."
                    : "Start typing to see services."}
                </p>
              ) : (
                pinPickerCandidates.map((svc: any) => {
                  const sid = String(svc._id || svc.id)
                  const price = Number(svc.price) || 0
                  return (
                    <button
                      key={sid}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-md py-2.5 pl-3 pr-3 text-left text-sm transition-colors hover:bg-muted/80"
                      onClick={() => {
                        addPinnedService(sid)
                        setPinPickerOpen(false)
                        setPinPickerSearch("")
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {svc.name || "Service"}
                      </span>
                      {price > 0 ? (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          ₹{price.toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                          No price
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setPinPickerOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const checkoutPartialPaymentConfirmDialog = (
    <Dialog
      open={checkoutPartialPaymentConfirmOpen}
      onOpenChange={(next) => {
        if (navigating) return
        setCheckoutPartialPaymentConfirmOpen(next)
        if (!next) setCheckoutPartialPaymentConfirmAck(false)
      }}
    >
      <DialogContent
        className="z-[240] gap-4 sm:max-w-md"
        overlayClassName="z-[230]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
            Payment confirmation required
          </DialogTitle>
          <DialogDescription>
            Please review the payment details before proceeding with checkout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-3 font-medium text-slate-800">Payment summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span>Bill total</span>
                <span className="font-medium tabular-nums">₹{formatCheckoutInr(paymentDueAfterLoyalty)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Amount paid</span>
                <span className="font-medium tabular-nums text-green-600">
                  ₹{formatCheckoutInr(paymentTotalTenderEntered)}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-2">
                <span className="font-semibold">Remaining</span>
                <span className="font-bold tabular-nums text-red-600">
                  ₹
                  {formatCheckoutInr(
                    Math.max(0, paymentDueAfterLoyalty - paymentTotalTenderEntered)
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0 text-orange-600" aria-hidden />
              <span className="font-medium text-orange-800">Important notice</span>
            </div>
            <p className="text-sm text-orange-700">
              This will create a partially paid bill. Customer owes ₹
              {formatCheckoutInr(Math.max(0, paymentDueAfterLoyalty - paymentTotalTenderEntered))} more.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="svc-checkout-partial-confirm"
              checked={checkoutPartialPaymentConfirmAck}
              onCheckedChange={(v) => setCheckoutPartialPaymentConfirmAck(v === true)}
              className="border-orange-400 data-[state=checked]:border-orange-600 data-[state=checked]:bg-orange-600"
            />
            <Label
              htmlFor="svc-checkout-partial-confirm"
              className="cursor-pointer text-sm font-normal text-orange-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              I confirm this partially paid bill
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCheckoutPartialPaymentConfirmOpen(false)}
            disabled={navigating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!checkoutPartialPaymentConfirmAck || navigating || paymentMethodLoading}
            className="bg-orange-600 text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              if (!checkoutPartialPaymentConfirmAck) {
                toast({
                  title: "Confirmation required",
                  description: "Please confirm the partially paid bill before continuing.",
                  variant: "destructive",
                })
                return
              }
              setCheckoutPartialPaymentConfirmOpen(false)
              setCheckoutPartialPaymentConfirmAck(false)
              void confirmPaymentMethodAndContinue({ skipPartialConfirm: true })
            }}
          >
            Confirm & Collect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const checkoutCreditChangeConfirmDialog = (
    <Dialog
      open={showCreditChangeConfirm}
      onOpenChange={(next) => {
        if (navigating) return
        setShowCreditChangeConfirm(next)
      }}
    >
      <DialogContent
        className="z-[245] gap-4 sm:max-w-md"
        overlayClassName="z-[235]"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-5 w-5 shrink-0 text-cyan-700" aria-hidden />
            Credit change to wallet?
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-muted-foreground">
            The customer paid ₹{formatCheckoutInr(paymentTotalTenderEntered)} in cash and the bill total is ₹
            {formatCheckoutInr(paymentDueAfterLoyalty)}.
            <span className="mt-2 block font-medium text-foreground">
              ₹
              {formatCheckoutInr(Math.max(0, paymentTotalTenderEntered - paymentDueAfterLoyalty))} will be
              added to their prepaid wallet as non-expiring balance — no cash change.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowCreditChangeConfirm(false)}
            disabled={navigating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-cyan-700 text-white hover:bg-cyan-800"
            disabled={navigating}
            onClick={() => {
              setShowCreditChangeConfirm(false)
              void confirmPaymentMethodAndContinue({ creditBillChangeToWallet: true })
            }}
          >
            Confirm & collect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const checkoutExtrasDialogs = (
    <>
      <Dialog open={tipDialogOpen} onOpenChange={setTipDialogOpen}>
        <DialogContent
          className="z-[200] gap-4 w-[calc(100vw-2rem)] sm:max-w-[36rem]"
          overlayClassName="z-[190]"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Add tip</DialogTitle>
            <DialogDescription>
              Choose staff and enter tip amounts. Totals carry through to Quick Sale payment.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,360px)] space-y-3 overflow-y-auto pr-1">
            {staffOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff available for tipping.</p>
            ) : null}
            {tipDraftLines.map((row) => (
              <div key={row.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Staff</Label>
                  <Select
                    value={row.staffId || undefined}
                    onValueChange={(v) =>
                      setTipDraftLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, staffId: v } : r))
                      )
                    }
                    disabled={staffOptions.length === 0}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className={cn(checkoutModalSelectContentClass, "max-h-[min(24rem,70vh)]")}
                      style={{ zIndex: 9999 }}
                    >
                      {staffOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[7.5rem] space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    className="h-9 rounded-lg"
                    value={row.amount > 0 ? row.amount : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Math.max(0, parseFloat(e.target.value) || 0)
                      setTipDraftLines((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, amount: n } : r))
                      )
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                  aria-label="Remove tip row"
                  disabled={tipDraftLines.length <= 1}
                  onClick={() =>
                    setTipDraftLines((prev) =>
                      prev.length <= 1 ? prev : prev.filter((r) => r.id !== row.id)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full rounded-lg"
            disabled={staffOptions.length === 0}
            onClick={() =>
              setTipDraftLines((prev) => [
                ...prev,
                {
                  id: `tip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  staffId: defaultStaffAcrossCart(),
                  amount: 0,
                },
              ])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add staff
          </Button>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTipDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={commitTipDialog}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cartDiscountDialogOpen} onOpenChange={setCartDiscountDialogOpen}>
        <DialogContent
          className="z-[200] gap-4 sm:max-w-sm"
          overlayClassName="z-[190]"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              {hasCheckoutCartDiscount ? "Edit cart discount" : "Add cart discount"}
            </DialogTitle>
            <DialogDescription>
              {hasCheckoutCartDiscount
                ? "Update the fixed amount or percent off the total. Quick Sale will recalculate tax on checkout."
                : "Apply a fixed amount off the total, or a percent off the pre-payment total. Quick Sale will recalculate tax on checkout."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1 rounded-lg border border-border/80 bg-muted/30 p-0.5">
              <Button
                type="button"
                variant={cartDiscountDraftType === "fixed" ? "default" : "ghost"}
                size="sm"
                className="flex-1 rounded-md"
                onClick={() => setCartDiscountDraftType("fixed")}
              >
                Amount
              </Button>
              <Button
                type="button"
                variant={cartDiscountDraftType === "percentage" ? "default" : "ghost"}
                size="sm"
                className="flex-1 rounded-md"
                onClick={() => setCartDiscountDraftType("percentage")}
              >
                Percent
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-cart-discount">
                {cartDiscountDraftType === "fixed" ? "Amount (₹)" : "Percent (%)"}
              </Label>
              <Input
                id="checkout-cart-discount"
                type="number"
                min={0}
                max={cartDiscountDraftType === "percentage" ? 100 : undefined}
                step={cartDiscountDraftType === "percentage" ? 0.1 : 0.01}
                value={cartDiscountDraft}
                onChange={(e) => setCartDiscountDraft(e.target.value)}
                className="rounded-lg"
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCartDiscountDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const raw = Math.max(0, parseFloat(cartDiscountDraft) || 0)
                const toPay = Math.max(0, cartPricing.toPay)
                if (cartDiscountDraftType === "percentage") {
                  const pct = Math.min(100, raw)
                  setCheckoutCartDiscountType("percentage")
                  setCheckoutCartDiscountValue(pct)
                  setCartDiscountDialogOpen(false)
                } else {
                  const capped = Math.min(raw, toPay)
                  setCheckoutCartDiscountType("fixed")
                  setCheckoutCartDiscountValue(capped)
                  setCartDiscountDialogOpen(false)
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saleNoteDialogOpen} onOpenChange={setSaleNoteDialogOpen}>
        <DialogContent
          className="z-[200] gap-4 sm:max-w-md"
          overlayClassName="z-[190]"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Sale note</DialogTitle>
            <DialogDescription>
              Appears with appointment notes on the bill in Quick Sale.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={saleNoteDraft}
            onChange={(e) => setSaleNoteDraft(e.target.value)}
            rows={4}
            className="min-h-[100px] resize-none rounded-lg"
            placeholder="Optional note for this sale…"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSaleNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCheckoutSaleNote(saleNoteDraft.trim())
                setSaleNoteDialogOpen(false)
                toast({
                  title: "Note saved",
                  description: saleNoteDraft.trim()
                    ? "Included when you continue to payment."
                    : "Sale note cleared.",
                })
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelSaleDialogOpen} onOpenChange={setCancelSaleDialogOpen}>
        <AlertDialogContent className="z-[200]">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This closes checkout, resets the cart to the booking, clears tip, cart discount, and sale note, and
              removes any saved draft for this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => applyCancelSale()}
            >
              Cancel sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (variant === "drawer") {
    if (!open) return null
    return (
      <>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
          className={cn(
            "absolute inset-0 z-[100] flex flex-col min-h-0 bg-background",
            "border border-border/60 rounded-lg shadow-lg overflow-hidden"
          )}
        >
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{mainColumns}</div>
        </div>
        {serviceLineEditDialog}
        {newClientDialog}
        {pinServicePickerDialog}
        {cancelDraftConfirmDialog}
        {checkoutPartialPaymentConfirmDialog}
        {checkoutCreditChangeConfirmDialog}
        {checkoutExtrasDialogs}
        <ClientDetailsDrawer
          open={clientDetailsDrawerOpen}
          onOpenChange={setClientDetailsDrawerOpen}
          client={customer}
          stackAboveAncestorChrome
        />
      </>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "max-w-5xl w-[min(96vw,1120px)] p-0 gap-0 overflow-hidden",
            "translate-x-[-50%] translate-y-[-50%] sm:rounded-xl flex flex-col",
            "h-[min(90vh,820px)] max-h-[90vh]"
          )}
          aria-describedby={undefined}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Checkout service</DialogTitle>
            <DialogDescription>Review services and continue to payment.</DialogDescription>
          </DialogHeader>
          {mainColumns}
        </DialogContent>
      </Dialog>
      {serviceLineEditDialog}
      {newClientDialog}
      {pinServicePickerDialog}
      {cancelDraftConfirmDialog}
      {checkoutPartialPaymentConfirmDialog}
      {checkoutCreditChangeConfirmDialog}
      {checkoutExtrasDialogs}
      <ClientDetailsDrawer
        open={clientDetailsDrawerOpen}
        onOpenChange={setClientDetailsDrawerOpen}
        client={customer}
        stackAboveAncestorChrome
      />
    </>
  )
})

ServiceCheckoutDialog.displayName = "ServiceCheckoutDialog"
