"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RotateCcw } from "lucide-react"
import Link from "next/link"

export function RefundPolicyContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <RotateCcw className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Refund Policy</h1>
              <p className="text-gray-600 mt-1">EaseMySalon</p>
              <p className="text-sm text-gray-500">Last Updated: 13-03-2026</p>
            </div>
          </div>
        </div>

        {/* Introduction */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4 text-gray-700">
            <p>
              At EaseMySalon, we strive to provide reliable and high-quality salon management software. This Refund Policy explains the terms under which refunds may or may not be issued.
            </p>
          </CardContent>
        </Card>

        {/* 1. Subscription Fees */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Subscription Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon operates on a subscription-based pricing model. All payments made for subscription plans (monthly, quarterly, or yearly) grant access to the platform and its features for the selected billing period.
            </p>
          </CardContent>
        </Card>

        {/* 2. Non-Refundable Payments */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Non-Refundable Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              All subscription payments are non-refundable, except in cases where:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>A duplicate payment has been made.</li>
              <li>A technical error caused an incorrect charge.</li>
              <li>Payment was processed but the service was not activated.</li>
            </ul>
          </CardContent>
        </Card>

        {/* 3. Refund Eligibility */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Refund Eligibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Refund requests may be considered if:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>The request is made within 7 days of purchase, and</li>
              <li>The platform has not been substantially used, and</li>
              <li>There is a verified billing error.</li>
            </ul>
            <p>
              Refund approval is solely at the discretion of EaseMySalon.
            </p>
          </CardContent>
        </Card>

        {/* 4. Add-ons and Third-Party Charges */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Add-ons and Third-Party Charges</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Charges for add-on services, including but not limited to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>SMS notifications</li>
              <li>WhatsApp messaging</li>
              <li>Payment gateway fees</li>
              <li>Third-party integrations</li>
            </ul>
            <p>
              are non-refundable, as these are billed based on usage.
            </p>
          </CardContent>
        </Card>

        {/* 5. Cancellation of Subscription */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>5. Cancellation of Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Users may cancel their subscription at any time. However:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>The cancellation will take effect at the end of the billing cycle.</li>
              <li>No partial refunds will be issued for unused time.</li>
            </ul>
          </CardContent>
        </Card>

        {/* 6. Refund Processing */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>6. Refund Processing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              If a refund is approved:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>It will be processed within 7–10 business days.</li>
              <li>Refunds will be credited to the original payment method.</li>
            </ul>
          </CardContent>
        </Card>

        {/* 7. Contact */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>7. Contact for Refund Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              For refund-related queries, contact:
            </p>
            <p>
              Email: <a href="mailto:support@easemysalon.com" className="text-blue-600 hover:underline">support@easemysalon.com</a>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <div className="mt-4 flex gap-4 justify-center flex-wrap">
            <Link href="/" className="text-blue-600 hover:underline">
              Back to Home
            </Link>
            <Link href="/contact" className="text-blue-600 hover:underline">
              Contact
            </Link>
            <Link href="/terms-and-conditions" className="text-blue-600 hover:underline">
              Terms & Conditions
            </Link>
            <Link href="/privacy-policy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
