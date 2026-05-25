/** Today's date as YYYY-MM-DD in Asia/Kolkata. */
export function todayYmdIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Build IST wall-time ISO strings for scheduling APIs. */
export function isoRangeIST(
  ymd: string,
  timeHHmm: string,
  durationMinutes: number
): { startAt: string; endAt: string } {
  const [h, mi] = timeHHmm.split(":").map((x) => parseInt(x, 10))
  const hh = Number.isFinite(h) ? h : 0
  const mm = Number.isFinite(mi) ? mi : 0
  const startAt = `${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`
  const start = new Date(startAt)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = f.formatToParts(end)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const endAt = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+05:30`
  return { startAt, endAt }
}
