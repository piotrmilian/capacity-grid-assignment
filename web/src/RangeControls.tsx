import { useEffect, useState, type FormEvent } from 'react'
import {
  MAX_WEEKS,
  isValidDate,
  localToday,
  mondayOf,
  normalizeRange,
  rangeStartingAt,
  shiftRange,
  sundayOf,
  weekCount,
  type Range,
} from './weeks'

type Props = {
  range: Range
  onChange: (range: Range) => void
}

// RangeControls moves the visible weeks. Week steps apply immediately; typed
// dates apply on "Show" so a half-typed year doesn't fire requests.
export function RangeControls({ range, onChange }: Props) {
  const [draftFrom, setDraftFrom] = useState(range.from)
  const [draftTo, setDraftTo] = useState(range.to)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    setDraftFrom(range.from)
    setDraftTo(range.to)
  }, [range.from, range.to])

  function apply(e: FormEvent) {
    e.preventDefault()
    if (!isValidDate(draftFrom) || !isValidDate(draftTo)) {
      setNote('Pick both a start and an end date.')
      return
    }
    const anchor = draftFrom !== range.from ? 'from' : 'to'
    const tooWide =
      draftTo >= draftFrom && weekCount({ from: mondayOf(draftFrom), to: sundayOf(draftTo) }) > MAX_WEEKS
    setNote(tooWide ? `Showing at most ${MAX_WEEKS} weeks at a time.` : null)
    onChange(normalizeRange(draftFrom, draftTo, anchor))
  }

  function step(weeks: number) {
    setNote(null)
    onChange(shiftRange(range, weeks))
  }

  return (
    <div className="range-controls">
      <div className="range-step" role="group" aria-label="Move by week">
        <button type="button" onClick={() => step(-1)}>
          ← Previous week
        </button>
        <button
          type="button"
          onClick={() => {
            setNote(null)
            onChange(rangeStartingAt(range, localToday()))
          }}
        >
          This week
        </button>
        <button type="button" onClick={() => step(1)}>
          Next week →
        </button>
      </div>

      <form className="range-pick" onSubmit={apply}>
        <label>
          From <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
        </label>
        <label>
          To <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
        </label>
        <button type="submit">Show</button>
        <span className="range-hint">Snaps to whole weeks (Mon–Sun) · {weekCount(range)} weeks</span>
      </form>
      {note && (
        <p className="range-note" role="status">
          {note}
        </p>
      )}
    </div>
  )
}
