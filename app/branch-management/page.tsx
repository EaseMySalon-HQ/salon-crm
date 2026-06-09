"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function BranchManagementIndex() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/branch-management/dashboard")
  }, [router])
  return null
}
