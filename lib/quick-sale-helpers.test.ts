import { describe, it, expect } from "vitest"
import {
  decodeQuickSaleAppointmentParam,
  extractAppointmentIdsFromPayload,
  resolveAppointmentIdsToComplete,
  calendarYmdLocal,
  raiseSaleLinkageSnapshotFromCheckoutState,
  areRaiseSaleLinkageSnapshotsEqual,
  billNotesForCustomerDisplay,
} from "./quick-sale-helpers"

describe("decodeQuickSaleAppointmentParam", () => {
  it("decodes valid base64 JSON", () => {
    const payload = { appointmentId: "a1", clientId: "c1" }
    const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64")
    const out = decodeQuickSaleAppointmentParam(b64)
    expect(out).toEqual(payload)
  })

  it("returns null for invalid base64", () => {
    expect(decodeQuickSaleAppointmentParam("not!!!")).toBeNull()
  })

  it("returns null for non-object JSON", () => {
    const b64 = Buffer.from(JSON.stringify("string"), "utf8").toString("base64")
    expect(decodeQuickSaleAppointmentParam(b64)).toBeNull()
  })
})

describe("extractAppointmentIdsFromPayload", () => {
  it("reads appointmentId", () => {
    const r = extractAppointmentIdsFromPayload({ appointmentId: "x" })
    expect(r.primaryId).toBe("x")
    expect(r.linkedIds).toEqual([])
  })

  it("prefers appointmentId over appointmentID and id", () => {
    const r = extractAppointmentIdsFromPayload({
      appointmentId: "first",
      appointmentID: "second",
      id: "third",
    })
    expect(r.primaryId).toBe("first")
  })

  it("falls back to appointmentID then id", () => {
    expect(extractAppointmentIdsFromPayload({ appointmentID: "b" }).primaryId).toBe("b")
    expect(extractAppointmentIdsFromPayload({ id: "c" }).primaryId).toBe("c")
  })

  it("normalizes linkedAppointmentIds", () => {
    const r = extractAppointmentIdsFromPayload({
      linkedAppointmentIds: ["a", "b", "", null],
    })
    expect(r.linkedIds).toEqual(["a", "b"])
  })
})

describe("resolveAppointmentIdsToComplete", () => {
  it("uses linked list when non-empty", () => {
    expect(resolveAppointmentIdsToComplete(["a", "b"], "ignored")).toEqual(["a", "b"])
  })

  it("falls back to primary id", () => {
    expect(resolveAppointmentIdsToComplete([], "p1")).toEqual(["p1"])
  })

  it("returns empty when nothing set", () => {
    expect(resolveAppointmentIdsToComplete([], null)).toEqual([])
    expect(resolveAppointmentIdsToComplete([], undefined)).toEqual([])
  })
})

describe("raiseSaleLinkageSnapshot / drift detection", () => {
  const baseInput = () => ({
    clientId: "c1",
    dateYYYYMMDD: "2026-05-03",
    remarksNormalized: "Hello",
    serviceLines: [
      { serviceId: "s2", staffId: "st1", quantity: 1 },
      { serviceId: "s1", staffId: "st1", quantity: 1 },
    ],
    extraProducts: 0,
    extraMemberships: 0,
    extraPackages: 0,
    extraPrepaid: 0,
  })

  it("calendarYmdLocal uses local date parts", () => {
    expect(calendarYmdLocal(new Date(2026, 4, 3))).toBe("2026-05-03")
  })

  it("snapshots equal when service order differs (sorted)", () => {
    const a = raiseSaleLinkageSnapshotFromCheckoutState(baseInput())
    const b = raiseSaleLinkageSnapshotFromCheckoutState({
      ...baseInput(),
      serviceLines: [...baseInput().serviceLines].reverse(),
    })
    expect(a.serviceRowsJson).toBe(b.serviceRowsJson)
    expect(areRaiseSaleLinkageSnapshotsEqual(a, b)).toBe(true)
  })

  it("normalizes remarks — case-insensitive equality", () => {
    const a = raiseSaleLinkageSnapshotFromCheckoutState(baseInput())
    const b = raiseSaleLinkageSnapshotFromCheckoutState({
      ...baseInput(),
      remarksNormalized: "HELLO",
    })
    expect(areRaiseSaleLinkageSnapshotsEqual(a, b)).toBe(true)
  })

  it("detects remarks text change", () => {
    const a = raiseSaleLinkageSnapshotFromCheckoutState(baseInput())
    const b = raiseSaleLinkageSnapshotFromCheckoutState({
      ...baseInput(),
      remarksNormalized: "other",
    })
    expect(areRaiseSaleLinkageSnapshotsEqual(a, b)).toBe(false)
  })

  it("detects extra product line", () => {
    const a = raiseSaleLinkageSnapshotFromCheckoutState(baseInput())
    const b = raiseSaleLinkageSnapshotFromCheckoutState({ ...baseInput(), extraProducts: 1 })
    expect(areRaiseSaleLinkageSnapshotsEqual(a, b)).toBe(false)
  })

  it("detects quantity change", () => {
    const a = raiseSaleLinkageSnapshotFromCheckoutState(baseInput())
    const b = raiseSaleLinkageSnapshotFromCheckoutState({
      ...baseInput(),
      serviceLines: [{ serviceId: "s1", staffId: "st1", quantity: 2 }],
    })
    expect(areRaiseSaleLinkageSnapshotsEqual(a, b)).toBe(false)
  })
})

describe("billNotesForCustomerDisplay", () => {
  it("passes through appointment and sale remarks", () => {
    expect(billNotesForCustomerDisplay("Color touch-up\n\nUse gentle shampoo")).toBe(
      "Color touch-up\n\nUse gentle shampoo"
    )
  })

  it("strips checkout tip summary suffix", () => {
    const raw =
      "Appt note\n\nSale note\n\nTip: Alex ₹100.00, Bee ₹50.00"
    expect(billNotesForCustomerDisplay(raw)).toBe("Appt note\n\nSale note")
  })
})
