import { useEffect, useRef, useState } from 'react'
import { ApiError, fetchCapacity, updateWeeklyHours, type CapacityPage, type WeekCell } from './api'
import { formatHours, loadOf, overBy } from './load'
import { formatDay, localToday, mondayOf } from './weeks'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'

type Props = {
  from: string
  to: string
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong.'
}

// CapacityGrid renders one row per person and one column per week.
//
// Data flow: pages of people are fetched per range. After a weekly-hours
// save, every loaded page is refetched rather than patched locally, so the
// numbers on screen are always the server's — capacity is derived there.
//
// Async work is tagged with the range generation it started in; anything
// that finishes after the range has moved on is dropped.
export function CapacityGrid({ from, to }: Props) {
  const [pages, setPages] = useState<CapacityPage[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [staleError, setStaleError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const generation = useRef(0)
  const refreshSeq = useRef(0)
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  useEffect(() => {
    const gen = ++generation.current
    const ctrl = new AbortController()
    setLoading(true)
    setLoadError(null)
    setLoadingMore(false)
    setMoreError(null)
    setStaleError(null)

    fetchCapacity(from, to, 0, ctrl.signal)
      .then((page) => {
        if (gen === generation.current) setPages([page])
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted && gen === generation.current) setLoadError(messageOf(err))
      })
      .finally(() => {
        if (gen === generation.current) setLoading(false)
      })

    return () => ctrl.abort()
  }, [from, to, retryKey])

  async function loadMore() {
    const loaded = pagesRef.current
    if (!loaded) return
    const gen = generation.current
    const offset = loaded.reduce((n, p) => n + p.people.length, 0)
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await fetchCapacity(from, to, offset)
      if (gen === generation.current) setPages((prev) => (prev ? [...prev, next] : prev))
    } catch (err) {
      if (gen === generation.current) setMoreError(messageOf(err))
    } finally {
      if (gen === generation.current) setLoadingMore(false)
    }
  }

  async function refreshLoaded() {
    const loaded = pagesRef.current
    if (!loaded) return
    const gen = generation.current
    const seq = ++refreshSeq.current
    try {
      const fresh = await Promise.all(loaded.map((p) => fetchCapacity(from, to, p.offset)))
      if (gen !== generation.current || seq !== refreshSeq.current) return
      setPages(fresh)
      setStaleError(null)
    } catch (err) {
      if (gen !== generation.current || seq !== refreshSeq.current) return
      setStaleError(messageOf(err))
    }
  }

  // Rejects only if the save itself failed; a failed refresh after a
  // successful save is reported on the grid, not in the editor.
  async function saveHours(personId: number, weeklyHours: number) {
    await updateWeeklyHours(personId, weeklyHours)
    await refreshLoaded()
  }

  if (loadError) {
    return (
      <div className="notice notice-error" role="alert">
        <p>Could not load capacity: {loadError}</p>
        <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
          Try again
        </button>
      </div>
    )
  }

  if (!pages) {
    return (
      <p className="notice" role="status">
        Loading capacity…
      </p>
    )
  }

  const weeks = pages[0].weeks
  const people = pages.flatMap((p) => p.people)
  const total = pages[pages.length - 1].total
  const thisWeek = mondayOf(localToday())
  const overPeople = people.filter((p) => p.weeks.some((c) => loadOf(c) === 'over')).length

  return (
    <section className="capacity" aria-busy={loading}>
      <div className="summary">
        <p>
          {formatDay(pages[0].from, true)} – {formatDay(pages[0].to, true)} · showing {people.length} of {total}{' '}
          people, of whom{' '}
          <strong className={overPeople > 0 ? 'summary-over' : undefined}>{overPeople} are over capacity</strong> in
          at least one week
          {loading && <span className="busy"> · Loading…</span>}
        </p>
        <Legend />
      </div>

      {staleError && (
        <div className="notice notice-error" role="alert">
          <p>
            Saved, but the grid could not refresh, so some numbers may be out of date: {staleError}
          </p>
          <button type="button" onClick={refreshLoaded}>
            Refresh
          </button>
        </div>
      )}

      <div className={loading ? 'grid-scroll stale' : 'grid-scroll'}>
        <table className="grid">
          <thead>
            <tr>
              <th scope="col" className="col-person">
                Person
              </th>
              <th scope="col" className="col-hours">
                Weekly hours
              </th>
              {weeks.map((week, i) => (
                <th
                  scope="col"
                  key={week}
                  className={week === thisWeek ? 'col-week this-week' : 'col-week'}
                  title={`Week of ${formatDay(week, true)}`}
                >
                  {formatDay(week, i === 0 || week.slice(5) <= '01-07')}
                  {week === thisWeek && <span className="this-week-label">This week</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const overWeeks = person.weeks.filter((c) => loadOf(c) === 'over').length
              return (
                <tr key={person.id}>
                  <th scope="row" className="col-person">
                    {person.name}
                    {overWeeks > 0 && (
                      <span className="over-badge" title={`Over capacity in ${overWeeks} week(s)`}>
                        {overWeeks}w over
                      </span>
                    )}
                  </th>
                  <td className="col-hours">
                    <WeeklyHoursEditor
                      name={person.name}
                      weeklyHours={person.weeklyHours}
                      onSave={(hours) => saveHours(person.id, hours)}
                    />
                  </td>
                  {person.weeks.map((cell, i) => (
                    <Cell key={weeks[i]} cell={cell} />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {people.length < total && (
        <div className="more">
          <button type="button" onClick={loadMore} disabled={loadingMore || loading}>
            {loadingMore ? 'Loading…' : `Load ${Math.min(total - people.length, pages[0].limit)} more`}
          </button>
          {moreError && (
            <span className="inline-error" role="alert">
              Could not load more: {moreError}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

function Cell({ cell }: { cell: WeekCell }) {
  const load = loadOf(cell)
  const label = `${formatHours(cell.allocated)}h allocated of ${formatHours(cell.capacity)}h`
  return (
    <td className={`cell cell-${load}`} title={load === 'over' ? `${label} — over by ${formatHours(overBy(cell))}h` : label}>
      <span className="cell-hours">{formatHours(cell.allocated)}</span>
      {load === 'over' && <span className="cell-excess">+{formatHours(overBy(cell))}</span>}
    </td>
  )
}

function Legend() {
  return (
    <ul className="legend" aria-label="Legend">
      <li>
        <span className="swatch cell-over" /> Over capacity
      </li>
      <li>
        <span className="swatch cell-full" /> At capacity
      </li>
      <li>
        <span className="swatch cell-partial" /> Partly allocated
      </li>
      <li>
        <span className="swatch cell-free" /> Free
      </li>
    </ul>
  )
}
