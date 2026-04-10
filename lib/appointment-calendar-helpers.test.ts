import { describe, it, expect } from "vitest"
import {
  getServiceDisplayNames,
  getAppointmentTotalDurationList,
  getAppointmentTotalDurationGrid,
  getBookingGroupSiblings,
  collectSaleLinesFromAppointmentCard,
  buildRaiseSaleAppointmentPayload,
} from "./appointment-calendar-helpers"

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

describe("getBookingGroupSiblings", () => {
  const a = { _id: "a", bookingGroupId: "g1" as string | null }
  const b = { _id: "b", bookingGroupId: "g1" as string | null }
  const c = { _id: "c", bookingGroupId: null as string | null }

  it("returns only anchor when no bookingGroupId", () => {
    expect(getBookingGroupSiblings([a, b, c], c)).toEqual([c])
  })

  it("returns all members of the same group", () => {
    expect(getBookingGroupSiblings([a, b, c], a)).toEqual([a, b])
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
