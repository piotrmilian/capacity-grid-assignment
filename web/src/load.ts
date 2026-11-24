import type { WeekCell } from './api'

/**
 * How loaded a person is in one week.
 * - over:    allocated exceeds capacity (including any hours against 0 capacity)
 * - full:    allocated equals capacity
 * - partial: some hours allocated, below capacity
 * - free:    nothing allocated
 */
export type Load = 'over' | 'full' | 'partial' | 'free'

// The API rounds hours to 2 decimals; anything closer than this is "equal".
const EPSILON = 0.005

export function loadOf({ allocated, capacity }: WeekCell): Load {
  if (allocated > capacity + EPSILON) return 'over'
  if (allocated < EPSILON) return 'free'
  if (allocated >= capacity - EPSILON) return 'full'
  return 'partial'
}

/** Hours over capacity, or 0. */
export function overBy({ allocated, capacity }: WeekCell): number {
  return Math.max(0, allocated - capacity)
}

/** 37.5 → "37.5", 40 → "40", 0.125 → "0.13" */
export function formatHours(hours: number): string {
  return String(Number(hours.toFixed(2)))
}
