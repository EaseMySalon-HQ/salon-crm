import { redirect } from "next/navigation"
import { hrefPurchaseInvoicesList } from "@/lib/settings-products-routes"

export default function PurchaseInvoicesPage() {
  redirect(hrefPurchaseInvoicesList())
}
