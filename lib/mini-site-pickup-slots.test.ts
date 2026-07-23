import { describe, expect, it } from 'vitest'
import { buildPickupSlotOptions } from '@/lib/mini-site-pickup-slots'

const hours = {
  monday: { open: '09:00', close: '17:00', closed: false },
  tuesday: { open: '09:00', close: '17:00', closed: false },
  wednesday: { open: '09:00', close: '17:00', closed: false },
  thursday: { open: '09:00', close: '17:00', closed: false },
  friday: { open: '09:00', close: '17:00', closed: false },
  saturday: { open: '10:00', close: '16:00', closed: false },
  sunday: { open: '09:00', close: '17:00', closed: true },
}

describe('buildPickupSlotOptions', () => {
  it('creates 2-hour slots within open hours', () => {
    const now = new Date('2026-07-22T08:00:00')
    const slots = buildPickupSlotOptions(hours, { now, daysAhead: 1 })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].label).toMatch(/Today, 9:00 AM – 11:00 AM/)
    expect(slots.some((s) => s.label.includes('3:00 PM – 5:00 PM'))).toBe(true)
  })

  it('skips past slots on the current day', () => {
    const now = new Date('2026-07-22T12:30:00')
    const slots = buildPickupSlotOptions(hours, { now, daysAhead: 1 })
    expect(slots.some((s) => s.label.includes('9:00 AM – 11:00 AM'))).toBe(false)
    expect(slots.some((s) => s.label.includes('1:00 PM – 3:00 PM'))).toBe(true)
  })

  it('returns no slots when the day is closed', () => {
    const now = new Date('2026-07-26T10:00:00')
    const slots = buildPickupSlotOptions(hours, { now, daysAhead: 1 })
    expect(slots).toEqual([])
  })
})
