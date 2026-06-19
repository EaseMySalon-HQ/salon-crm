"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { BookingHero } from "@/components/public-booking/booking-hero"
import {
  BOOKING_HERO_INNER_WIDTH_CLASS,
  BOOKING_PAGE_MAIN_GRID_CLASS,
  BOOKING_STICKY_COLUMN_CLASS,
} from "@/lib/booking-hero-layout"
import { cn } from "@/lib/utils"
import { ServicePicker } from "@/components/public-booking/service-picker"
import { BookingCartPanel, MobileCartBar } from "@/components/public-booking/booking-cart"
import { BookingCheckoutShell, DESKTOP_CHECKOUT_STEP_COUNT, DESKTOP_CHECKOUT_STEP_HEADINGS, MOBILE_CHECKOUT_STEP_COUNT, MOBILE_CHECKOUT_STEP_HEADINGS } from "@/components/public-booking/booking-checkout-shell"
import { StaffPreferenceSelect } from "@/components/public-booking/staff-preference-select"
import { DateTimePicker } from "@/components/public-booking/date-time-picker"
import { CustomerDetailsForm, type CustomerFormValues } from "@/components/public-booking/customer-details-form"
import {
  BookingSuccessDialog,
  type BookingSuccessSummary,
} from "@/components/public-booking/booking-summary"
import {
  fetchPublicBookingStaff,
  fetchPublicBookingProfile,
  fetchPublicBookingServices,
  fetchPublicBookingSlots,
  submitPublicBooking,
  type CartLineItem,
  type PublicBookingProfile,
  type PublicBookingService,
  type PublicBookingSlot,
  type PublicBookingStaff,
} from "@/lib/public-booking-api"

type PublicBookingPageProps = {
  code: string
}

type BookingPhase = "services" | "checkout"

const MOBILE_BOOKING_MAX_WIDTH = 1023

function useIsMobileBookingLayout() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BOOKING_MAX_WIDTH}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return isMobile
}

