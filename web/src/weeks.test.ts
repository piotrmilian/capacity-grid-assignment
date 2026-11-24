import { describe, expect, it, vi } from 'vitest'
import { MAX_WEEKS, addDays, isValidDate, localToday, mondayOf, normalizeRange, rangeStartingAt, shiftRange, weekCount } from './weeks'

// Run west of UTC: local getters would put 2025-12-29 on a Sunday here.
vi.stubEnv('TZ', 'America/Los_Angeles')

describe('mondayOf', () => {
  it('runs west of UTC', () => {
    expect(new Date('2025-12-29').getDay()).toBe(0) // the trap mondayOf avoids
  })

  it('is stable on a Monday regardless of the local time zone', () => {
    expect(mondayOf('2025-12-29')).toBe('2025-12-29')
  })

  it('crosses the year boundary', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29')
    expect(mondayOf('2026-01-04')).toBe('2025-12-29') // Sunday belongs to the week before
  })
})

describe('normalizeRange', () => {
  it('snaps to whole Monday–Sunday weeks', () => {
    expect(normalizeRange('2025-12-31', '2026-01-16')).toEqual({ from: '2025-12-29', to: '2026-01-18' })
  })

  it('repairs an inverted range around the end the user changed', () => {
    expect(normalizeRange('2026-02-04', '2026-01-10', 'from')).toEqual({ from: '2026-02-02', to: '2026-02-08' })
    expect(normalizeRange('2026-02-04', '2026-01-10', 'to')).toEqual({ from: '2026-01-05', to: '2026-01-11' })
  })

  it('caps the span at MAX_WEEKS', () => {
    const r = normalizeRange('2025-06-02', '2027-01-03', 'from')
    expect(r.from).toBe('2025-06-02')
    expect(weekCount(r)).toBe(MAX_WEEKS)
  })
})

describe('navigation', () => {
  const range = { from: '2025-12-29', to: '2026-01-18' }

  it('shifts by whole weeks keeping the span', () => {
    expect(shiftRange(range, -1)).toEqual({ from: '2025-12-22', to: '2026-01-11' })
    expect(weekCount(shiftRange(range, 5))).toBe(3)
  })

  it('jumps to the current week keeping the span', () => {
    expect(rangeStartingAt(range, '2026-11-26')).toEqual({ from: '2026-11-23', to: '2026-12-13' })
  })
})

describe('dates', () => {
  it('rejects impossible dates', () => {
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('2026-2-3')).toBe(false)
    expect(isValidDate('2026-02-28')).toBe(true)
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2025-12-29', 7)).toBe('2026-01-05')
  })

  it('reads today from the local calendar', () => {
    // 23:30 local on the 24th is already the 25th in UTC.
    expect(localToday(new Date(2026, 10, 24, 23, 30))).toBe('2026-11-24')
  })
})
