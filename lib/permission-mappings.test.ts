import { describe, expect, it } from "vitest"
import { staffDirectoryTabPermissionGranted } from "./permission-mappings"

const denyAll = () => false
const allowPayrollSettings = (module: string, feature: string) =>
  module === "payroll_settings" && feature === "view"

describe("staffDirectoryTabPermissionGranted", () => {
  it("denies payroll tab when payroll tab is explicitly disabled but timesheet is enabled", () => {
    const permissions = [
      { module: "staff_timesheet", feature: "view", enabled: true },
      { module: "staff_payroll", feature: "view", enabled: false },
      { module: "staff_payroll", feature: "create", enabled: false },
      { module: "payroll_settings", feature: "view", enabled: true },
    ]
    expect(
      staffDirectoryTabPermissionGranted(permissions, "staff_payroll", "view", allowPayrollSettings),
    ).toBe(false)
  })

  it("allows payroll tab when staff_payroll view is enabled", () => {
    const permissions = [{ module: "staff_payroll", feature: "view", enabled: true }]
    expect(
      staffDirectoryTabPermissionGranted(permissions, "staff_payroll", "view", denyAll),
    ).toBe(true)
  })

  it("falls back to payroll_settings for legacy users without granular tabs", () => {
    const permissions = [{ module: "payroll_settings", feature: "view", enabled: true }]
    expect(
      staffDirectoryTabPermissionGranted(permissions, "staff_payroll", "view", allowPayrollSettings),
    ).toBe(true)
  })
})