export function PublicBookingPage({ code }: PublicBookingPageProps) {
  const [profile, setProfile] = useState<PublicBookingProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileErrorStatus, setProfileErrorStatus] = useState<number | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileReloadKey, setProfileReloadKey] = useState(0)

  const [search, setSearch] = useState("")
  const [services, setServices] = useState<PublicBookingService[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)

  const [cart, setCart] = useState<CartLineItem[]>([])
  const [preferredStaffId, setPreferredStaffId] = useState<string | null>(null)
  const [preferredStaffName, setPreferredStaffName] = useState<string | undefined>()
  const [staffList, setStaffList] = useState<PublicBookingStaff[]>([])
  const [staffLoading, setStaffLoading] = useState(false)

  const [selectedDate, setSelectedDate] = useState("")
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null)
  const [slots, setSlots] = useState<PublicBookingSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [closedDay, setClosedDay] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successSummary, setSuccessSummary] = useState<BookingSuccessSummary | null>(null)

  const [phase, setPhase] = useState<BookingPhase>("services")
  const [checkoutStep, setCheckoutStep] = useState(1)
  const isMobileCheckoutLayout = useIsMobileBookingLayout()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setProfileLoading(true)
      setProfileError(null)
      setProfileErrorStatus(null)
      try {
        const data = await fetchPublicBookingProfile(code)
        if (!cancelled) {
          setProfile(data)
        }
      } catch (e) {
        if (!cancelled) {
          const err = e as Error & { status?: number }
          setProfileErrorStatus(err.status ?? null)
          if (err.status === 429) {
            setProfileError(
              "Too many requests were sent from this browser. Wait a minute, then try again."
            )
          } else {
            setProfileError(err.message || "Booking page not available.")
          }
        }
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, profileReloadKey])

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      setServicesLoading(true)
      try {
        const list = await fetchPublicBookingServices(code)
        if (!cancelled) setServices(list)
      } catch {
        if (!cancelled) {
          toast({ title: "Could not load services", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setServicesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, profile])

  useEffect(() => {
    if (cart.length === 0) return
    let cancelled = false
    ;(async () => {
      setStaffLoading(true)
      try {
        const staff = await fetchPublicBookingStaff(code)
        if (!cancelled) setStaffList(staff)
      } catch {
        if (!cancelled) {
          toast({ title: "Could not load staff", variant: "destructive" })
        }
      } finally {
        if (!cancelled) setStaffLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, cart.length])

  const selectedStaffId = preferredStaffId

  /** Refetch slots when services or shared staff choice changes. */
  const cartSchedulingKey = useMemo(
    () => `${selectedStaffId ?? ""}|${cart.map((c) => c.id).join(",")}`,
    [cart, selectedStaffId]
  )

  const cartItems = useMemo(
    () => cart.map((c) => ({ serviceId: c.id, staffId: selectedStaffId })),
    [cartSchedulingKey, cart, selectedStaffId]
  )

  const cartItemsRef = useRef(cartItems)
  cartItemsRef.current = cartItems

  const totalDuration = useMemo(
    () => cart.reduce((sum, c) => sum + c.duration, 0),
    [cart]
  )
  const totalAmount = useMemo(() => cart.reduce((sum, c) => sum + c.price, 0), [cart])

  const clearSlotSelection = useCallback(() => {
    setSelectedTime(null)
    setSelectedStartAt(null)
  }, [])

  const getServiceQuantity = useCallback(
    (serviceId: string) => cart.filter((c) => c.id === serviceId).length,
    [cart]
  )

  const scrollToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [])

  const goToCheckout = useCallback(() => {
    if (cart.length === 0) return
    setCheckoutStep(1)
    setPhase("checkout")
    scrollToTop()
  }, [cart.length, scrollToTop])

  const handleCheckoutBack = useCallback(() => {
    if (checkoutStep === 1) {
      setPhase("services")
    } else if (isMobileCheckoutLayout) {
      setCheckoutStep((s) => s - 1)
    } else {
      setCheckoutStep(1)
    }
    scrollToTop()
  }, [checkoutStep, isMobileCheckoutLayout, scrollToTop])

  const advanceCheckoutStep = useCallback(() => {
    if (isMobileCheckoutLayout) {
      if (checkoutStep === 1) {
        setCheckoutStep(2)
      } else if (checkoutStep === 2) {
        if (!selectedDate) {
          toast({ title: "Select a date first", variant: "destructive" })
          return
        }
        setCheckoutStep(3)
      } else if (checkoutStep === 3) {
        if (!selectedStartAt) {
          toast({ title: "Select a time slot first", variant: "destructive" })
          return
        }
        setCheckoutStep(4)
      }
    } else if (checkoutStep === 1) {
      if (!selectedDate || !selectedStartAt) {
        toast({ title: "Select a time slot first", variant: "destructive" })
        return
      }
      setCheckoutStep(4)
    }
    scrollToTop()
  }, [
    checkoutStep,
    isMobileCheckoutLayout,
    selectedDate,
    selectedStartAt,
    scrollToTop,
  ])

  useEffect(() => {
    if (cart.length === 0 && phase === "checkout") {
      setPhase("services")
      setCheckoutStep(1)
    }
  }, [cart.length, phase])

  useEffect(() => {
    if (!selectedDate || cart.length === 0) {
      setSlots([])
      setClosedDay(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setSlotsLoading(true)
      try {
        const data = await fetchPublicBookingSlots(code, {
          date: selectedDate,
          items: cartItemsRef.current,
        })
        if (!cancelled) {
          setSlots(data.slots)
          setClosedDay(!!data.closed)
        }
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load slots",
            description: e instanceof Error ? e.message : undefined,
            variant: "destructive",
          })
          setSlots([])
        }
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, selectedDate, cartSchedulingKey, cart.length])

  const handleAddService = (service: PublicBookingService) => {
    setCart((prev) => [
      ...prev,
      {
        ...service,
        cartId: `${service.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        staffId: null,
      },
    ])
    clearSlotSelection()
  }

  const handleRemoveOneService = useCallback(
    (serviceId: string) => {
      setCart((prev) => {
        const idx = prev.map((c) => c.id).lastIndexOf(serviceId)
        if (idx === -1) return prev
        return prev.filter((_, i) => i !== idx)
      })
      clearSlotSelection()
    },
    [clearSlotSelection]
  )

  const handleAddSameService = useCallback(
    (serviceId: string) => {
      const service = services.find((s) => s.id === serviceId)
      if (service) handleAddService(service)
    },
    [services, clearSlotSelection]
  )

  const handleRemove = (cartId: string) => {
    setCart((prev) => prev.filter((c) => c.cartId !== cartId))
    clearSlotSelection()
  }

  const handleStaffChange = (staffId: string | null, staffName?: string) => {
    setPreferredStaffId(staffId)
    setPreferredStaffName(staffName || undefined)
    clearSlotSelection()
  }

  const handleDateChange = useCallback(
    (iso: string) => {
      setSelectedDate(iso)
      clearSlotSelection()
    },
    [clearSlotSelection]
  )

  const handleSlotSelect = (slot: PublicBookingSlot) => {
    if (!selectedDate || slot.status !== "available") return
    setSelectedTime(slot.time)
    setSelectedStartAt(slot.startAt)
  }

  const handleConfirm = async (customer: CustomerFormValues) => {
    if (!selectedDate || !selectedStartAt || cart.length === 0) {
      toast({ title: "Select a time slot first", variant: "destructive" })
      return
    }
    setSubmitting(true)
    try {
      await submitPublicBooking(code, {
        date: selectedDate,
        startAt: selectedStartAt,
        items: cartItems,
        customer: {
          name: customer.name,
          phone: customer.phone,
          email: customer.email || undefined,
          notes: customer.notes || undefined,
        },
      })
      setSuccessSummary({
        businessName: profile?.name || "",
        customerName: customer.name,
        date: selectedDate,
        time: selectedTime || "",
        totalDuration,
        totalAmount,
      })
      setSuccessOpen(true)
      setCart([])
      setPreferredStaffId(null)
      setPreferredStaffName(undefined)
      clearSlotSelection()
      setSelectedDate("")
      setPhase("services")
      setCheckoutStep(1)
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      toast({
        title: err.status === 409 ? "Slot no longer available" : "Booking failed",
        description:
          err.message ||
          (err.status === 409
            ? "Please select another time slot."
            : "Please try again."),
        variant: "destructive",
      })
      if (err.status === 409 && selectedDate) {
        clearSlotSelection()
        try {
          const data = await fetchPublicBookingSlots(code, {
            date: selectedDate,
            items: cartItems,
          })
          setSlots(data.slots)
        } catch {
          /* ignore refresh error */
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const staffSectionRef = useRef<HTMLDivElement>(null)

  const scrollToStaffSelect = useCallback(() => {
    if (isMobileCheckoutLayout) {
      setCheckoutStep(1)
      scrollToTop()
      return
    }
    staffSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [isMobileCheckoutLayout, scrollToTop])

  const handleAddMoreServices = useCallback(() => {
    setPhase("services")
    setCheckoutStep(1)
    scrollToTop()
  }, [scrollToTop])

  const canBook = cart.length > 0 && !!selectedDate && !!selectedStartAt

  const cartContinueProps = useMemo(() => {
    if (phase === "services" && cart.length > 0) {
      return {
        onContinue: goToCheckout,
        continueLabel: isMobileCheckoutLayout
          ? ("Select Staff" as const)
          : ("Select staff & time" as const),
      }
    }
    if (phase === "checkout") {
      if (isMobileCheckoutLayout) {
        if (checkoutStep === 1) {
          return { onContinue: advanceCheckoutStep, continueLabel: "Select Date" as const }
        }
        if (checkoutStep === 2) {
          return {
            onContinue: advanceCheckoutStep,
            continueDisabled: !selectedDate,
            continueLabel: "Select Time" as const,
          }
        }
        if (checkoutStep === 3) {
          return {
            onContinue: advanceCheckoutStep,
            continueDisabled: !selectedStartAt,
            continueLabel: "Add Details" as const,
          }
        }
        if (checkoutStep === 4) {
          return {
            onContinue: () => {
              document.getElementById("public-booking-customer-form")?.requestSubmit()
            },
            continueDisabled: !canBook || submitting,
            continueLabel: "Confirm booking" as const,
          }
        }
      }
      if (checkoutStep === 1) {
        return {
          onContinue: advanceCheckoutStep,
          continueDisabled: !(selectedDate && selectedStartAt),
          continueLabel: "Continue to details" as const,
        }
      }
    }
    return {}
  }, [
    phase,
    cart.length,
    checkoutStep,
    goToCheckout,
    advanceCheckoutStep,
    selectedDate,
    selectedStartAt,
    isMobileCheckoutLayout,
    canBook,
    submitting,
  ])

  const checkoutShellStep = isMobileCheckoutLayout
    ? checkoutStep
    : checkoutStep === 4
      ? 2
      : 1
  const checkoutShellStepCount = isMobileCheckoutLayout
    ? MOBILE_CHECKOUT_STEP_COUNT
    : DESKTOP_CHECKOUT_STEP_COUNT
  const checkoutShellHeadings = isMobileCheckoutLayout
    ? MOBILE_CHECKOUT_STEP_HEADINGS
    : DESKTOP_CHECKOUT_STEP_HEADINGS

  if (profileLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-[#7C3AED]" />
        <p className="text-sm">Loading booking page…</p>
      </div>
    )
  }

  if (profileError || !profile) {
    const isRateLimited = profileErrorStatus === 429
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          {isRateLimited ? "Please try again" : "Booking unavailable"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{profileError || "This page is not available."}</p>
        {isRateLimited && (
          <Button
            type="button"
            className="mt-6 bg-[#7C3AED] hover:bg-[#6D28D9]"
            onClick={() => setProfileReloadKey((k) => k + 1)}
          >
            Retry
          </Button>
        )}
      </div>
    )
  }

  const staffPreferenceLabel =
    phase === "checkout" || preferredStaffId
      ? preferredStaffId
        ? preferredStaffName || "Selected staff"
        : "No Preference"
      : undefined

  const cartPanel = (
    <BookingCartPanel
      businessName={profile.name}
      cart={cart}
      staffPreferenceLabel={staffPreferenceLabel}
      staffPreferenceSelected={!!preferredStaffId}
      totalDuration={totalDuration}
      totalAmount={totalAmount}
      selectedDate={selectedDate || undefined}
      selectedTime={selectedTime || undefined}
      onRemove={handleRemove}
      onAddSame={handleAddSameService}
      onRemoveOne={handleRemoveOneService}
      getQuantity={getServiceQuantity}
      onAddMoreServices={handleAddMoreServices}
      fullHeight
      {...cartContinueProps}
    />
  )

  return (
    <div className="flex min-h-screen w-full flex-col">
      {phase === "services" && <BookingHero profile={profile} />}

      <div className={`${BOOKING_HERO_INNER_WIDTH_CLASS} flex flex-1 flex-col`}>
        <div className={BOOKING_PAGE_MAIN_GRID_CLASS}>
        <div className="min-w-0 pb-20 lg:pb-0">
          {phase === "services" ? (
            <ServicePicker
              services={services}
              search={search}
              onSearchChange={setSearch}
              loading={servicesLoading}
              onAdd={handleAddService}
              onRemoveOne={handleRemoveOneService}
              getQuantity={getServiceQuantity}
            />
          ) : (
            <BookingCheckoutShell
              step={checkoutShellStep}
              stepCount={checkoutShellStepCount}
              headings={checkoutShellHeadings}
              onBack={handleCheckoutBack}
            >
              {isMobileCheckoutLayout ? (
                <>
                  {checkoutStep === 1 && (
                    <StaffPreferenceSelect
                      staffList={staffList}
                      loading={staffLoading}
                      selectedStaffId={selectedStaffId}
                      onStaffChange={handleStaffChange}
                      hideHeader
                    />
                  )}
                  {checkoutStep === 2 && (
                    <DateTimePicker
                      profile={profile}
                      selectedDate={selectedDate}
                      selectedTime={selectedTime}
                      selectedStartAt={selectedStartAt}
                      slots={slots}
                      slotsLoading={slotsLoading}
                      closedDay={closedDay}
                      onDateChange={handleDateChange}
                      onSlotSelect={handleSlotSelect}
                      hideHeader
                      view="date"
                    />
                  )}
                  {checkoutStep === 3 && (
                    <DateTimePicker
                      profile={profile}
                      selectedDate={selectedDate}
                      selectedTime={selectedTime}
                      selectedStartAt={selectedStartAt}
                      slots={slots}
                      slotsLoading={slotsLoading}
                      closedDay={closedDay}
                      onDateChange={handleDateChange}
                      onSlotSelect={handleSlotSelect}
                      onChangeStaff={scrollToStaffSelect}
                      hideHeader
                      view="slots"
                    />
                  )}
                  {checkoutStep === 4 && (
                    <CustomerDetailsForm
                      submitting={submitting}
                      onSubmit={handleConfirm}
                      disabled={!canBook}
                      hideHeader
                    />
                  )}
                </>
              ) : (
                <>
                  {checkoutStep !== 4 && (
                    <div className="space-y-8">
                      <div ref={staffSectionRef}>
                        <StaffPreferenceSelect
                          staffList={staffList}
                          loading={staffLoading}
                          selectedStaffId={selectedStaffId}
                          onStaffChange={handleStaffChange}
                          hideHeader
                        />
                      </div>
                      <div>
                        <h3 className="mb-4 text-base font-semibold text-slate-900">Date & time</h3>
                        <DateTimePicker
                          profile={profile}
                          selectedDate={selectedDate}
                          selectedTime={selectedTime}
                          selectedStartAt={selectedStartAt}
                          slots={slots}
                          slotsLoading={slotsLoading}
                          closedDay={closedDay}
                          onDateChange={handleDateChange}
                          onSlotSelect={handleSlotSelect}
                          onChangeStaff={scrollToStaffSelect}
                          hideHeader
                          view="combined"
                        />
                      </div>
                    </div>
                  )}
                  {checkoutStep === 4 && (
                    <CustomerDetailsForm
                      submitting={submitting}
                      onSubmit={handleConfirm}
                      disabled={!canBook}
                      hideHeader
                    />
                  )}
                </>
              )}
            </BookingCheckoutShell>
          )}
        </div>

        <aside className={cn("hidden lg:block lg:w-full", BOOKING_STICKY_COLUMN_CLASS)}>
          <div className="flex max-h-[calc(100vh)] w-full flex-col bg-white">
            {cartPanel}
          </div>
        </aside>
        </div>
      </div>

      {cart.length > 0 && (
        <MobileCartBar
          itemCount={cart.length}
          totalAmount={totalAmount}
          onOpen={() => setMobileSheetOpen(true)}
          onContinue={
            cartContinueProps.onContinue
              ? () => {
                  if (phase === "services") {
                    goToCheckout()
                  } else {
                    cartContinueProps.onContinue?.()
                  }
                }
              : undefined
          }
          continueLabel={cartContinueProps.continueLabel}
          continueDisabled={cartContinueProps.continueDisabled}
        />
      )}

      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Your cart</SheetTitle>
          </SheetHeader>
          <div className="mt-4 pb-6">
            <BookingCartPanel
              businessName={profile.name}
              cart={cart}
              staffPreferenceLabel={staffPreferenceLabel}
              staffPreferenceSelected={!!preferredStaffId}
              totalDuration={totalDuration}
              totalAmount={totalAmount}
              selectedDate={selectedDate || undefined}
              selectedTime={selectedTime || undefined}
              onRemove={handleRemove}
              onAddSame={handleAddSameService}
              onRemoveOne={handleRemoveOneService}
              getQuantity={getServiceQuantity}
              onAddMoreServices={handleAddMoreServices}
              onContinue={
                cartContinueProps.onContinue
                  ? () => {
                      setMobileSheetOpen(false)
                      cartContinueProps.onContinue?.()
                    }
                  : undefined
              }
              continueDisabled={cartContinueProps.continueDisabled}
              continueLabel={cartContinueProps.continueLabel}
              compact
              className="border-0 shadow-none"
            />
          </div>
        </SheetContent>
      </Sheet>

      <BookingSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        summary={successSummary}
      />
    </div>
  )
}
