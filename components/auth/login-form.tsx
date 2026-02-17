"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Eye, EyeOff, MessageCircle, Shield } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { useAuth } from "@/lib/auth-context"
import { getRememberedBusinessCode, setRememberedBusinessCode, clearRememberedBusinessCode } from "@/lib/auth-utils"
import { AccountSuspended } from "@/components/auth/account-suspended"

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  businessCode: z.string().optional()
})


export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("admin")
  const [isSuspended, setIsSuspended] = useState(false)
  const [suspensionMessage, setSuspensionMessage] = useState("")
  const { login, staffLogin } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      businessCode: ""
    },
  })

  // Pre-fill business code on mount: URL param (?code=BIZ0001) > localStorage
  useEffect(() => {
    const fromUrl = searchParams.get("code")?.trim()
    const fromStorage = getRememberedBusinessCode()
    const initial = fromUrl || fromStorage || ""
    if (initial) {
      form.setValue("businessCode", initial)
    }
  }, [searchParams])

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsSubmitting(true)
    setIsSuspended(false) // Reset suspension state

    try {
      let result: any = false

      if (activeTab === "staff") {
        if (!values.businessCode?.trim()) {
          toast({
            title: "Business Code Required",
            description: "Please enter your business code for staff login.",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
        result = await staffLogin(values.email, values.password, values.businessCode.trim())
      } else {
        result = await login(values.email, values.password)
      }

      // Handle different result types
      if (typeof result === 'boolean') {
        // Staff login returns boolean
        if (result) {
          if (activeTab === "staff" && values.businessCode?.trim()) {
            setRememberedBusinessCode(values.businessCode.trim())
          }
          toast({
            title: "Login successful",
            description: "Welcome back to Ease My Salon!",
          })
          router.push("/")
        } else {
          toast({
            title: "Login failed",
            description: "Invalid credentials. Please try again.",
            variant: "destructive",
          })
        }
      } else {
        // Admin login returns object with success, error, message
        if (result.success) {
          toast({
            title: "Login successful",
            description: "Welcome back to Ease My Salon!",
          })
          router.push("/")
        } else if (result.error === 'ACCOUNT_SUSPENDED') {
          setIsSuspended(true)
          setSuspensionMessage(result.message || "Your account has been suspended. Please contact your host for assistance.")
        } else {
          toast({
            title: "Login failed",
            description: result.message || "Invalid credentials. Please try again.",
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      toast({
        title: "Login error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }


  // Show suspension message if account is suspended
  if (isSuspended) {
    return (
      <AccountSuspended 
        message={suspensionMessage}
        onBackToLogin={() => {
          setIsSuspended(false)
          setSuspensionMessage("")
        }}
      />
    )
  }

  return (
    <Card className="w-full border border-slate-100 bg-white/90 shadow-xl">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto w-fit rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#7C3AED]">
          Secure login portal
        </div>
        <CardTitle className="text-3xl text-slate-900">Access your Ease My Salon HQ</CardTitle>
        <CardDescription className="text-base">
          Choose your role and enter your credentials to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-slate-100 p-1">
            <TabsTrigger
              value="admin"
              className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Admin
            </TabsTrigger>
            <TabsTrigger
              value="staff"
              className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900"
            >
              Staff
            </TabsTrigger>
              </TabsList>
              
              <TabsContent value="admin" className="space-y-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-[#7C3AED] to-[#8B5CF6] text-white shadow-lg shadow-purple-200 hover:from-[#6D28D9] hover:to-[#7C3AED]"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Signing in..." : "Sign in as Admin"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="staff" className="space-y-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                {...field}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessCode"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Business Code</FormLabel>
                            {field.value && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-xs text-slate-500 hover:text-slate-700"
                                onClick={() => {
                                  clearRememberedBusinessCode()
                                  form.setValue("businessCode", "")
                                }}
                              >
                                Clear saved
                              </Button>
                            )}
                          </div>
                          <FormControl>
                            <Input
                              placeholder="Enter your business code (e.g. BIZ0001)"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full bg-slate-900 text-white shadow-md hover:bg-slate-800"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Signing in..." : "Sign in as Staff"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>

            <div className="mt-4 text-center">
              <Button
                variant="link"
                onClick={() => router.push("/forgot-password")}
            className="text-sm text-[#7C3AED] hover:text-[#6D28D9]"
              >
                Forgot your password?
              </Button>
            </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <Shield className="h-4 w-4 text-emerald-500" />
            256-bit encryption + DPDP compliant
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-[#7C3AED] hover:bg-transparent hover:text-[#6D28D9]"
            onClick={() => router.push("/contact")}
          >
            Need help? Chat with concierge
            <MessageCircle className="ml-2 h-4 w-4" />
          </Button>
        </div>
          </CardContent>
        </Card>
  )
}
