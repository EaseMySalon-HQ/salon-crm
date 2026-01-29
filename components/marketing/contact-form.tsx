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

const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  phone: z.string().min(10, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  salon: z.string().min(2, "Salon / brand name is required"),
  city: z.string().min(2, "City is required"),
  branches: z.string().optional(),
  preferredTime: z.string().optional(),
  message: z.string().min(10, "Tell us a little about your requirements"),
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
    },
  })

  const onSubmit = async (values: z.infer<typeof contactSchema>) => {
    setLoading(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const whatsappMessage = `Hi Ease My Salon! I'm ${values.name} from ${values.salon} in ${values.city}.

Phone: ${values.phone}
Email: ${values.email}
Branches: ${values.branches || "N/A"}
Preferred time: ${values.preferredTime || "Anytime"}
Message: ${values.message}`

      window.open(`https://wa.me/917091140602?text=${encodeURIComponent(whatsappMessage)}`, "_blank")

      toast({
        title: "Thanks! We’ll be in touch soon.",
        description: "Opening WhatsApp so you can chat with our concierge.",
      })
      form.reset()
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again or WhatsApp us directly.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                {loading ? "Sharing details…" : "Book demo via WhatsApp"}
        </Button>
      </form>
    </Form>
  )
}

