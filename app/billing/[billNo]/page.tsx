"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { QuickSale } from "@/components/appointments/quick-sale"
import { SalesAPI } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

type BillingMode = "create" | "edit" | "exchange"

export default function BillingPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  
  const billNo = params.billNo as string
  const mode = (searchParams.get("mode") as BillingMode) || "edit"
  const [initialSale, setInitialSale] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSale = async () => {
      if (!billNo) {
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

    if (billNo && (mode === "edit" || mode === "exchange")) {
      loadSale()
    } else {
      setLoading(false)
    }
  }, [billNo, mode, router, toast])

  if (loading) {
    return (
      <ProtectedRoute requiredModule="sales">
        <ProtectedLayout requiredModule="sales">
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-600" />
              <p className="text-gray-600">Loading bill details...</p>
            </div>
          </div>
        </ProtectedLayout>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute requiredModule="sales">
      <ProtectedLayout requiredModule="sales">
        <QuickSale mode={mode} initialSale={initialSale} />
      </ProtectedLayout>
    </ProtectedRoute>
  )
}

