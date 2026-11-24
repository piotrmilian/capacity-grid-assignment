import { describe, expect, it } from 'vitest'
import { formatHours, loadOf, overBy } from './load'

describe('loadOf', () => {
  it('classifies against capacity', () => {
    expect(loadOf({ allocated: 45, capacity: 40 })).toBe('over')
    expect(loadOf({ allocated: 40, capacity: 40 })).toBe('full')
    expect(loadOf({ allocated: 30, capacity: 40 })).toBe('partial')
    expect(loadOf({ allocated: 0, capacity: 40 })).toBe('free')
  })

  it('treats any hours against zero capacity as over', () => {
    expect(loadOf({ allocated: 20, capacity: 0 })).toBe('over')
    expect(loadOf({ allocated: 0, capacity: 0 })).toBe('free')
  })

  it('does not flag rounding noise as over', () => {
    expect(loadOf({ allocated: 40.004, capacity: 40 })).toBe('full')
    expect(loadOf({ allocated: 40.01, capacity: 40 })).toBe('over')
  })
})

describe('formatting', () => {
  it('shows hours without trailing zeros', () => {
    expect(formatHours(37.5)).toBe('37.5')
    expect(formatHours(40)).toBe('40')
    expect(overBy({ allocated: 45, capacity: 40 })).toBe(5)
  })
})
