"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { StaffAPI } from "@/lib/api"

const passwordSetupSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

interface PasswordSetupFormProps {
  staff: any
  onSuccess: () => void
  onCancel: () => void
}

export function PasswordSetupForm({ staff, onSuccess, onCancel }: PasswordSetupFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()

  const form = useForm<z.infer<typeof passwordSetupSchema>>({
    resolver: zodResolver(passwordSetupSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (values: z.infer<typeof passwordSetupSchema>) => {
    if (!staff?._id) return

    setIsSubmitting(true)
    try {
      // Update staff with password and enable login access
      const response = await StaffAPI.update(staff._id, {
        name: staff.name,
        email: staff.email,
        phone: staff.phone || '',
        role: staff.role,
        hasLoginAccess: true,
        allowAppointmentScheduling: staff.allowAppointmentScheduling,
        specialties: staff.specialties || [],
        salary: staff.salary || 0,
        commissionProfileIds: staff.commissionProfileIds || [],
        notes: staff.notes || '',
        isActive: staff.isActive !== undefined ? staff.isActive : true,
        password: values.newPassword
      })

      if (response.success) {
        toast({
          title: "Success",
          description: `Login access enabled and password set for ${staff.name}`,
        })
        onSuccess()
        form.reset()
      } else {
        throw new Error(response.error || 'Failed to set password')
      }
    } catch (error: any) {
      console.error("Password setup error:", error)
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to set password",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-4">
          <p className="text-sm text-slate-600">
            Set up a password for <span className="font-semibold">{staff?.name}</span> to enable login access.
          </p>
        </div>

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password (min. 6 characters)"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
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
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    {...field}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
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

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? "Setting up..." : "Set Password"}
          </Button>
        </div>
      </form>
    </Form>
  )
}



