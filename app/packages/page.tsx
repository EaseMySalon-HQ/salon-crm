import { redirect } from "next/navigation"

export default function PackagesRedirectPage() {
  redirect("/settings?section=packages")
}
