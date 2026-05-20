"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import {
  DemoBookingSuccessDialog,
  type DemoBookingSuccessSummary,
} from "@/components/marketing/demo-booking-success-dialog"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  phone: z.string().min(10, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  salon: z.string().min(2, "Salon / brand name is required"),
  city: z.string().min(2, "City is required"),
  branches: z.string().optional(),
  preferredTime: z.string().optional(),
  message: z.string().min(10, "Tell us a little about your requirements"),
  website: z.string().optional(),
})

const timeSlots = Array.from({ length: 8 }, (_, index) => {
  const startHour = 10 + Math.floor(index / 2)
  const startMinutes = index % 2 === 0 ? "00" : "30"
  const endHour = index % 2 === 0 ? startHour : startHour + 1
  const endMinutes = index % 2 === 0 ? "30" : "00"
  const format = (hour: number, minutes: string) => {
    const period = hour >= 12 ? "PM" : "AM"
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${period}`
  }
  return `${format(startHour, startMinutes)} - ${format(endHour, endMinutes)}`
})

export function ContactForm() {
  const [loading, setLoading] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successSummary, setSuccessSummary] = useState<DemoBookingSuccessSummary | null>(null)
  const form = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      salon: "",
      city: "",
      branches: "",
      preferredTime: "",
      message: "",
      website: "",
    },
  })

  const onSubmit = async (values: z.infer<typeof contactSchema>) => {
    setLoading(true)

    try {
      const leadRes = await fetch(`${API_URL}/public/demo-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          salon: values.salon,
          city: values.city,
          branches: values.branches || undefined,
          preferredTime: values.preferredTime || undefined,
          message: values.message,
          website: values.website || "",
        }),
      })
      const leadPayload = await leadRes.json().catch(() => ({}))
      if (!leadRes.ok || leadPayload?.success === false) {
        throw new Error(leadPayload?.error || "Could not save your details")
      }

      setSuccessSummary({
        name: values.name,
        salon: values.salon,
        email: values.email,
        preferredTime: values.preferredTime || undefined,
      })
      setSuccessOpen(true)
      form.reset()
    } catch (error) {
      toast({
        title: "Something went wrong",
        description:
          error instanceof Error ? error.message : "Please try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DemoBookingSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        summary={successSummary}
      />
      <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-0 w-0 opacity-0 pointer-events-none"
          {...form.register("website")}
        />
        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="+91" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@salon.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input placeholder="City" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="salon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salon / brand name</FormLabel>
                <FormControl>
                  <Input placeholder="Salon brand" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="branches"
            render={({ field }) => (
              <FormItem>
                <FormLabel>No. of branches</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. 3" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="preferredTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred time to connect</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a slot" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>What should we prepare for the demo?</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Share top priorities or current challenges…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={loading} className="w-full bg-[#7C3AED] hover:bg-[#6D28D9]">
          {loading ? "Submitting…" : "Book demo"}
        </Button>
      </form>
    </Form>
    </>
  )
}

