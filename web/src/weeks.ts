// Date helpers for the week grid.
//
// Dates travel as 'YYYY-MM-DD' strings and all arithmetic is done in UTC.
// `new Date('2025-12-29').getDay()` reads the day in the *local* zone, which
// west of UTC is the Sunday before — exactly the off-by-one that would put
// every column in the wrong week. Never use the local getters here.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The server rejects wider requests (api/capacity.go maxWeeks). */
export const MAX_WEEKS = 53

export type Range = {
  /** Monday of the first week. */
  from: string
  /** Sunday of the last week. */
  to: string
}

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function toDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`)
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(s: string, days: number): string {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

export function mondayOf(s: string): string {
  const daysSinceMonday = (toDate(s).getUTCDay() + 6) % 7
  return addDays(s, -daysSinceMonday)
}

export function sundayOf(s: string): string {
  return addDays(mondayOf(s), 6)
}

/** Number of whole weeks a snapped range covers. */
export function weekCount(range: Range): number {
  const days = (toDate(range.to).getTime() - toDate(range.from).getTime()) / 86_400_000
  return Math.round((days + 1) / 7)
}

/**
 * Snap any from/to to whole weeks and keep the span within MAX_WEEKS.
 * `anchor` is the end the user just changed; the other end moves to fit.
 */
export function normalizeRange(from: string, to: string, anchor: 'from' | 'to' = 'from'): Range {
  let start = mondayOf(from)
  let end = sundayOf(to)
  if (end < start) {
    if (anchor === 'from') end = addDays(start, 6)
    else start = mondayOf(end)
  }
  if (weekCount({ from: start, to: end }) > MAX_WEEKS) {
    if (anchor === 'from') end = addDays(start, MAX_WEEKS * 7 - 1)
    else start = addDays(end, -(MAX_WEEKS * 7 - 1))
  }
  return { from: start, to: end }
}

export function shiftRange(range: Range, weeks: number): Range {
  return { from: addDays(range.from, weeks * 7), to: addDays(range.to, weeks * 7) }
}

/** Same span, starting at the week containing `today`. */
export function rangeStartingAt(range: Range, today: string): Range {
  const from = mondayOf(today)
  return { from, to: addDays(from, weekCount(range) * 7 - 1) }
}

/** Today's date as the manager's calendar sees it (local, not UTC). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDay(s: string, withYear = false): string {
  return (withYear ? dayMonthYear : dayMonth).format(toDate(s))
}
