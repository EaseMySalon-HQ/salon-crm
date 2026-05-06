"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  CalendarDays,
  CreditCard,
  Gift,
  ShoppingBag,
  Wallet,
  Layers,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  Loader2,
  Pencil,
  Percent,
  Coins,
  MoreVertical,
} from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/client-store"
import { ClientWalletAPI, MembershipAPI, PackagesAPI, ProductsAPI, StaffDirectoryAPI } from "@/lib/api"
import {
  clearServiceCheckoutDraftByRef,
  createServiceCheckoutDraft,
  dispatchServiceCheckoutDraftChanged,
  readServiceCheckoutDraftByRef,
} from "@/lib/service-checkout-draft-storage"

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

export type ServiceCheckoutPackageLine = {
  id: string
  packageId: string
  staffId: string
  packageName: string
  totalSittings: number
  price: number
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

function clonePackageLines(lines: ServiceCheckoutPackageLine[]): ServiceCheckoutPackageLine[] {
  return lines.map((l) => ({ ...l }))
}

function clonePrepaidLines(lines: ServiceCheckoutPrepaidLine[]): ServiceCheckoutPrepaidLine[] {
  return lines.map((l) => ({ ...l }))
}

type ServiceCheckoutCategory =
  | "services"
  | "products"
  | "memberships"
  | "package"
  | "prepaidPlans"
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
  { id: "package", label: "Package", Icon: Layers },
  { id: "prepaidPlans", label: "Prepaid Plans", Icon: Wallet },
  { id: "giftVoucher", label: "Gift Voucher", Icon: Gift, comingSoon: true },
]

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
}

