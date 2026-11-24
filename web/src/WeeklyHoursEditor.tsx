import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError } from './api'
import { formatHours } from './load'

type Props = {
  name: string
  weeklyHours: number
  /** Resolves once the save is stored and the grid shows fresh numbers; rejects to keep the editor open. */
  onSave: (weeklyHours: number) => Promise<void>
}

type Mode =
  | { kind: 'view' }
  | { kind: 'edit'; draft: string; error: string | null }
  | { kind: 'saving'; draft: string }

const MAX_HOURS = 168

function validate(draft: string): number | string {
  if (draft.trim() === '') return 'Enter a number of hours.'
  const hours = Number(draft)
  if (!Number.isFinite(hours)) return 'Enter a number of hours.'
  if (hours < 0 || hours > MAX_HOURS) return `Weekly hours must be between 0 and ${MAX_HOURS}.`
  return hours
}

// WeeklyHoursEditor shows a person's capacity and edits it in place. A failed
// save keeps the editor open with what the manager typed and the reason, so
// nothing is lost and they can retry or cancel.
export function WeeklyHoursEditor({ name, weeklyHours, onSave }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode.kind === 'edit') inputRef.current?.focus()
  }, [mode.kind])

  if (mode.kind === 'view') {
    return (
      <button
        type="button"
        className="hours-button"
        title={`Edit ${name}'s weekly hours`}
        aria-label={`Weekly hours for ${name}: ${formatHours(weeklyHours)}. Edit`}
        onClick={() => setMode({ kind: 'edit', draft: String(weeklyHours), error: null })}
      >
        {formatHours(weeklyHours)}h
      </button>
    )
  }

  const saving = mode.kind === 'saving'
  const error = mode.kind === 'edit' ? mode.error : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mode.kind !== 'edit') return
    const parsed = validate(mode.draft)
    if (typeof parsed === 'string') {
      setMode({ ...mode, error: parsed })
      return
    }
    if (parsed === weeklyHours) {
      setMode({ kind: 'view' })
      return
    }
    const draft = mode.draft
    setMode({ kind: 'saving', draft })
    try {
      await onSave(parsed)
      setMode({ kind: 'view' })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Saving failed. Try again.'
      setMode({ kind: 'edit', draft, error: `Not saved: ${message}` })
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !saving) setMode({ kind: 'view' })
  }

  return (
    <form className="hours-form" onSubmit={submit} onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_HOURS}
        step="any"
        value={mode.draft}
        disabled={saving}
        aria-label={`Weekly hours for ${name}`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setMode({ kind: 'edit', draft: e.target.value, error: null })}
      />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" disabled={saving} onClick={() => setMode({ kind: 'view' })}>
        Cancel
      </button>
      {error && (
        <p className="hours-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
