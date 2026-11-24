import { useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { RangeControls } from './RangeControls'
import { isValidDate, normalizeRange, type Range } from './weeks'

// The range the grid loads when the URL doesn't say otherwise.
const DEFAULT_FROM = '2025-12-29'
const DEFAULT_TO = '2026-01-16'

// The range lives in the URL (?from=&to=) so a reload or a shared link shows
// the same weeks.
function initialRange(): Range {
  const params = new URLSearchParams(window.location.search)
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (isValidDate(from) && isValidDate(to)) return normalizeRange(from, to)
  return normalizeRange(DEFAULT_FROM, DEFAULT_TO)
}

export function App() {
  const [range, setRange] = useState(initialRange)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('from', range.from)
    url.searchParams.set('to', range.to)
    window.history.replaceState(null, '', url)
  }, [range])

  return (
    <main>
      <h1>Team capacity</h1>
      <RangeControls range={range} onChange={setRange} />
      <CapacityGrid from={range.from} to={range.to} />
    </main>
  )
}