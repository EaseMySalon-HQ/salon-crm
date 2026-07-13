import { AdminLoginForm } from "@/components/admin/admin-login-form"
import { ThemeToggleButton } from "@/components/theme-toggle"

export default function AdminLoginPage() {
  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggleButton />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Internal tools for managing salon businesses
          </p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  )
}
