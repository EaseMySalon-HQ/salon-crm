"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Lock, Eye, Trash2, Download, FileText, Mail, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function PrivacyPolicyContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Shield className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
              <p className="text-gray-600 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Introduction */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Introduction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              At EaseMySalon, we are committed to protecting your privacy and ensuring the security of your personal data. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use 
              our salon management system.
            </p>
            <p>
              This policy complies with the General Data Protection Regulation (GDPR), the Digital Personal Data Protection Act, 2023 (DPDP Act) of India, and other applicable data protection laws.
            </p>
          </CardContent>
        </Card>

        {/* Data Collection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>2. Information We Collect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <div>
              <h4 className="font-semibold mb-2">2.1 Personal Information</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Name, email address, phone number</li>
                <li>Business information (salon name, address, tax details)</li>
                <li>Staff information (names, roles, commission structures)</li>
                <li>Client information (names, contact details, service history)</li>
                <li>Payment and billing information</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">2.2 Usage Data</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Login timestamps and session information</li>
                <li>Feature usage and interaction data</li>
                <li>Device information and browser type</li>
                <li>IP address and location data</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">2.3 Cookies</h4>
              <p>
                We use cookies to enhance your experience. See our cookie consent banner for details on cookie types and 
                how to manage your preferences.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* How We Use Data */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>3. How We Use Your Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>To provide and maintain our salon management services</li>
              <li>To process appointments, sales, and transactions</li>
              <li>To manage client relationships and service history</li>
              <li>To send important notifications and updates</li>
              <li>To improve our services and user experience</li>
              <li>To comply with legal obligations and prevent fraud</li>
              <li>To analyze usage patterns and optimize performance</li>
            </ul>
          </CardContent>
        </Card>

        {/* Legal Basis */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>4. Legal Basis for Processing (GDPR)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>We process your personal data based on the following legal grounds:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Contractual necessity:</strong> To fulfill our service agreement with you</li>
              <li><strong>Legitimate interests:</strong> To improve our services and prevent fraud</li>
              <li><strong>Legal obligation:</strong> To comply with tax, accounting, and other legal requirements</li>
              <li><strong>Consent:</strong> For marketing communications and non-essential cookies</li>
            </ul>
          </CardContent>
        </Card>

        {/* Data Sharing */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>5. Data Sharing and Disclosure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>We do not sell your personal data. We may share information only in the following circumstances:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>With service providers who assist in operating our platform (hosting, payment processing)</li>
              <li>When required by law or to protect our legal rights</li>
              <li>With your explicit consent</li>
              <li>In case of business transfer or merger (with notice to users)</li>
            </ul>
          </CardContent>
        </Card>

        {/* Data Security */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              6. Data Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>We implement industry-standard security measures to protect your data:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Encryption of data in transit (HTTPS/TLS)</li>
              <li>Secure authentication and authorization</li>
              <li>Regular security audits and updates</li>
              <li>Access controls and role-based permissions</li>
              <li>Automatic session timeouts</li>
              <li>Regular data backups</li>
            </ul>
          </CardContent>
        </Card>

        {/* Your Rights */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              7. Your Rights Under GDPR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>You have the following rights regarding your personal data:</p>
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Access</h4>
                <p className="text-sm">Request a copy of all personal data we hold about you.</p>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href="/profile?action=export-data">Export My Data</Link>
                </Button>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Rectification</h4>
                <p className="text-sm">Correct inaccurate or incomplete personal data.</p>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href="/profile">Update My Profile</Link>
                </Button>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Erasure ("Right to be Forgotten")</h4>
                <p className="text-sm">Request deletion of your personal data under certain circumstances.</p>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href="/profile?action=delete-account">Request Deletion</Link>
                </Button>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Data Portability</h4>
                <p className="text-sm">Receive your data in a structured, machine-readable format.</p>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href="/profile?action=export-data">Download My Data</Link>
                </Button>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Object</h4>
                <p className="text-sm">Object to processing of your data for marketing or legitimate interests.</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Restrict Processing</h4>
                <p className="text-sm">Request limitation of how we process your data.</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold mb-1">Right to Withdraw Consent</h4>
                <p className="text-sm">Withdraw consent for data processing at any time.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              To exercise any of these rights, please contact us at the email address provided below.
            </p>
          </CardContent>
        </Card>

        {/* Data Retention */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              8. Data Retention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>We retain your personal data only for as long as necessary:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Active accounts:</strong> Data is retained while your account is active</li>
              <li><strong>Inactive accounts:</strong> Data may be retained for up to 7 years for legal and accounting purposes</li>
              <li><strong>Deleted accounts:</strong> Data is permanently deleted within 30 days of account deletion request</li>
              <li><strong>Legal requirements:</strong> Some data may be retained longer if required by law</li>
            </ul>
          </CardContent>
        </Card>

        {/* Cookies */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>9. Cookies and Tracking Technologies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>We use cookies to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Remember your preferences and settings</li>
              <li>Maintain your session security</li>
              <li>Analyze website usage and performance</li>
            </ul>
            <p className="mt-4">
              You can manage your cookie preferences through the cookie consent banner or your browser settings.
            </p>
          </CardContent>
        </Card>

        {/* International Transfers */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>10. International Data Transfers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Your data may be processed and stored in servers located outside the European Economic Area (EEA). 
              We ensure appropriate safeguards are in place, including:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Standard Contractual Clauses (SCCs)</li>
              <li>Adequacy decisions by the European Commission</li>
              <li>Other approved transfer mechanisms under GDPR</li>
            </ul>
          </CardContent>
        </Card>

        {/* Children's Privacy */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>11. Children's Privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              Our services are not intended for individuals under the age of 18. We do not knowingly collect 
              personal information from children. If you believe we have collected information from a child, 
              please contact us immediately.
            </p>
          </CardContent>
        </Card>

        {/* Changes to Policy */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>12. Changes to This Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes 
              by posting the new policy on this page and updating the "Last updated" date. We encourage you to 
              review this policy periodically.
            </p>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              13. Contact Us
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:</p>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="font-semibold">Data Protection Officer</p>
              <p>Email: privacy@easemysalon.in</p>
              <p className="mt-2 text-sm text-gray-600">
                We will respond to your request within 30 days as required by GDPR.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* DPDP Act Compliance Section */}
        <Card className="mb-6 border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              14. DPDP Act (India) Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700">
            <p>
              This Privacy Policy and our data processing practices are also compliant with the Digital Personal Data Protection Act, 2023 (DPDP Act) of India.
            </p>
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold mb-2">Data Principal Rights (Under DPDP Act)</h4>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Right to access personal data</li>
                  <li>Right to correction and erasure</li>
                  <li>Right to grievance redressal</li>
                  <li>Right to nominate a representative</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Grievance Redressal</h4>
                <p className="text-sm mb-2">
                  If you have any concerns or grievances regarding the processing of your personal data, you may contact:
                </p>
                <div className="p-3 bg-white rounded-lg border">
                  <p className="font-semibold">Grievance Officer</p>
                  <p>Email: grievance@easemysalon.in</p>
                  <p className="text-sm text-gray-600 mt-1">
                    We will respond to your grievance within 30 days as required under the DPDP Act.
                  </p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Children's Data</h4>
                <p className="text-sm">
                  We do not knowingly process personal data of children below 18 years of age without verifiable parental consent, 
                  as required under Section 9 of the DPDP Act.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Data Fiduciary Obligations</h4>
                <p className="text-sm">
                  As a Data Fiduciary, we are committed to:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm mt-1">
                  <li>Processing personal data only for lawful purposes</li>
                  <li>Collecting only necessary personal data</li>
                  <li>Ensuring data accuracy and completeness</li>
                  <li>Implementing reasonable security safeguards</li>
                  <li>Notifying data breaches to the Data Protection Board and affected individuals</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>
            This Privacy Policy is compliant with GDPR (General Data Protection Regulation), DPDP Act (India), and other applicable data protection laws.
          </p>
          <div className="mt-4 flex gap-4 justify-center">
            <Link href="/" className="text-blue-600 hover:underline">
              Back to Home
            </Link>
            <Link href="/profile" className="text-blue-600 hover:underline">
              My Profile
            </Link>
            <Link href="/grievance" className="text-blue-600 hover:underline">
              Grievance Redressal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

