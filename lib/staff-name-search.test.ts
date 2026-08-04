import { describe, it, expect } from "vitest"
import {
  filterStaffByNamePrefix,
  staffNameMatchesPrefix,
  sortStaffByName,
} from "./staff-name-search"

describe("staff-name-search", () => {
  const staff = [
    { id: "1", name: "Ankita" },
    { id: "2", name: "Rohan" },
    { id: "3", name: "Amy" },
  ]

  it("sorts staff alphabetically", () => {
    expect(sortStaffByName(staff).map((s) => s.name)).toEqual(["Amy", "Ankita", "Rohan"])
  })

  it("matches prefix only, not letters elsewhere in the name", () => {
    expect(staffNameMatchesPrefix("Ankita", "An")).toBe(true)
    expect(staffNameMatchesPrefix("Rohan", "an")).toBe(false)
    expect(staffNameMatchesPrefix("Amy", "Am")).toBe(true)
  })

  it("filters and sorts together", () => {
    expect(filterStaffByNamePrefix(staff, "A").map((s) => s.name)).toEqual(["Amy", "Ankita"])
    expect(filterStaffByNamePrefix(staff, "Ro").map((s) => s.name)).toEqual(["Rohan"])
  })
})
