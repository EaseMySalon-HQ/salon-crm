import { redirect } from "next/navigation"
import { hrefPurchaseInvoiceNew } from "@/lib/settings-products-routes"

export default async function NewPurchaseInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseOrderId?: string }>
}) {
  const sp = await searchParams
  redirect(hrefPurchaseInvoiceNew(sp.purchaseOrderId ?? null))
}
