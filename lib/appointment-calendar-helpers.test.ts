import { describe, it, expect } from "vitest"
import {
  getServiceDisplayNames,
  getAppointmentTotalDurationList,
  getAppointmentTotalDurationGrid,
  getAppointmentGridWindowMinutes,
  getBookingGroupSiblings,
  collectSaleLinesFromAppointmentCard,
  buildRaiseSaleAppointmentPayload,
  getAppointmentStatusPillClass,
  getAppointmentStatusSheetHeaderClass,
  saleRecordIsPartialPayment,
  getAppointmentEditAppearanceStatus,
  getAppointmentIdsForCardStatusUpdate,
  isOnlineBookingAppointment,
} from "./appointment-calendar-helpers"

describe("saleRecordIsPartialPayment", () => {
  it("is true when paid and remaining are both positive", () => {
    expect(
      saleRecordIsPartialPayment({
        paymentStatus: { paidAmount: 100, remainingAmount: 50 },
      })
    ).toBe(true)
    expect(saleRecordIsPartialPayment({ paymentStatus: { paidAmount: 0, remainingAmount: 100 } })).toBe(false)
    expect(saleRecordIsPartialPayment({ paymentStatus: { paidAmount: 100, remainingAmount: 0 } })).toBe(false)
  })
})

describe("getAppointmentEditAppearanceStatus", () => {
  it("overlays partial_payment when sale is partial and appointment is active", () => {
    expect(
      getAppointmentEditAppearanceStatus("scheduled", {
        paymentStatus: { paidAmount: 50, remainingAmount: 50 },
      })
    ).toBe("partial_payment")
    expect(
      getAppointmentEditAppearanceStatus("completed", {
        paymentStatus: { paidAmount: 50, remainingAmount: 50 },
      })
    ).toBe("completed")
  })

  it("returns base status when there is no linked sale", () => {
    expect(getAppointmentEditAppearanceStatus("arrived", null)).toBe("arrived")
  })
})

describe("getAppointmentStatusSheetHeaderClass", () => {
  it("uses header bar tone tokens per status", () => {
    expect(getAppointmentStatusSheetHeaderClass("scheduled")).toContain("slate-100")
    expect(getAppointmentStatusSheetHeaderClass("confirmed")).toContain("cyan-100")
    expect(getAppointmentStatusSheetHeaderClass("missed")).toContain("rose-100")
  })
})

describe("getAppointmentStatusPillClass", () => {
  it("uses calendar tone tokens per status", () => {
    expect(getAppointmentStatusPillClass("scheduled")).toContain("slate-100")
    expect(getAppointmentStatusPillClass("confirmed")).toContain("cyan-100")
    expect(getAppointmentStatusPillClass("arrived")).toContain("blue-100")
    expect(getAppointmentStatusPillClass("service_started")).toContain("indigo-100")
    expect(getAppointmentStatusPillClass("completed")).toContain("emerald-100")
    expect(getAppointmentStatusPillClass("missed")).toContain("rose-100")
    expect(getAppointmentStatusPillClass("cancelled")).toContain("red-100")
    expect(getAppointmentStatusPillClass("cancelled_at_billing")).toContain("zinc-100")
  })

  it("defaults empty to scheduled tone", () => {
    expect(getAppointmentStatusPillClass(null)).toContain("slate-100")
    expect(getAppointmentStatusPillClass("")).toContain("slate-100")
  })
})

describe("getServiceDisplayNames", () => {
  it("returns primary + additional service names", () => {
    expect(
      getServiceDisplayNames({
        serviceId: { name: "Cut", _id: "1" },
        additionalServices: [{ name: "Color" }],
      })
    ).toEqual(["Cut", "Color"])
  })

  it("defaults primary label when service missing", () => {
    expect(getServiceDisplayNames({})).toEqual(["Service"])
  })
})

describe("getAppointmentTotalDurationList", () => {
  it("sums service primary + additional durations", () => {
    expect(
      getAppointmentTotalDurationList({
        serviceId: { duration: 60 },
        additionalServices: [{ duration: 30 }],
      })
    ).toBe(90)
  })

  it("uses apt.duration when service duration missing", () => {
    expect(getAppointmentTotalDurationList({ duration: 45, serviceId: {} })).toBe(45)
  })
})

describe("getAppointmentTotalDurationGrid", () => {
  it("returns apt.duration when set and positive (override)", () => {
    expect(
      getAppointmentTotalDurationGrid({
        duration: 120,
        serviceId: { duration: 60 },
        additionalServices: [{ duration: 30 }],
      })
    ).toBe(120)
  })

  it("computes from service + additional when no override", () => {
    expect(
      getAppointmentTotalDurationGrid({
        serviceId: { duration: 60 },
        additionalServices: [{ duration: 15 }],
      })
    ).toBe(75)
  })
})

