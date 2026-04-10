import { describe, it, expect } from "vitest"
import {
  decodeQuickSaleAppointmentParam,
  extractAppointmentIdsFromPayload,
  resolveAppointmentIdsToComplete,
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
