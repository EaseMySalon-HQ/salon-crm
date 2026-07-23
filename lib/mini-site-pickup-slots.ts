import type { SiteProfile } from '@/lib/public-site-api'

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

type WeekDay = (typeof WEEKDAY_KEYS)[number]

export type PickupSlotOption = {
  value: string
  label: string
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function parseTimeToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function formatMinutes12h(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours24 >= 12 ? 'PM' : 'AM'
  let hours12 = hours24 % 12
  if (hours12 === 0) hours12 = 12
  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`
}

function formatSlotRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutes12h(startMinutes)} – ${formatMinutes12h(endMinutes)}`
}

function dayHeading(date: Date, today: Date): string {
  const diffDays = Math.round(
    (startOfDay(date).getTime() - startOfDay(today).getTime()) / 86_400_000
  )
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function slotsForDay(
  date: Date,
  dayHours: { open?: string; close?: string; closed?: boolean } | undefined,
  intervalMinutes: number,
  today: Date,
  now: Date
): PickupSlotOption[] {
  if (!dayHours || dayHours.closed) return []

  const openMinutes = parseTimeToMinutes(dayHours.open || '')
  const closeMinutes = parseTimeToMinutes(dayHours.close || '')
  if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) return []

  const isToday = startOfDay(date).getTime() === startOfDay(today).getTime()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const heading = dayHeading(date, today)
  const options: PickupSlotOption[] = []

  for (let start = openMinutes; start + intervalMinutes <= closeMinutes; start += intervalMinutes) {
    if (isToday && start <= nowMinutes) continue
    const end = start + intervalMinutes
    const range = formatSlotRange(start, end)
    options.push({
      value: `${heading}, ${range}`,
      label: `${heading}, ${range}`,
    })
  }

  return options
}

/**
 * Build 2-hour pickup slot options from salon operating hours for upcoming open days.
 */
export function buildPickupSlotOptions(
  operatingHours: SiteProfile['operatingHours'] | undefined,
  opts?: { daysAhead?: number; intervalMinutes?: number; now?: Date }
): PickupSlotOption[] {
  const daysAhead = Math.min(Math.max(opts?.daysAhead ?? 7, 1), 14)
  const intervalMinutes = opts?.intervalMinutes ?? 120
  const now = opts?.now ?? new Date()
  const today = startOfDay(now)
  const hours = operatingHours || {}
  const out: PickupSlotOption[] = []

  for (let offset = 0; offset < daysAhead; offset += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + offset)
    const key = WEEKDAY_KEYS[date.getDay()] as WeekDay
    out.push(...slotsForDay(date, hours[key], intervalMinutes, today, now))
  }

  return out
}
