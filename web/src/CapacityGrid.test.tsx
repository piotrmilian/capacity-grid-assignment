import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CapacityPage } from './api'
import { CapacityGrid } from './CapacityGrid'

function page(weeklyHours: number): CapacityPage {
  return {
    from: '2026-01-05',
    to: '2026-01-11',
    weeks: ['2026-01-05'],
    people: [{ id: 4, name: 'Dee Okafor', weeklyHours, weeks: [{ allocated: 45, capacity: weeklyHours }] }],
    total: 1,
    limit: 100,
    offset: 0,
  }
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function editHours(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Weekly hours for Dee Okafor/ }))
  const input = screen.getByRole('spinbutton', { name: 'Weekly hours for Dee Okafor' })
  fireEvent.change(input, { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

describe('CapacityGrid editing', () => {
  it('shows server numbers after a successful save', async () => {
    let stored = 40
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        stored = JSON.parse(String(init.body)).weeklyHours
        return json({ id: 4, name: 'Dee Okafor', weeklyHours: stored })
      }
      return json(page(stored))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CapacityGrid from="2026-01-05" to="2026-01-11" />)
    const cell = await screen.findByTitle(/45h allocated of 40h/)
    expect(cell).toHaveClass('cell-over')

    await editHours('48')

    const updated = await screen.findByTitle(/45h allocated of 48h/)
    expect(updated).toHaveClass('cell-partial')
    expect(screen.getByRole('button', { name: /Weekly hours for Dee Okafor: 48/ })).toBeInTheDocument()
    // Refetched the range rather than trusting local state.
    expect(fetchMock.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2)
  })

  it('keeps the typed value and shows the reason when a save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'PATCH' ? json({ error: 'could not save weekly hours' }, 500) : json(page(40)),
      ),
    )

    render(<CapacityGrid from="2026-01-05" to="2026-01-11" />)
    await editHours('48')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Not saved: could not save weekly hours')
    expect(screen.getByRole('spinbutton', { name: 'Weekly hours for Dee Okafor' })).toHaveValue(48)
    // The grid still shows what the server has, not the failed value.
    expect(screen.getByTitle(/45h allocated of 40h/)).toHaveClass('cell-over')
  })

  it('reports a network failure on load with a retry', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockImplementation(() => json(page(40)))
    vi.stubGlobal('fetch', fetchMock)

    render(<CapacityGrid from="2026-01-05" to="2026-01-11" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not reach the server')

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTitle(/45h allocated of 40h/)).toBeInTheDocument()
  })
})