export function ServiceCheckoutDialog({
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
}: ServiceCheckoutDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [lines, setLines] = useState<ServiceCheckoutLine[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<ServiceCheckoutCategory>("services")
  const [navigating, setNavigating] = useState(false)
  const snapshotRef = useRef<ServiceCheckoutLine[]>([])
  const productSnapshotRef = useRef<ServiceCheckoutProductLine[]>([])
  const membershipSnapshotRef = useRef<ServiceCheckoutMembershipLine[]>([])
  const packageSnapshotRef = useRef<ServiceCheckoutPackageLine[]>([])
  const prepaidSnapshotRef = useRef<ServiceCheckoutPrepaidLine[]>([])
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

  const [packageLines, setPackageLines] = useState<ServiceCheckoutPackageLine[]>([])
  const [packageSearch, setPackageSearch] = useState("")
  const [catalogPackages, setCatalogPackages] = useState<any[]>([])
  const [loadingPackages, setLoadingPackages] = useState(false)

  const [prepaidLines, setPrepaidLines] = useState<ServiceCheckoutPrepaidLine[]>([])
  const [prepaidSearch, setPrepaidSearch] = useState("")
  const [catalogPrepaidPlans, setCatalogPrepaidPlans] = useState<any[]>([])
  const [loadingPrepaidCatalog, setLoadingPrepaidCatalog] = useState(false)
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
          packageSnapshotRef.current = []
          prepaidSnapshotRef.current = []
          setLines(cloneLines(draft.lines))
          setProductLines(cloneProductLines(draft.productLines))
          setMembershipLines(cloneMembershipLines(draft.membershipLines))
          setPackageLines(clonePackageLines(draft.packageLines))
          setPrepaidLines(clonePrepaidLines(draft.prepaidLines))
          setSearch("")
          setCategory("services")
          setProductSearch("")
          setMembershipSearch("")
          setPackageSearch("")
          setPrepaidSearch("")
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
      packageSnapshotRef.current = []
      setPackageLines([])
      setPackageSearch("")
      prepaidSnapshotRef.current = []
      setPrepaidLines([])
      setPrepaidSearch("")
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
    setLoadingPackages(true)
    PackagesAPI.getAll({ status: "ACTIVE", limit: 500 })
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

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    return (catalogProducts || []).filter((p: any) => {
      if (!q) return true
      const name = (p.name || "").toLowerCase()
      const categoryName = (p.category || "").toLowerCase()
      return name.includes(q) || categoryName.includes(q)
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

  const filteredPackages = useMemo(() => {
    const q = packageSearch.trim().toLowerCase()
    return (catalogPackages || []).filter((pkg: any) => {
      if (!q) return true
      const name = (pkg.name || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogPackages, packageSearch])

  const filteredPrepaidPlans = useMemo(() => {
    const q = prepaidSearch.trim().toLowerCase()
    return (catalogPrepaidPlans || []).filter((plan: any) => {
      if (!q) return true
      const name = (plan.name || "").toLowerCase()
      return name.includes(q)
    })
  }, [catalogPrepaidPlans, prepaidSearch])

  const subtotal = useMemo(() => {
    const servicesSum = lines.reduce(
      (sum, l) =>
        sum +
        lineNetAfterLineDiscount(
          Number(l.price) || 0,
          serviceLineQuantity(l),
          l.discountValue,
          l.discountIsPercent
        ),
      0
    )
    const productsSum = productLines.reduce(
      (sum, l) =>
        sum +
        lineNetAfterLineDiscount(
          Number(l.price) || 0,
          Math.max(1, Math.floor(Number(l.quantity) || 1)),
          l.discountValue,
          l.discountIsPercent
        ),
      0
    )
    const membershipsSum = membershipLines.reduce(
      (sum, l) =>
        sum +
        lineNetAfterLineDiscount(
          Number(l.price) || 0,
          Math.max(1, Math.floor(Number(l.quantity) || 1)),
          l.discountValue,
          l.discountIsPercent
        ),
      0
    )
    const packagesSum = packageLines.reduce(
      (sum, l) =>
        sum +
        lineNetAfterLineDiscount(
          Number(l.price) || 0,
          Math.max(1, Math.floor(Number(l.quantity) || 1)),
          l.discountValue,
          l.discountIsPercent
        ),
      0
    )
    const prepaidSum = prepaidLines.reduce(
      (sum, l) =>
        sum +
        lineNetAfterLineDiscount(
          Number(l.price) || 0,
          Math.max(1, Math.floor(Number(l.quantity) || 1)),
          l.discountValue,
          l.discountIsPercent
        ),
      0
    )
    return servicesSum + productsSum + membershipsSum + packagesSum + prepaidSum
  }, [lines, productLines, membershipLines, packageLines, prepaidLines])

  const cartHasAnyItem =
    lines.length > 0 ||
    productLines.length > 0 ||
    membershipLines.length > 0 ||
    packageLines.length > 0 ||
    prepaidLines.length > 0

  const clientInitial =
    customer?.name?.trim()?.charAt(0)?.toUpperCase() ||
    customer?.phone?.trim()?.charAt(0) ||
    "?"

  function restoreBookingLines() {
    setLines(cloneLines(snapshotRef.current))
    setProductLines(cloneProductLines(productSnapshotRef.current))
    setMembershipLines(cloneMembershipLines(membershipSnapshotRef.current))
    setPackageLines(clonePackageLines(packageSnapshotRef.current))
    setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
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
      packageLines.find((l) => l.staffId)?.staffId ||
      prepaidLines.find((l) => l.staffId)?.staffId ||
      staffOptions[0]?.id ||
      ""
    )
  }

  function addCatalogService(svc: any) {
    const sid = String(svc._id || svc.id || "")
    if (!sid) return
    const defaultStaffId = defaultStaffAcrossCart()
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
    const q = Math.max(1, Math.floor(quantity) || 1)
    setProductLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: q } : l))
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

  function patchPackageLine(lineId: string, patch: Partial<ServiceCheckoutPackageLine>) {
    setPackageLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  }

  function patchPrepaidLine(lineId: string, patch: Partial<ServiceCheckoutPrepaidLine>) {
    setPrepaidLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
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

  function addCatalogPackage(pkg: any) {
    const packageId = String(pkg._id || pkg.id || "")
    if (!packageId) return
    const defaultStaffId = defaultStaffAcrossCart()
    const price = Number(pkg.total_price) || 0
    setPackageLines((prev) => [
      ...prev,
      {
        id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        packageId,
        staffId: defaultStaffId,
        packageName: pkg.name || "Package",
        totalSittings: Number(pkg.total_sittings) || 0,
        price,
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

  async function continueToPayment() {
    if (!customer) {
      toast({ title: "Select a client", description: "Choose a client before checkout.", variant: "destructive" })
      return
    }
    const hasExtras =
      productLines.length > 0 ||
      membershipLines.length > 0 ||
      packageLines.length > 0 ||
      prepaidLines.length > 0
    if (lines.length === 0 && !hasExtras) {
      toast({
        title: "Cart is empty",
        description: "Add at least one service, product, or other item.",
        variant: "destructive",
      })
      return
    }
    if (lines.length > 0) {
      const missingStaff = lines.some((l) => l.serviceId && !l.staffId)
      if (missingStaff) {
        toast({ title: "Assign staff", description: "Every service needs a staff member.", variant: "destructive" })
        return
      }
      const missingService = lines.some((l) => !l.serviceId)
      if (missingService) {
        toast({ title: "Invalid line", description: "Remove empty service rows.", variant: "destructive" })
        return
      }
    }
    if (membershipLines.length > 0 && membershipLines.some((l) => l.planId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every membership line needs a staff member.",
        variant: "destructive",
      })
      return
    }
    if (packageLines.length > 0 && packageLines.some((l) => l.packageId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every package line needs a staff member.",
        variant: "destructive",
      })
      return
    }
    if (prepaidLines.length > 0 && prepaidLines.some((l) => l.planId && !l.staffId)) {
      toast({
        title: "Assign staff",
        description: "Every prepaid plan line needs a staff member.",
        variant: "destructive",
      })
      return
    }
    setNavigating(true)
    try {
      if (persistedDraftRef.current) {
        clearServiceCheckoutDraftByRef(persistedDraftRef.current)
        persistedDraftRef.current = null
      }
      setHasPersistedDraft(false)
      dispatchServiceCheckoutDraftChanged()
      const saleData: Record<string, unknown> = {
        clientId: customer._id || customer.id,
        clientName: customer.name,
        clientPhone: customer.phone || "",
        clientEmail: customer.email || "",
        date: appointmentDate ? format(appointmentDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        time: appointmentTime || "",
        notes: notes || "",
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
        ...(packageLines.length > 0
          ? {
              packages: packageLines.map((p) => {
                const q = Math.max(1, Math.floor(Number(p.quantity) || 1))
                return {
                  packageId: p.packageId,
                  staffId: p.staffId || "",
                  packageName: p.packageName,
                  totalSittings: p.totalSittings,
                  price: p.price,
                  quantity: q,
                  discount: lineDiscountAsPayloadPercent(p.price, q, p.discountValue, p.discountIsPercent),
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
      }
      if (isEditMode && appointmentId) {
        saleData.appointmentId = appointmentId
        if (existingGroupAppointmentIds?.length > 0) {
          saleData.linkedAppointmentIds = existingGroupAppointmentIds
        }
        if (existingBookingGroupId) {
          saleData.bookingGroupId = existingBookingGroupId
        }
      }
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
    const draftRef = createServiceCheckoutDraft({
      clientId,
      clientName: customer.name?.trim() || undefined,
      appointmentId: appointmentId ? String(appointmentId) : null,
      bookingSnapshot: cloneLines(snapshotRef.current),
      lines: cloneLines(lines),
      productLines: cloneProductLines(productLines),
      membershipLines: cloneMembershipLines(membershipLines),
      packageLines: clonePackageLines(packageLines),
      prepaidLines: clonePrepaidLines(prepaidLines),
      savedAt: new Date().toISOString(),
    })
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
    setPackageLines(clonePackageLines(packageSnapshotRef.current))
    setPrepaidLines(clonePrepaidLines(prepaidSnapshotRef.current))
    setCancelDraftDialogOpen(false)
    toast({
      title: "Draft canceled",
      description: "Add-on items were removed from the cart. Booked services are unchanged.",
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

  const clientProfileId = customer?._id || customer?.id

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
                    placeholder="Search products"
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
              ) : category === "package" ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search packages"
                    value={packageSearch}
                    onChange={(e) => setPackageSearch(e.target.value)}
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
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Quick sale</h3>
                      <button
                        type="button"
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 underline-offset-2 hover:underline"
                        onClick={restoreBookingLines}
                      >
                        Restore booking
                      </button>
                    </div>
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
                            return (
                              <button
                                key={pid}
                                type="button"
                                onClick={() => addCatalogProduct(p)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-amber-300/90 hover:bg-amber-50/50 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-amber-500/90 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">{p.name || "Product"}</div>
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

                {category === "package" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">Service packages</h3>
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
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => addCatalogPackage(pkg)}
                                className={cn(
                                  "flex gap-3 rounded-xl border border-border/80 bg-background p-3 text-left",
                                  "hover:border-emerald-300/90 hover:bg-emerald-50/45 transition-colors"
                                )}
                              >
                                <span
                                  className="w-1 self-stretch rounded-full bg-emerald-500 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium text-foreground truncate">
                                    {pkg.name || "Package"}
                                  </div>
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
          </div>

          <div
            className={cn(
              "shrink-0 flex flex-col bg-background min-h-0 overflow-hidden",
              variant === "drawer"
                ? "w-[min(100%,400px)] sm:w-[420px] border-l-2 border-violet-200/40 bg-gradient-to-b from-slate-50/90 to-background shadow-[-10px_0_32px_-16px_rgba(0,0,0,0.15)]"
                : "w-full min-h-[280px] md:min-h-0 md:w-[420px]"
            )}
          >
            {variant === "drawer" ? (
              <div className="shrink-0 px-3 py-2 border-b border-border/50 bg-white/70">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cart & client
                </p>
              </div>
            ) : null}
            <div className="p-4 border-b border-border/60 space-y-3 shrink-0">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-foreground truncate">{customer?.name || "No client"}</p>
                  <p className="text-xs text-muted-foreground truncate">{customer?.email || customer?.phone || "—"}</p>
                </div>
                <Avatar className="h-11 w-11 border border-violet-200/80 shrink-0">
                  <AvatarFallback className="bg-violet-100 text-violet-800 text-sm font-semibold">
                    {clientInitial}
                  </AvatarFallback>
                </Avatar>
              </div>
              {visitBadges.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {visitBadges.map((t) => (
                    <span
                      key={t.label}
                      className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                        t.className
                      )}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {clientProfileId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between rounded-lg text-xs">
                      Actions
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => router.push(`/clients/${clientProfileId}`)}>
                      View client profile
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
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
                                patchServiceLine(line.id, { discountValue: v })
                              }
                              onSetPercentMode={() =>
                                patchServiceLine(line.id, {
                                  discountIsPercent: true,
                                  discountValue: 0,
                                })
                              }
                              onSetFixedMode={() =>
                                patchServiceLine(line.id, {
                                  discountIsPercent: false,
                                  discountValue: 0,
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
                {packageLines.map((line) => {
                  const staffName =
                    staffOptions.find((s) => s.id === line.staffId)?.name || "Staff"
                  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1))
                  const unit = Number(line.price) || 0
                  const discVal = Number(line.discountValue) || 0
                  const discIsPct = line.discountIsPercent !== false
                  const lineTotal = lineNetAfterLineDiscount(unit, qty, discVal, discIsPct)
                  const staffTriggerId = `cart-package-staff-${line.id}`
                  return (
                    <div
                      key={line.id}
                      className={cn(
                        "group flex gap-2.5 rounded-xl border border-border/70 bg-muted/15 p-3 shadow-sm",
                        "transition-shadow hover:border-border hover:shadow-md"
                      )}
                    >
                      <span className="w-1 self-stretch shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug text-foreground">
                              {line.packageName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Package · ₹
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
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border/60 space-y-3 shrink-0 bg-muted/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold text-foreground">₹{subtotal}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">To pay</span>
                <span className="font-bold text-foreground text-base">₹{subtotal}</span>
              </div>
              <div className="flex items-center gap-2">
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
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        saveCheckoutDraft()
                      }}
                    >
                      Save Draft
                    </DropdownMenuItem>
                    {hasPersistedDraft ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(e) => {
                          e.preventDefault()
                          setCancelDraftDialogOpen(true)
                        }}
                      >
                        Cancel Draft
                      </DropdownMenuItem>
                    ) : null}
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
                    (packageLines.length > 0 && packageLines.some((l) => !l.staffId)) ||
                    (prepaidLines.length > 0 && prepaidLines.some((l) => !l.staffId)) ||
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
              </div>
            </div>
          </div>
        </div>
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
        {cancelDraftConfirmDialog}
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
      {cancelDraftConfirmDialog}
    </>
  )
}
