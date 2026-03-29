/** Client-purchased package row: redeemable today (active, not expired, has sittings left). */
export function isClientPackageRedeemable(cp: unknown): boolean {
  const row = cp as {
    status?: string
    remaining_sittings?: number
    expiry_date?: string | Date | null
  }
  if (!row || row.status !== "ACTIVE") return false
  if (Number(row.remaining_sittings) <= 0) return false
  if (row.expiry_date) {
    const exp = new Date(row.expiry_date)
    if (Number.isNaN(exp.getTime())) return false
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (exp < start) return false
  }
  return true
}
