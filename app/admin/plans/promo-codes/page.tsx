import { redirect } from "next/navigation"

/** Legacy URL — promo codes live under Admin → Business → Promo/Coupons. */
export default function LegacyAdminPlanPromosPage() {
  redirect("/admin/promo-coupons")
}
