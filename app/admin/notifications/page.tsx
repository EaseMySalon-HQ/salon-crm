"use client"

import { AdminLayout } from "@/components/admin/admin-layout"
import { AdminNotificationsPage } from "@/components/admin/admin-notifications-page"

export default function AdminNotificationsPageRoute() {
  return (
    <AdminLayout>
      <AdminNotificationsPage />
    </AdminLayout>
  )
}
