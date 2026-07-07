import { BusinessAPI, SettingsAPI } from "@/lib/api"
import { mergePayslipBusinessSources, type PayslipBusinessInfo } from "@/lib/payroll-export"

/** Load business header details for payslips (settings + main business profile). */
export async function resolvePayslipBusiness(): Promise<PayslipBusinessInfo> {
  const [settingsRes, infoRes] = await Promise.allSettled([
    SettingsAPI.getBusinessSettings(),
    BusinessAPI.getInfo(),
  ])

  const settings =
    settingsRes.status === "fulfilled" && settingsRes.value?.success
      ? settingsRes.value.data
      : null
  const info =
    infoRes.status === "fulfilled" && infoRes.value?.success ? infoRes.value.data : null

  return mergePayslipBusinessSources(settings, info)
}
