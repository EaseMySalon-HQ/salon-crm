"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Plus, Trash2, CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { ProductsAPI, SuppliersAPI, PurchaseOrdersAPI, PurchaseInvoicesAPI, apiErrorMessage } from "@/lib/api"
import {
  hrefPurchaseInvoiceDetail,
  hrefPurchaseInvoiceEdit,
  hrefPurchaseInvoicesList,
} from "@/lib/settings-products-routes"
import {
  purchaseInvoiceGrnPrefillStorageKey,
  PURCHASE_INVOICE_GRN_PREFILL_MAX_MS,
  type PurchaseInvoiceGrnPrefillPayload,
} from "@/lib/purchase-invoice-grn-prefill"
import { istCalendarDateToday, purchaseInvoiceToIstDateInput } from "@/lib/purchase-invoice-calendar-date"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PurchaseInvoiceProductCombobox } from "@/components/purchase-invoices/purchase-invoice-product-combobox"
import { ProductForm } from "@/components/products/product-form"

/** Hides browser increment/decrement controls on number inputs (WebKit + Firefox). */
const NO_NUMBER_SPIN =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

const PURCHASE_INVOICE_PAYMENT_METHODS = ["Cash", "Bank", "UPI", "Card", "Cheque"] as const
type PurchaseInvoicePaymentMethod = (typeof PURCHASE_INVOICE_PAYMENT_METHODS)[number]

function normalizePurchaseInvoicePaymentMethod(raw: string | undefined | null): PurchaseInvoicePaymentMethod {
  const t = String(raw ?? "").trim()
  if ((PURCHASE_INVOICE_PAYMENT_METHODS as readonly string[]).includes(t)) return t as PurchaseInvoicePaymentMethod
  const lower = t.toLowerCase()
  if (lower.includes("upi")) return "UPI"
  if (lower.includes("card")) return "Card"
  if (lower.includes("cheque") || lower.includes("check")) return "Cheque"
  if (lower.includes("bank") || lower.includes("transfer") || lower.includes("neft") || lower.includes("rtgs")) return "Bank"
  if (lower.includes("cash")) return "Cash"
  return "Cash"
}

