"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "lucide-react"
import Link from "next/link"

export function TermsAndConditionsContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Terms & Conditions</h1>
              <p className="text-gray-600 mt-1">EaseMySalon</p>
              <p className="text-sm text-gray-500">Last Updated: 13-03-2026</p>
            </div>
          </div>
        </div>

        {/* Introduction */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4 text-gray-700">
            <p>
              These Terms & Conditions govern the use of the EaseMySalon platform. By accessing or using our services, you agree to comply with these terms.
            </p>
          </CardContent>
        </Card>

        {/* 1. Service Description */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Service Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon provides software solutions for salon businesses including:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Billing and invoicing</li>
              <li>Appointment management</li>
              <li>Customer database (CRM)</li>
              <li>Staff management</li>
              <li>Inventory tracking</li>
              <li>Reporting and analytics</li>
              <li>Marketing and messaging tools</li>
            </ul>
          </CardContent>
        </Card>

        {/* 2. User Account */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. User Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Users must:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Provide accurate business information</li>
              <li>Maintain confidentiality of login credentials</li>
              <li>Be responsible for all activities under their account</li>
            </ul>
            <p>
              EaseMySalon reserves the right to suspend accounts found violating these terms.
            </p>
          </CardContent>
        </Card>

        {/* 3. Subscription and Payments */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. Subscription and Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Use of the platform may require a paid subscription.</li>
              <li>Subscription fees are billed in advance.</li>
              <li>Pricing may change with prior notice.</li>
              <li>Failure to make payment may result in service suspension.</li>
            </ul>
          </CardContent>
        </Card>

        {/* 4. Acceptable Use */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Acceptable Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Users agree not to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Use the platform for illegal activities</li>
              <li>Send spam or unauthorized marketing messages</li>
              <li>Attempt to access restricted parts of the system</li>
              <li>Interfere with platform security</li>
            </ul>
          </CardContent>
        </Card>

        {/* 5. Data Responsibility */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>5. Data Responsibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Users are responsible for the accuracy and legality of the data entered into the platform, including:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Customer information</li>
              <li>Transaction records</li>
              <li>Staff details</li>
            </ul>
            <p>
              EaseMySalon acts only as a software service provider and does not take responsibility for business operations.
            </p>
          </CardContent>
        </Card>

        {/* 6. Third-Party Services */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>6. Third-Party Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon may integrate with third-party services such as:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>SMS providers</li>
              <li>WhatsApp messaging services</li>
              <li>Payment gateways</li>
              <li>Cloud hosting</li>
            </ul>
            <p>
              EaseMySalon is not responsible for service interruptions caused by these third-party providers.
            </p>
          </CardContent>
        </Card>

        {/* 7. Intellectual Property */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>7. Intellectual Property</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              All platform features, software, branding, and content are the property of EaseMySalon and may not be copied, modified, or redistributed without permission.
            </p>
          </CardContent>
        </Card>

        {/* 8. Service Availability */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>8. Service Availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              While we strive for uninterrupted service, EaseMySalon does not guarantee that the platform will always be available or error-free.
            </p>
          </CardContent>
        </Card>

        {/* 9. Limitation of Liability */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>9. Limitation of Liability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon shall not be liable for:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Loss of business</li>
              <li>Loss of revenue</li>
              <li>Data loss caused by user actions</li>
              <li>Indirect or consequential damages</li>
            </ul>
          </CardContent>
        </Card>

        {/* 10. Termination */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>10. Termination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon reserves the right to terminate accounts that:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Violate these terms</li>
              <li>Engage in fraudulent activity</li>
              <li>Misuse the platform</li>
            </ul>
          </CardContent>
        </Card>

        {/* 11. Changes to Terms */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>11. Changes to Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              EaseMySalon may update these Terms & Conditions from time to time. Continued use of the platform constitutes acceptance of the updated terms.
            </p>
          </CardContent>
        </Card>

        {/* 12. Contact */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>12. Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              For any questions regarding these Terms:
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
            <Link href="/refund-policy" className="text-blue-600 hover:underline">
              Refund Policy
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
