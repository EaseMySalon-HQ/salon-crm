"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageSkeleton } from "@/components/loading"

/** Legacy /staff URL — Staff Directory now lives under Settings → Team Management. */
export default function StaffDirectoryRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("section", "staff-directory")
    router.replace(`/settings?${params.toString()}`)
  }, [router, searchParams])

  return <PageSkeleton variant="form" />
}