/** Normalize Product / PO refs from API/Mongo into a comparable 24‑hex string when possible */
function entityIdStr(raw: unknown): string {
  if (raw == null || raw === "") return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw))
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { _id?: unknown; $oid?: string }
    if (typeof o.$oid === "string") return o.$oid.trim()
    if (o._id != null) return entityIdStr(o._id)
    const ts = (raw as { toString?: () => string }).toString?.call(raw)
    if (typeof ts === "string") {
      const t = ts.trim()
      if (/^[a-f0-9]{24}$/i.test(t)) return t
      const m = t.match(/ObjectId\s*\(\s*['"]?([a-f0-9]{24})['"]?\s*\)/i)
      if (m?.[1]) return m[1]
    }
  }
  return ""
}

function productDocIdStr(p: { _id?: unknown; id?: unknown }): string {
  return entityIdStr(p._id ?? p.id)
}

function truncateMiddleLabel(s: string, maxChars: number): string {
  const t = s.trim()
  if (!t) return ""
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars - 1)}…`
}

/** Salon product packing / base unit label for PI line grid */
function productUnitLabel(p: any): string {
  if (!p) return ""
  const volNum = parseFloat(String(p.volume))
  if (!Number.isNaN(volNum) && volNum > 0 && p.volumeUnit)
    return `${volNum}${String(p.volumeUnit)}`
  if (p.baseUnit) return String(p.baseUnit)
  return ""
}

/** Volume / pack units — keep in sync with `ProductForm` unit Select. */
const PURCHASE_INVOICE_UNIT_OPTIONS = [
  { value: "mg", label: "Milligram (mg)" },
  { value: "g", label: "Gram (g)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (l)" },
  { value: "oz", label: "Ounce (oz)" },
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "pkt", label: "Packets (pkt)" },
] as const

const PURCHASE_INVOICE_UNIT_VALUE_SET = new Set(
  PURCHASE_INVOICE_UNIT_OPTIONS.map((o) => o.value),
)

/**
 * Map free-text line unit to a catalog select code (e.g. "ml" from "500ml"),
 * or "" if only a custom label like "box" fits.
 */
function purchaseInvoiceLineUnitSelectCode(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().replace(/\s+/g, "")
  if (!t) return ""
  const lower = t.toLowerCase()
  if (PURCHASE_INVOICE_UNIT_VALUE_SET.has(lower)) return lower
  const m = /^(\d+(?:\.\d+)?)(mg|g|kg|ml|l|oz|pcs|pkt)$/i.exec(t)
  if (m && PURCHASE_INVOICE_UNIT_VALUE_SET.has(m[2].toLowerCase())) return m[2].toLowerCase()
  return ""
}

function purchaseInvoiceUnitSelectValue(raw: string | undefined | null): string {
  const t = (raw ?? "").trim()
  if (!t) return "__none__"
  const code = purchaseInvoiceLineUnitSelectCode(raw)
  if (!code) return "__custom__"
  return code
}

type Line = {
  productId: string
  productName: string
  orderedQty: number | null
  /** Bill / stock qty — left empty when prefilling from a PO until entered manually */
  receivedQty: number | null
  purchasePrice: number
  sellingPrice: number | null
  gstRate: number
  lineDiscount: number
  batchNumber: string
  expiryDate: string
  sku: string
  hsnSacCode: string
  /** Packing / selling unit — prefilled from product (Add Product) when known; editable when missing */
  unit: string
  poItemProductId?: string | null
}

function emptyLine(): Line {
  return {
    productId: "",
    productName: "",
    orderedQty: null,
    receivedQty: null,
    purchasePrice: 0,
    sellingPrice: null,
    gstRate: 18,
    lineDiscount: 0,
    batchNumber: "",
    expiryDate: "",
    sku: "",
    hsnSacCode: "",
    unit: "",
    poItemProductId: null,
  }
}

/** Apply catalog product fields to a line (same rules as choosing a product in the combobox). */
function mergeCatalogProductIntoLine(line: Line, p: any): Line {
  const pid = productDocIdStr(p)
  const next: Line = {
    ...line,
    productId: pid,
    productName: (p.name ?? "").trim() || line.productName,
    sku: p.sku != null ? String(p.sku) : "",
    hsnSacCode: p.hsnSacCode != null ? String(p.hsnSacCode) : "",
    unit: productUnitLabel(p) ?? line.unit ?? "",
  }
  const pin = line.poItemProductId
  if (pin && String(pid).toLowerCase() !== String(pin).toLowerCase()) next.poItemProductId = null
  if (!next.poItemProductId) {
    if (next.purchasePrice === 0 && p.cost != null) next.purchasePrice = p.cost
    else if (next.purchasePrice === 0) next.purchasePrice = p.price || 0
  }
  if (next.sellingPrice == null) next.sellingPrice = p.price ?? null
  return next
}

/**
 * On-hand stock from the loaded product list for the read-only "Old Qty" column.
 * IDs in `quickAddedIds` are products created via this invoice’s quick-add — shown as 0 per product workflow.
 */
function inventoryOldQtyForLine(line: Line, products: any[], quickAddedIds: ReadonlySet<string>): number {
  const pid = line.productId?.trim()
  if (!pid) return 0
  const key = pid.toLowerCase()
  if (quickAddedIds.has(key)) return 0
  const p = products.find((x) => productDocIdStr(x).toLowerCase() === key)
  if (!p) return 0
  const n = Number(p.stock)
  return Number.isFinite(n) ? n : 0
}

type PostFieldHighlight = {
  supplier?: boolean
  supplierInvoice?: boolean
  lineProduct?: Partial<Record<number, boolean>>
  lineReceivedQty?: Partial<Record<number, boolean>>
  linePurchasePrice?: Partial<Record<number, boolean>>
}

function postHighlightHasErrors(h: PostFieldHighlight): boolean {
  if (h.supplier || h.supplierInvoice) return true
  for (const m of [h.lineProduct, h.lineReceivedQty, h.linePurchasePrice]) {
    if (!m) continue
    for (const k of Object.keys(m)) {
      if (m[Number(k)]) return true
    }
  }
  return false
}

function clearLineHighlightKey(
  prev: PostFieldHighlight,
  lineIdx: number,
  key: "lineProduct" | "lineReceivedQty" | "linePurchasePrice",
): PostFieldHighlight {
  const map = prev[key]
  if (!map?.[lineIdx]) return prev
  const copy = { ...map }
  delete copy[lineIdx]
  const empty = Object.keys(copy).length === 0
  return { ...prev, [key]: empty ? undefined : copy }
}

/** Same shape as server `lineProgress` when API omits it. */
function fallbackLineProgressFromPo(po: any) {
  const receivedMap: Record<string, number> = {}
  for (const ri of po.receivedItems || []) {
    const pid = (ri.productId?._id || ri.productId)?.toString()
    if (pid) receivedMap[pid] = parseFloat(String(ri.receivedQty)) || 0
  }
  return (po.items || []).map((item: any) => {
    const pid = (item.productId?._id || item.productId)?.toString()
    const ordered = parseFloat(String(item.quantity)) || 0
    const received = pid ? receivedMap[pid] || 0 : 0
    return {
      productId: item.productId,
      productName: item.productName || "",
      orderedQty: ordered,
      receivedQty: received,
      pendingQty: Math.max(0, ordered - received),
    }
  })
}

export function PurchaseInvoiceEditor({
  invoiceId,
  initialPurchaseOrderId,
  initialSupplierId,
  embeddedInModal = false,
  onDraftCreated,
  onPosted,
  onRequestClose,
  popoverPortalContainer,
}: {
  invoiceId?: string
  /** When set (including `null`), overrides URL `purchaseOrderId` for PO prefill. */
  initialPurchaseOrderId?: string | null
  /** When opening a standalone new invoice, pre-select this supplier (ignored when a PO is linked). */
  initialSupplierId?: string | null
  embeddedInModal?: boolean
  /** When set, product picker popover portals here (e.g. modal `DialogContent`) so nested Radix layers work. */
  popoverPortalContainer?: HTMLElement | null
  onDraftCreated?: (id: string) => void
  onPosted?: () => void
  onRequestClose?: () => void
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [suppliers, setSuppliers] = React.useState<any[]>([])
  const [products, setProducts] = React.useState<any[]>([])
  const [supplierId, setSupplierId] = React.useState("")
  const [purchaseOrderId, setPurchaseOrderId] = React.useState<string | null>(null)
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = React.useState("")
  const [invoiceDate, setInvoiceDate] = React.useState(() => istCalendarDateToday())
  const [paymentMethod, setPaymentMethod] = React.useState<PurchaseInvoicePaymentMethod>("Cash")
  const [notes, setNotes] = React.useState("")
  const [paidAmount, setPaidAmount] = React.useState(0)
  const [lines, setLines] = React.useState<Line[]>([emptyLine()])
  /** Display-only; comes from linked purchase order (`poNumber`). */
  const [linkedPoNumber, setLinkedPoNumber] = React.useState("")
  const [loading, setLoading] = React.useState(!!invoiceId)
  const [saving, setSaving] = React.useState(false)
  const [applyRetail, setApplyRetail] = React.useState(false)
  /** Warn that posted invoices can't be edited; shown before POST. */
  const [confirmPostedImmutableOpen, setConfirmPostedImmutableOpen] = React.useState(false)
  /** Linked PO already received — duplicate stock confirmation from API. */
  const [confirmPostOpen, setConfirmPostOpen] = React.useState(false)
  const [pendingPost, setPendingPost] = React.useState(false)
  /** Quick-add catalog product from a line’s empty search (name prefilled from search). */
  const [quickAddProduct, setQuickAddProduct] = React.useState<{ lineIdx: number; searchQuery: string } | null>(
    null,
  )
  const quickAddProductRef = React.useRef<{ lineIdx: number; searchQuery: string } | null>(null)
  /** Product ids created through “Add to inventory” from this editor — Old Qty displays as 0. */
  const quickAddedCatalogIdsRef = React.useRef<Set<string>>(new Set())
  /** Red borders for fields that block posting (missing / invalid values). */
  const [postFieldHighlight, setPostFieldHighlight] = React.useState<PostFieldHighlight>({})
  /** GRN → PI handoff: survives PO prefill effect re-runs when `products` loads. */
  const grnPrefillRef = React.useRef<{ poId: string; payload: PurchaseInvoiceGrnPrefillPayload } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    SuppliersAPI.getAll({ activeOnly: true })
      .then((r) => {
        if (cancelled) return
        if (r.success && Array.isArray(r.data)) setSuppliers(r.data)
        else
          toast({
            title: "Could not load suppliers",
            description: r.error || "Unknown error.",
            variant: "destructive",
          })
      })
      .catch((e) => {
        if (!cancelled)
          toast({
            title: "Could not load suppliers",
            description: apiErrorMessage(e),
            variant: "destructive",
          })
      })
    ProductsAPI.getAll({ limit: 2000 })
      .then((r) => {
        if (cancelled) return
        if (r.success && Array.isArray(r.data)) setProducts(r.data)
        else
          toast({
            title: "Could not load products",
            description: r.error || "Unknown error.",
            variant: "destructive",
          })
      })
      .catch((e) => {
        if (!cancelled)
          toast({
            title: "Could not load products",
            description: apiErrorMessage(e),
            variant: "destructive",
          })
      })
    return () => {
      cancelled = true
    }
  }, [toast])

  const poFromUrl = searchParams.get("purchaseOrderId")
  const effectivePoId =
    initialPurchaseOrderId !== undefined ? initialPurchaseOrderId || null : poFromUrl

  React.useEffect(() => {
    if (invoiceId || effectivePoId) return
    const sid = initialSupplierId != null && initialSupplierId !== "" ? String(initialSupplierId) : ""
    if (sid) setSupplierId(sid)
  }, [invoiceId, effectivePoId, initialSupplierId])

  React.useEffect(() => {
    if (invoiceId) return
    setPurchaseOrderId(effectivePoId || null)
  }, [invoiceId, effectivePoId])

  React.useEffect(() => {
    if (invoiceId) {
      setLoading(true)
      PurchaseInvoicesAPI.getById(invoiceId)
        .then((r) => {
          if (!r.success || !r.data) {
            toast({
              title: "Could not load invoice",
              description: r.error || "It may have been deleted or you may not have access.",
              variant: "destructive",
            })
            if (embeddedInModal) onRequestClose?.()
            else router.replace(hrefPurchaseInvoicesList())
            return
          }
          const d = r.data
          if (d.status !== "draft") {
            if (embeddedInModal) onRequestClose?.()
            router.replace(hrefPurchaseInvoiceDetail(invoiceId))
            return
          }
          setSupplierId(d.supplierId?._id || d.supplierId || "")
          setPurchaseOrderId(d.purchaseOrderId?._id || d.purchaseOrderId || null)
          setSupplierInvoiceNumber(d.supplierInvoiceNumber || "")
          setInvoiceDate(purchaseInvoiceToIstDateInput(d.invoiceDate))
          setPaymentMethod(normalizePurchaseInvoicePaymentMethod(d.paymentMethod))
          setNotes(d.notes || "")
          setPaidAmount(d.paidAmount || 0)
          setApplyRetail(Boolean(d.applyRetailPrices))
          const pref = d.purchaseOrderId as { poNumber?: string; _id?: string } | string | null | undefined
          if (!pref) {
            setLinkedPoNumber("")
          } else if (typeof pref === "object" && pref.poNumber != null && String(pref.poNumber).trim() !== "") {
            setLinkedPoNumber(String(pref.poNumber).trim())
          } else {
            const oid = typeof pref === "string" ? pref : pref._id?.toString?.()
            if (oid) {
              PurchaseOrdersAPI.getById(oid).then((pr) => {
                if (pr.success && pr.data?.poNumber != null)
                  setLinkedPoNumber(String(pr.data.poNumber).trim())
              })
            } else setLinkedPoNumber("")
          }
          setLines(
            (d.lines || []).map((l: any) => ({
              productId: (l.productId?._id || l.productId)?.toString() || "",
              productName: l.productName || "",
              orderedQty: l.orderedQty,
              receivedQty: l.receivedQty != null ? Number(l.receivedQty) : null,
              purchasePrice: l.purchasePrice ?? 0,
              sellingPrice: l.sellingPrice,
              gstRate: l.gstRate ?? 0,
              lineDiscount: l.lineDiscount ?? 0,
              batchNumber: l.batchNumber || "",
              expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString().slice(0, 10) : "",
              sku: l.sku != null ? String(l.sku) : "",
              hsnSacCode: l.hsnSacCode != null ? String(l.hsnSacCode) : "",
              unit: l.unit != null ? String(l.unit) : "",
              poItemProductId: l.poItemProductId || null,
            }))
          )
        })
        .catch((e) => {
          toast({
            title: "Could not load invoice",
            description: apiErrorMessage(e),
            variant: "destructive",
          })
          if (embeddedInModal) onRequestClose?.()
          else router.replace(hrefPurchaseInvoicesList())
        })
        .finally(() => setLoading(false))
    }
  }, [invoiceId, router, embeddedInModal, onRequestClose, toast])

  React.useEffect(() => {
    if (invoiceId || !effectivePoId) return

    if (grnPrefillRef.current?.poId !== effectivePoId) {
      grnPrefillRef.current = null
      if (typeof window !== "undefined") {
        const key = purchaseInvoiceGrnPrefillStorageKey(effectivePoId)
        const raw = sessionStorage.getItem(key)
        if (raw) {
          try {
            const o = JSON.parse(raw) as PurchaseInvoiceGrnPrefillPayload
            if (
              o?.ts != null &&
              Date.now() - o.ts <= PURCHASE_INVOICE_GRN_PREFILL_MAX_MS &&
              o.byProductId &&
              typeof o.byProductId === "object"
            ) {
              grnPrefillRef.current = { poId: effectivePoId, payload: o }
            }
          } catch {
            /* ignore */
          }
          sessionStorage.removeItem(key)
        }
      }
    }

    const grnStored =
      grnPrefillRef.current?.poId === effectivePoId ? grnPrefillRef.current.payload : null

    PurchaseOrdersAPI.getById(effectivePoId)
      .then((r) => {
        if (!r.success || !r.data) {
          toast({
            title: "Could not load purchase order",
            description: r.error || "Check the link or try reopening from the PO list.",
            variant: "destructive",
          })
          return
        }
        const po = r.data
      setSupplierId((po.supplierId?._id || po.supplierId)?.toString() || "")
      setLinkedPoNumber(po.poNumber != null ? String(po.poNumber).trim() : "")

      if (grnStored?.supplierInvoiceNumber?.trim()) {
        setSupplierInvoiceNumber(String(grnStored.supplierInvoiceNumber).trim())
      }
      if (grnStored?.grnNotes?.trim()) {
        setNotes(String(grnStored.grnNotes).trim())
      }

      let lp =
        Array.isArray(po.lineProgress) && po.lineProgress.length > 0
          ? po.lineProgress
          : fallbackLineProgressFromPo(po)

      lp = lp.filter((row: any) => row && row.orderedQty != null && (parseFloat(String(row.orderedQty)) || 0) >= 1)

      if (lp.length === 0) return

      const productsList = products
      const mapRow = (row: any): Line => {
        const pid = entityIdStr(row.productId)
        const prod =
          productsList.length > 0 ? productsList.find((p) => productDocIdStr(p).toLowerCase() === pid.toLowerCase()) : undefined
        const ordered = parseFloat(String(row.orderedQty)) || 0
        const pidKey = pid.trim()
        const grnDraft = grnStored?.byProductId
        let recvFromGrn: number | null = null
        if (grnDraft && pidKey) {
          const q =
            grnDraft[pidKey] ??
            grnDraft[pidKey.toLowerCase()] ??
            grnDraft[pid.toLowerCase()]
          const n = q != null ? Number(q) : NaN
          if (Number.isFinite(n) && n > 0) recvFromGrn = n
        }
        return {
          productId: pid,
          productName: (row.productName || prod?.name || "").trim() || prod?.name || "",
          orderedQty: ordered,
          receivedQty: recvFromGrn,
          purchasePrice: 0,
          sellingPrice: prod?.price ?? null,
          gstRate: 18,
          lineDiscount: 0,
          batchNumber: "",
          expiryDate: "",
          sku: prod?.sku != null ? String(prod.sku) : "",
          hsnSacCode: prod?.hsnSacCode != null ? String(prod.hsnSacCode) : "",
          unit: productUnitLabel(prod) ?? "",
          poItemProductId: pid || null,
        }
      }

      setLines(lp.map(mapRow))
    })
      .catch((e) => {
        toast({
          title: "Could not load purchase order",
          description: apiErrorMessage(e),
          variant: "destructive",
        })
      })
  }, [invoiceId, effectivePoId, products, toast])

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      if (patch.productId) {
        const p = products.find((x) => productDocIdStr(x).toLowerCase() === String(patch.productId).toLowerCase())
        if (p) next[idx] = mergeCatalogProductIntoLine(next[idx], p)
      }
      return next
    })
  }

  const handleProductCreatedFromQuickAdd = React.useCallback((created: any) => {
    const ctx = quickAddProductRef.current
    quickAddProductRef.current = null
    setQuickAddProduct(null)
    if (!ctx || !created) return
    const idx = ctx.lineIdx
    const createdId = productDocIdStr(created)
    if (createdId) quickAddedCatalogIdsRef.current.add(createdId.toLowerCase())
    setProducts((prev) => {
      const id = productDocIdStr(created)
      if (prev.some((x) => productDocIdStr(x).toLowerCase() === id.toLowerCase())) return prev
      return [...prev, created]
    })
    setLines((prev) => {
      if (idx < 0 || idx >= prev.length) return prev
      const next = [...prev]
      next[idx] = mergeCatalogProductIntoLine(next[idx], created)
      const stockRaw = created?.stock
      if (stockRaw !== undefined && stockRaw !== null && stockRaw !== "") {
        const q = Number(stockRaw)
        if (Number.isFinite(q) && q >= 0) next[idx].receivedQty = q
      }
      return next
    })
    setPostFieldHighlight((p) => {
      let h = clearLineHighlightKey(p, idx, "lineProduct")
      if (created?.stock !== undefined && created?.stock !== null && created?.stock !== "") {
        const q = Number(created.stock)
        if (Number.isFinite(q) && q >= 0) h = clearLineHighlightKey(h, idx, "lineReceivedQty")
      }
      return h
    })
  }, [])

  const totals = React.useMemo(() => {
    let sub = 0
    let gst = 0
    let disc = 0
    for (const l of lines) {
      const qty = l.receivedQty ?? 0
      const price = l.purchasePrice || 0
      const ld = l.lineDiscount || 0
      disc += ld
      const base = Math.max(0, qty * price - ld)
      const g = (base * (l.gstRate || 0)) / 100
      sub += base
      gst += g
    }
    const grand = Math.round((sub + gst) * 100) / 100
    return { subtotal: sub, gstTotal: gst, discountTotal: disc, grandTotal: grand }
  }, [lines])

  const computePostValidation = React.useCallback((): PostFieldHighlight => {
    const highlight: PostFieldHighlight = {}
    if (!supplierId.trim()) highlight.supplier = true
    if (!supplierInvoiceNumber.trim()) highlight.supplierInvoice = true

    const lineProduct: Partial<Record<number, boolean>> = {}
    const lineReceivedQty: Partial<Record<number, boolean>> = {}
    const linePurchasePrice: Partial<Record<number, boolean>> = {}

    let rowWithCatalogProduct = 0
    let anyPositiveReceived = false

    lines.forEach((line, idx) => {
      const pid = line.productId?.trim()
      if (!pid) {
        const orphanedQty = (Number(line.receivedQty) || 0) > 0 || Boolean(line.productName?.trim())
        if (orphanedQty) lineProduct[idx] = true
        return
      }
      rowWithCatalogProduct += 1
      const rq = Number(line.receivedQty) || 0
      if (rq > 0) {
        anyPositiveReceived = true
        if ((Number(line.purchasePrice) || 0) <= 0) linePurchasePrice[idx] = true
      }
    })

    if (rowWithCatalogProduct === 0) {
      lineProduct[0] = true
    } else if (!anyPositiveReceived) {
      lines.forEach((line, idx) => {
        if (line.productId?.trim()) lineReceivedQty[idx] = true
      })
    }

    if (Object.keys(lineProduct).length) highlight.lineProduct = lineProduct
    if (Object.keys(lineReceivedQty).length) highlight.lineReceivedQty = lineReceivedQty
    if (Object.keys(linePurchasePrice).length) highlight.linePurchasePrice = linePurchasePrice
    return highlight
  }, [supplierId, supplierInvoiceNumber, lines])

  const mergeServerErrorHighlight = React.useCallback((message?: string) => {
    if (!message?.trim()) return
    const m = message.toLowerCase()
    setPostFieldHighlight((prev) => {
      const next: PostFieldHighlight = { ...prev }
      if (
        m.includes("supplier invoice") &&
        (m.includes("required") || m.includes("unique") || m.includes("duplicate"))
      ) {
        next.supplierInvoice = true
      }
      if (m.includes("not found") && m.includes("purchase order")) {
        /** Keep generic — PO is read-only in UI */
      }
      const lineBump = lines.map((_, idx) => idx)
      const markAllReceived = () => {
        const lr: Partial<Record<number, boolean>> = { ...next.lineReceivedQty }
        lineBump.forEach((i) => {
          lr[i] = true
        })
        next.lineReceivedQty = lr
      }
      if (m.includes("exceed") && m.includes("purchase order")) {
        markAllReceived()
      }
      if (
        (m.includes("line") || m.includes("item")) &&
        (m.includes("least") || m.includes("add at") || m.includes("required before"))
      ) {
        next.lineProduct = {}
        lines.forEach((_, i) => {
          next.lineProduct![i] = true
        })
      }
      if (m.includes("received quantity") || (m.includes("quantity") && m.includes("greater than zero"))) {
        markAllReceived()
      }
      return next
    })
  }, [lines])

  const buildPayload = () => ({
    supplierId,
    purchaseOrderId: purchaseOrderId || undefined,
    supplierInvoiceNumber,
    invoiceDate,
    paymentMethod,
    notes,
    paidAmount,
    lines: lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        productName: l.productName,
        orderedQty: l.orderedQty,
        receivedQty: l.receivedQty ?? 0,
        purchasePrice: l.purchasePrice,
        sellingPrice: l.sellingPrice,
        gstRate: l.gstRate,
        lineDiscount: l.lineDiscount,
        batchNumber: l.batchNumber,
        sku: l.sku,
        hsnSacCode: l.hsnSacCode,
        unit: l.unit ?? "",
        expiryDate: l.expiryDate || undefined,
        poItemProductId: l.poItemProductId || undefined,
        lineTotal:
          Math.round(
            (Math.max(0, (l.receivedQty ?? 0) * l.purchasePrice - l.lineDiscount) * (1 + (l.gstRate || 0) / 100)) * 100
          ) / 100,
      })),
    subtotal: Math.round(totals.subtotal * 100) / 100,
    gstTotal: Math.round(totals.gstTotal * 100) / 100,
    discountTotal: Math.round(totals.discountTotal * 100) / 100,
    grandTotal: totals.grandTotal,
    applyRetailPrices: applyRetail,
  })

  const saveDraft = async () => {
    if (!supplierId) {
      toast({ title: "Supplier required", variant: "destructive" })
      return
    }
    const payload = buildPayload()
    if (payload.lines.length === 0) {
      toast({
        title: "Add line items",
        description: "Enter at least one product with quantities before saving a draft.",
        variant: "destructive",
      })
      return
    }
    setSaving(true)
    try {
      if (invoiceId) {
        const res = await PurchaseInvoicesAPI.update(invoiceId, payload)
        if (!res.success) {
          mergeServerErrorHighlight(res.error)
          toast({
            title: "Save failed",
            description: (res as { error?: string; message?: string }).message || res.error || "Unknown error",
            variant: "destructive",
          })
          return
        }
        toast({ title: "Draft saved" })
        setPostFieldHighlight({})
      } else {
        const res = await PurchaseInvoicesAPI.create(payload)
        if (!res.success || !res.data?._id) {
          mergeServerErrorHighlight((res as any).error)
          toast({
            title: "Could not create draft",
            description: (res as { error?: string; message?: string }).message || res.error || "Unknown error",
            variant: "destructive",
          })
          return
        }
        toast({ title: "Draft created" })
        setPostFieldHighlight({})
        if (embeddedInModal && onDraftCreated) onDraftCreated(res.data._id)
        else router.replace(hrefPurchaseInvoiceEdit(res.data._id))
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const doPost = async (confirmLinked?: boolean) => {
    if (!invoiceId) {
      toast({ title: "Save draft first", variant: "destructive" })
      return
    }

    const localIssues = computePostValidation()
    if (postHighlightHasErrors(localIssues)) {
      setPostFieldHighlight(localIssues)
      toast({
        title: "Fix highlighted fields",
        description:
          "Enter supplier invoice #, landed cost per line (purchase ₹), and positive quantity on each line. Highlighted fields block posting.",
        variant: "destructive",
      })
      return
    }
    setPostFieldHighlight({})

    setPendingPost(true)
    try {
      const payload = buildPayload()
      const saved = await PurchaseInvoicesAPI.update(invoiceId, payload)
      if (!saved.success) {
        mergeServerErrorHighlight(saved.error)
        toast({
          title: "Could not save invoice",
          description: (saved as { message?: string }).message || saved.error || apiErrorMessage("Save failed"),
          variant: "destructive",
        })
        return
      }

      const res = await PurchaseInvoicesAPI.post(invoiceId, {
        confirmLinkedPoDuplicate: confirmLinked,
        applyRetailPrices: applyRetail,
        paidAmount,
      })
      if (!res.success) {
        const err = (res as { error?: string; message?: string }).error
        if (err === "linked_po_has_receipts") {
          setConfirmPostOpen(true)
          return
        }
        mergeServerErrorHighlight(err || undefined)
        mergeServerErrorHighlight((res as { message?: string }).message)
        toast({
          title: "Post failed",
          description: (res as { message?: string }).message || err || "Unknown error",
          variant: "destructive",
        })
        return
      }
      setPostFieldHighlight({})
      toast({ title: "Invoice posted" })
      if (embeddedInModal && onPosted) onPosted()
      else router.push(hrefPurchaseInvoiceDetail(invoiceId))
    } catch (e: unknown) {
      const msg = apiErrorMessage(e)
      mergeServerErrorHighlight(msg)
      toast({ title: "Post failed", description: msg, variant: "destructive" })
    } finally {
      setPendingPost(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!embeddedInModal && (
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            {invoiceId ? "Edit purchase invoice" : "New purchase invoice"}
          </h1>
          <p className="text-sm text-slate-500">Supplier bill details and line quantities. Stock updates on post only.</p>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200/90 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 min-w-0">
            <Label>Supplier</Label>
            <Select
              value={supplierId}
              onValueChange={(v) => {
                setSupplierId(v)
                setPostFieldHighlight((p) => ({ ...p, supplier: false }))
              }}
              disabled={Boolean(purchaseOrderId)}
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  postFieldHighlight.supplier &&
                    "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive/40 focus-visible:border-destructive",
                )}
                aria-invalid={postFieldHighlight.supplier ? true : undefined}
              >
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-0">
            <Label>Supplier invoice number</Label>
            <Input
              value={supplierInvoiceNumber}
              onChange={(e) => {
                setSupplierInvoiceNumber(e.target.value)
                setPostFieldHighlight((p) => ({ ...p, supplierInvoice: false }))
              }}
              placeholder="Required to post"
              aria-invalid={postFieldHighlight.supplierInvoice ? true : undefined}
              className={cn(
                postFieldHighlight.supplierInvoice &&
                  "border-destructive ring-2 ring-destructive/30 focus-visible:ring-destructive/40 focus-visible:border-destructive",
              )}
            />
          </div>
          <div className="space-y-2 min-w-0">
            <Label>PO number</Label>
            <Input
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={cn(purchaseOrderId ? "bg-muted/60 pointer-events-none" : "bg-muted/40")}
              value={linkedPoNumber}
              placeholder={purchaseOrderId && !linkedPoNumber ? "Loading…" : "—"}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 min-w-0">
            <Label>Invoice date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-2 min-w-0">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PurchaseInvoicePaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PURCHASE_INVOICE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="purchase-invoice-paid-amount">Paid amount</Label>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Paid amount help"
                    >
                      <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs px-3 py-2 text-left leading-snug">
                    After posting, record further supplier payments under Suppliers & orders → Payables (keeps this
                    invoice in sync).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              id="purchase-invoice-paid-amount"
              type="number"
              min={0}
              step="0.01"
              className={cn(NO_NUMBER_SPIN)}
              value={paidAmount}
              onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Line items</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, emptyLine()])}>
            <Plus className="h-4 w-4 mr-1" />
            Add line
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[940px] table-fixed w-full">
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-10 shrink-0 px-1 text-center font-normal">S.No.</TableHead>
                <TableHead className="w-[11rem] min-w-0 max-w-[11rem] shrink-0 px-1.5 text-center font-normal">
                  Product
                </TableHead>
                <TableHead className="w-20 shrink-0 px-1 text-center font-normal">Old Qty</TableHead>
                <TableHead className="w-20 shrink-0 px-1 text-center font-normal">Purchased Qty</TableHead>
                <TableHead className="w-16 max-w-16 shrink-0 px-0.5 text-center font-normal">Unit</TableHead>
                <TableHead className="w-24 shrink-0 px-1 text-center font-normal">MRP</TableHead>
                <TableHead className="w-[4.25rem] shrink-0 px-1 text-center font-normal">Discount</TableHead>
                <TableHead className="w-28 shrink-0 px-1 text-center font-normal">Purchase Price</TableHead>
                <TableHead className="w-16 shrink-0 px-1 text-center font-normal">GST</TableHead>
                <TableHead className="w-28 shrink-0 px-1 text-center font-normal">Expiry</TableHead>
                <TableHead className="w-10 shrink-0 px-1 text-center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => {
                const linePidRaw = line.productId ? String(line.productId).trim() : ""
                const matchedCatalogProduct =
                  linePidRaw &&
                  products.find((p) => productDocIdStr(p).toLowerCase() === linePidRaw.toLowerCase())
                const inCatalog = Boolean(linePidRaw && matchedCatalogProduct)

                const notInListPlaceholder =
                  line.productName && line.productName.trim()
                    ? `${truncateMiddleLabel(line.productName, 22)} · select`
                    : "Select product"

                const productButtonLabel = !linePidRaw
                  ? "Product"
                  : !inCatalog
                    ? notInListPlaceholder
                    : matchedCatalogProduct?.name || line.productName || "Product"

                const productPick = (
                  <PurchaseInvoiceProductCombobox
                    value={linePidRaw}
                    onValueChange={(id) => {
                      updateLine(idx, { productId: id })
                      setPostFieldHighlight((p) => clearLineHighlightKey(p, idx, "lineProduct"))
                    }}
                    products={products}
                    portalContainer={embeddedInModal ? popoverPortalContainer : undefined}
                    buttonLabel={productButtonLabel}
                    onRequestAddProduct={(q) => {
                      const payload = { lineIdx: idx, searchQuery: q }
                      quickAddProductRef.current = payload
                      setQuickAddProduct(payload)
                    }}
                    triggerClassName={cn(
                      postFieldHighlight.lineProduct?.[idx] &&
                        "border-destructive ring-2 ring-destructive/30",
                    )}
                    triggerTitle={
                      !inCatalog && line.productName
                        ? `From purchase order: ${line.productName || "(unknown)"}`
                        : line.productName || undefined
                    }
                  />
                )

                return (
                  <TableRow key={idx}>
                    <TableCell className="w-10 p-1.5 align-top text-muted-foreground tabular-nums text-xs">
                      <div className="flex h-9 items-center justify-center">{idx + 1}</div>
                    </TableCell>
                    <TableCell className="w-[11rem] min-w-0 max-w-[11rem] shrink-0 overflow-hidden p-1.5 align-top">
                      <div className="flex min-h-9 min-w-0 max-h-9 items-center">{productPick}</div>
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        readOnly
                        disabled
                        tabIndex={-1}
                        title="On-hand stock from inventory. Products added via “Add to inventory” on this invoice show 0."
                        className={cn(
                          "h-9 cursor-not-allowed bg-muted/60 px-1 text-right text-xs tabular-nums text-muted-foreground",
                          NO_NUMBER_SPIN,
                        )}
                        value={inventoryOldQtyForLine(line, products, quickAddedCatalogIdsRef.current)}
                      />
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        className={cn(
                          "h-9 text-right px-1",
                          NO_NUMBER_SPIN,
                          postFieldHighlight.lineReceivedQty?.[idx] &&
                            "border-destructive ring-2 ring-destructive/30 focus-visible:border-destructive focus-visible:ring-destructive/40",
                        )}
                        aria-invalid={postFieldHighlight.lineReceivedQty?.[idx] ? true : undefined}
                        value={line.receivedQty ?? ""}
                        onChange={(e) => {
                          updateLine(idx, {
                            receivedQty:
                              e.target.value === "" ? null : parseFloat(e.target.value),
                          })
                          setPostFieldHighlight((p) => clearLineHighlightKey(p, idx, "lineReceivedQty"))
                        }}
                      />
                    </TableCell>
                    <TableCell className="w-16 max-w-16 shrink-0 p-1.5 align-top">
                      <div className="flex flex-col gap-1 min-w-0">
                        <Select
                          value={purchaseInvoiceUnitSelectValue(line.unit)}
                          onValueChange={(v) => {
                            if (v === "__none__") updateLine(idx, { unit: "" })
                            else if (v === "__custom__") updateLine(idx, { unit: "" })
                            else updateLine(idx, { unit: v })
                          }}
                        >
                          <SelectTrigger
                            className="h-9 min-h-9 max-h-9 w-full min-w-0 max-w-full px-1 py-0 text-xs leading-[1.125rem] [&>span]:min-w-0 [&>span]:truncate"
                            title="Unit — same options as Add Product"
                          >
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            className="max-h-[min(280px,70vh)] max-w-[10rem] min-w-[var(--radix-select-trigger-width)]"
                          >
                            <SelectItem value="__none__" className="text-xs">
                              —
                            </SelectItem>
                            {PURCHASE_INVOICE_UNIT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value} className="text-xs">
                                {o.label}
                              </SelectItem>
                            ))}
                            <SelectItem value="__custom__" className="text-xs">
                              Other…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {purchaseInvoiceUnitSelectValue(line.unit) === "__custom__" ? (
                          <Input
                            className="h-8 min-w-0 w-full max-w-full px-1 text-xs"
                            value={line.unit ?? ""}
                            onChange={(e) => updateLine(idx, { unit: e.target.value })}
                            placeholder="Custom unit"
                            title="Use when the unit is not in the list above"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        className={cn("h-9 text-right px-1", NO_NUMBER_SPIN)}
                        value={line.sellingPrice ?? ""}
                        onChange={(e) =>
                          updateLine(idx, {
                            sellingPrice: e.target.value === "" ? null : parseFloat(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        className={cn("h-9 text-right px-1", NO_NUMBER_SPIN)}
                        value={line.lineDiscount ?? 0}
                        onChange={(e) => updateLine(idx, { lineDiscount: parseFloat(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        className={cn(
                          "h-9 text-right px-1",
                          NO_NUMBER_SPIN,
                          postFieldHighlight.linePurchasePrice?.[idx] &&
                            "border-destructive ring-2 ring-destructive/30 focus-visible:border-destructive focus-visible:ring-destructive/40",
                        )}
                        aria-invalid={postFieldHighlight.linePurchasePrice?.[idx] ? true : undefined}
                        value={line.purchasePrice ?? 0}
                        onChange={(e) => {
                          updateLine(idx, { purchasePrice: parseFloat(e.target.value) || 0 })
                          setPostFieldHighlight((p) => clearLineHighlightKey(p, idx, "linePurchasePrice"))
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1.5 align-top">
                      <Input
                        type="number"
                        className={cn("h-9 text-right px-1", NO_NUMBER_SPIN)}
                        value={line.gstRate ?? 0}
                        onChange={(e) =>
                          updateLine(idx, { gstRate: parseFloat(e.target.value) || 0 })
                        }
                      />
                    </TableCell>
                    <TableCell className="w-28 p-1.5 align-top">
                      <Input
                        type="date"
                        className="h-9 w-full min-w-0 px-1 text-xs tabular-nums [color-scheme:light]"
                        value={line.expiryDate ?? ""}
                        onChange={(e) => updateLine(idx, { expiryDate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="w-10 p-1.5 align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        disabled={lines.length <= 1}
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 sm:flex-row sm:items-start sm:justify-between">
        <label className="flex max-w-xl flex-col gap-0.5 text-left text-sm text-slate-700 sm:max-w-md">
          <span className="flex items-center gap-2">
            <Checkbox checked={applyRetail} onCheckedChange={(c) => setApplyRetail(!!c)} />
            <span>Update catalog from lines when posting</span>
          </span>
          <span className="pl-6 text-xs font-normal text-muted-foreground leading-snug">
            When checked: MRP (selling price) from each line is saved to that product in the catalog. Purchase cost
            and stock always update from this invoice when you post, with or without this option.
          </span>
        </label>
        <div className="ml-auto space-y-1 text-right text-sm text-slate-600 sm:ml-0 sm:min-w-[220px]">
          <p>Sub Total ₹{totals.subtotal.toFixed(2)}</p>
          <p>Discount ₹{totals.discountTotal.toFixed(2)}</p>
          <p>GST ₹{totals.gstTotal.toFixed(2)}</p>
          <p className="font-semibold text-slate-900 pt-1">Grand Total ₹{totals.grandTotal.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveDraft} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
        </Button>
        <Button
          variant="default"
          disabled={!invoiceId || pendingPost}
          onClick={() => setConfirmPostedImmutableOpen(true)}
        >
          {pendingPost ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post invoice"}
        </Button>
      </div>

      <Dialog open={confirmPostedImmutableOpen} onOpenChange={setConfirmPostedImmutableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post this invoice?</DialogTitle>
            <DialogDescription>
              Your latest edits are saved to this draft automatically before posting. Fields with a red outline must
              be fixed first if you hit an error. After posting you cannot edit this invoice; record supplier payments from
              Suppliers & orders → Payables.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPostedImmutableOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmPostedImmutableOpen(false)
                void doPost(false)
              }}
            >
              Post invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmPostOpen} onOpenChange={setConfirmPostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm duplicate receipt?</DialogTitle>
            <DialogDescription>
              An older receipt on this PO already increased inventory from a goods receipt. Posting will add stock again unless you already adjusted quantities.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPostOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmPostOpen(false)
                doPost(true)
              }}
            >
              Post anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(quickAddProduct)}
        onOpenChange={(open) => {
          if (!open) {
            quickAddProductRef.current = null
            setQuickAddProduct(null)
          }
        }}
      >
        <DialogContent
          className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Add product to inventory</DialogTitle>
            <DialogDescription>Create a catalog product, then continue this purchase line.</DialogDescription>
          </DialogHeader>
          {quickAddProduct ? (
            <ProductForm
              key={`${quickAddProduct.lineIdx}-${quickAddProduct.searchQuery}`}
              onClose={() => {
                quickAddProductRef.current = null
                setQuickAddProduct(null)
              }}
              createPrefill={{ name: quickAddProduct.searchQuery }}
              onProductCreated={handleProductCreatedFromQuickAdd}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
