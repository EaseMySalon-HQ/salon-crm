"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { ProductForm } from "@/components/products/product-form"
import { ProtectedLayout } from "@/components/layout/protected-layout"
import { ProtectedRoute } from "@/components/auth/protected-route"

export default function NewProductPage() {
  const router = useRouter()

  const handleClose = () => {
    router.push("/settings?section=products")
  }

  return (
    <ProtectedRoute requiredModule="products">
      <ProtectedLayout>
        <div className="flex flex-col space-y-6">
              <div className="flex items-center gap-4">
                <Button asChild variant="outline" size="icon">
                  <Link href="/settings?section=products">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">New Product</h1>
              </div>
              <ProductForm onClose={handleClose} />
        </div>
      </ProtectedLayout>
    </ProtectedRoute>
  )
}
