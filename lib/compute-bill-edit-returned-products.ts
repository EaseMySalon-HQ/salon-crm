import type { ServiceCheckoutProductLine } from "@/components/appointments/service-checkout-dialog"

export type BillEditReturnedProduct = {
  productId: string
  name: string
  quantity: number
}

function productLineKey(line: ServiceCheckoutProductLine): string {
  return String(line.productId || line.id || "").trim()
}

function productLineQty(line: ServiceCheckoutProductLine): number {
  return Math.max(0, Math.floor(Number(line.quantity) || 0))
}

export function computeBillEditReturnedProducts(
  initialProductLines: ServiceCheckoutProductLine[],
  currentProductLines: ServiceCheckoutProductLine[]
): BillEditReturnedProduct[] {
  const initialByProduct = new Map<string, { qty: number; name: string }>()
  for (const line of initialProductLines) {
    const key = productLineKey(line)
    if (!key) continue
    const prev = initialByProduct.get(key)
    initialByProduct.set(key, {
      qty: (prev?.qty ?? 0) + productLineQty(line),
      name: line.name || prev?.name || "Product",
    })
  }

  const currentByProduct = new Map<string, number>()
  for (const line of currentProductLines) {
    const key = productLineKey(line)
    if (!key) continue
    currentByProduct.set(key, (currentByProduct.get(key) ?? 0) + productLineQty(line))
  }

  const returned: BillEditReturnedProduct[] = []
  for (const [productId, meta] of initialByProduct) {
    const currentQty = currentByProduct.get(productId) ?? 0
    const delta = meta.qty - currentQty
    if (delta > 0) {
      returned.push({ productId, name: meta.name, quantity: delta })
    }
  }
  return returned
}
