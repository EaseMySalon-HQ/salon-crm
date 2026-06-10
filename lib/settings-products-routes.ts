/**
 * Canonical URLs for catalog flows nested under Settings → Products.
 * Purchase invoices live under Suppliers & orders → Purchase Invoices.
 */

export const PRODUCTS_SETTINGS_TABS = ["products", "categories", "suppliers", "transfers"] as const
export type ProductsSettingsTab = (typeof PRODUCTS_SETTINGS_TABS)[number]

export const SUPPLIER_ORDERS_TABS = ["suppliers", "orders", "invoices", "payables"] as const
export type SupplierOrdersSettingsTab = (typeof SUPPLIER_ORDERS_TABS)[number]

export type ProductsSettingsHrefOptions = {
  productsTab: ProductsSettingsTab
  supplierOrdersTab?: SupplierOrdersSettingsTab
  /** `new` or invoice Mongo id */
  pi?: string
  piEdit?: boolean
  purchaseOrderId?: string
}

export function isLikelyMongoId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id)
}

export function hrefSupplierDetail(supplierId: string): string {
  return `/settings/suppliers/${encodeURIComponent(supplierId)}`
}

/** Build `/settings?...` for Products section with optional suppliers sub-routes and purchase invoice deep links. */
export function hrefProductsSettings(opts: ProductsSettingsHrefOptions): string {
  const qs = new URLSearchParams()
  qs.set("section", "products")
  qs.set("productsTab", opts.productsTab)
  if (opts.supplierOrdersTab) qs.set("supplierOrdersTab", opts.supplierOrdersTab)
  if (opts.pi) qs.set("pi", opts.pi)
  if (opts.piEdit) qs.set("piEdit", "1")
  if (opts.purchaseOrderId) qs.set("purchaseOrderId", opts.purchaseOrderId)
  return `/settings?${qs.toString()}`
}

export function hrefPurchaseInvoicesList(): string {
  return hrefProductsSettings({
    productsTab: "suppliers",
    supplierOrdersTab: "invoices",
  })
}

export function hrefPurchaseInvoiceNew(
  purchaseOrderId?: string | null,
  supplierId?: string | null
): string {
  const qs = new URLSearchParams()
  qs.set("section", "products")
  qs.set("productsTab", "suppliers")
  qs.set("supplierOrdersTab", "invoices")
  qs.set("newPurchaseInvoice", "1")
  if (purchaseOrderId) qs.set("purchaseOrderId", purchaseOrderId)
  if (supplierId) qs.set("purchaseInvoiceSupplierId", supplierId)
  return `/settings?${qs.toString()}`
}

export function hrefPurchaseInvoiceDetail(id: string): string {
  return hrefProductsSettings({
    productsTab: "suppliers",
    supplierOrdersTab: "invoices",
    pi: id,
  })
}

export function hrefPurchaseInvoiceEdit(id: string): string {
  return hrefProductsSettings({
    productsTab: "suppliers",
    supplierOrdersTab: "invoices",
    pi: id,
    piEdit: true,
  })
}

export function hrefSuppliersAndOrdersDefault(): string {
  return hrefProductsSettings({
    productsTab: "suppliers",
    supplierOrdersTab: "suppliers",
  })
}

/** Open Suppliers & orders → Payables; optional `payableId` opens the payment modal for that row after load. */
export function hrefSupplierPayables(focusPayableId?: string): string {
  const qs = new URLSearchParams()
  qs.set("section", "products")
  qs.set("productsTab", "suppliers")
  qs.set("supplierOrdersTab", "payables")
  if (focusPayableId) qs.set("payableId", focusPayableId)
  return `/settings?${qs.toString()}`
}
