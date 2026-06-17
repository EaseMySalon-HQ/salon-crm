"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { QuickSale } from "@/components/appointments/quick-sale"
import { BillServiceCheckoutEditor } from "@/components/bills/bill-service-checkout-editor"
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

type BillingMode = "create" | "edit" | "exchange"

export default function BillingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const billNo = params.billNo as string
  const mode = (searchParams.get("mode") as BillingMode) || "edit"
  const [initialSale, setInitialSale] = useState<any>(null)
  const [loading, setLoading] = useState(mode === "exchange")

  useEffect(() => {
    const loadSale = async () => {
      if (!billNo || mode !== "exchange") {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await SalesAPI.getByBillNo(billNo)
        if (!response.success || !response.data) {
          toast({
            title: "Bill not found",
            description: "The requested bill could not be found.",
            variant: "destructive",
          })
          router.push("/reports")
          return
        }

        setInitialSale(response.data)
      } catch (error: any) {
        console.error("Error loading bill:", error)
        toast({
          title: "Error",
          description: "Failed to load bill. Please try again.",
          variant: "destructive",
        })
        router.push("/reports")
      } finally {
        setLoading(false)
      }
    }

    void loadSale()
  }, [billNo, mode, router, toast])

  const requiredFeature = mode === "create" ? "create" : "edit"

  if (mode === "edit") {
    return (
      <ProtectedRoute requiredModule="sales" requiredFeature={requiredFeature}>
        <ProtectedLayout requiredModule="sales" requiredFeature={requiredFeature}>
          <BillServiceCheckoutEditor billNo={billNo} />
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requiredModule="sales" requiredFeature={requiredFeature}>
      <ProtectedLayout requiredModule="sales" requiredFeature={requiredFeature}>
        <QuickSale mode={mode} initialSale={initialSale} billLoading={loading} />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
