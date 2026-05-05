import { redirect } from "next/navigation"
import { hrefPurchaseInvoiceDetail } from "@/lib/settings-products-routes"

export default async function PurchaseInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(hrefPurchaseInvoiceDetail(id))
}
