import { redirect } from "next/navigation"
import { hrefPurchaseInvoiceEdit } from "@/lib/settings-products-routes"

export default async function EditPurchaseInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(hrefPurchaseInvoiceEdit(id))
}