describe("getAppointmentGridWindowMinutes", () => {
  it("returns local start/end minutes when startAt/endAt match date", () => {
    const win = getAppointmentGridWindowMinutes({
      date: "2026-06-05",
      startAt: new Date(2026, 5, 5, 2, 20, 0),
      endAt: new Date(2026, 5, 5, 2, 35, 0),
    })
    expect(win).toEqual({ startM: 140, endM: 155 })
  })

  it("returns null when date mismatches startAt calendar day", () => {
    expect(
      getAppointmentGridWindowMinutes({
        date: "2026-06-06",
        startAt: new Date(2026, 5, 5, 10, 0, 0),
        endAt: new Date(2026, 5, 5, 11, 0, 0),
      })
    ).toBeNull()
  })
})

describe("getBookingGroupSiblings", () => {
  const a = { _id: "a", bookingGroupId: "g1" as string | null, date: "2026-05-22" }
  const b = { _id: "b", bookingGroupId: "g1" as string | null, date: "2026-05-22" }
  const c = { _id: "c", bookingGroupId: null as string | null, date: "2026-05-22" }
  const d = { _id: "d", bookingGroupId: "g1" as string | null, date: "2026-05-23" }

  it("returns only anchor when no bookingGroupId", () => {
    expect(getBookingGroupSiblings([a, b, c], c)).toEqual([c])
  })

  it("returns same-day members of the group", () => {
    expect(getBookingGroupSiblings([a, b, d], a)).toEqual([a, b])
  })

  it("excludes siblings on a different calendar date", () => {
    expect(getBookingGroupSiblings([a, b, d], d)).toEqual([d])
  })
})

describe("getAppointmentIdsForCardStatusUpdate", () => {
  const loaded = [
    { _id: "a1", bookingGroupId: "g1", date: "2026-05-22" },
    { _id: "a2", bookingGroupId: "g1", date: "2026-05-22" },
    { _id: "a3", bookingGroupId: "g1", date: "2026-05-23" },
  ]

  it("syncs arrived only to same-day group siblings", () => {
    expect(getAppointmentIdsForCardStatusUpdate(loaded[0], loaded, "arrived")).toEqual(["a1", "a2"])
  })

  it("service_started updates only the acted-on card", () => {
    expect(getAppointmentIdsForCardStatusUpdate(loaded[0], loaded, "service_started")).toEqual(["a1"])
  })
})

describe("isOnlineBookingAppointment", () => {
  it("matches leadSource online_booking", () => {
    expect(isOnlineBookingAppointment({ leadSource: "online_booking" })).toBe(true)
  })

  it("matches createdBy online_booking", () => {
    expect(isOnlineBookingAppointment({ createdBy: "online_booking" })).toBe(true)
  })

  it("ignores walk-in and staff-created appointments", () => {
    expect(isOnlineBookingAppointment({ leadSource: "Walk-in", createdBy: "Jane" })).toBe(false)
    expect(isOnlineBookingAppointment(null)).toBe(false)
  })
})

describe("collectSaleLinesFromAppointmentCard", () => {
  it("single service line when no additionalServices", () => {
    const lines = collectSaleLinesFromAppointmentCard({
      staffId: { _id: "s1", name: "Sam" },
      serviceId: { _id: "svc1", price: 500 },
      price: 500,
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      serviceId: "svc1",
      staffId: "s1",
      staffName: "Sam",
      price: 500,
    })
  })

  it("primary + additional services", () => {
    const lines = collectSaleLinesFromAppointmentCard({
      staffId: { _id: "s1", name: "Sam" },
      serviceId: { _id: "p1", price: 500 },
      price: 500,
      additionalServices: [{ _id: "a1", price: 200 }],
    })
    expect(lines).toHaveLength(2)
    expect(lines[0].serviceId).toBe("p1")
    expect(lines[1].serviceId).toBe("a1")
  })
})

describe("buildRaiseSaleAppointmentPayload", () => {
  it("includes linked ids and services for Quick Sale URL", () => {
    const anchor = {
      _id: "ap1",
      bookingGroupId: "bg",
      clientId: { _id: "c1", name: "Jane" },
      date: "2026-01-01",
      time: "10:00",
      serviceId: { name: "Cut" },
      price: 100,
      duration: 60,
      staffId: { _id: "s1", name: "Sam" },
    }
    const siblings = [anchor, { ...anchor, _id: "ap2" }]
    const services = [
      { serviceId: "x1", staffId: "s1", staffName: "Sam", price: 100 },
    ]
    const payload = buildRaiseSaleAppointmentPayload(anchor, siblings, services)
    expect(payload.appointmentId).toBe("ap1")
    expect(payload.linkedAppointmentIds).toEqual(["ap1", "ap2"])
    expect(payload.services).toEqual(services)
    expect(payload.clientName).toBe("Jane")
  })
})
