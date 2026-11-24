// Client for the capacity API. Shapes mirror api/capacity.go and api/people.go.

export type WeekCell = {
  allocated: number
  capacity: number
}

export type PersonRow = {
  id: number
  name: string
  weeklyHours: number
  /** Aligned by index with CapacityPage.weeks. */
  weeks: WeekCell[]
}

export type CapacityPage = {
  /** Monday of the first week (the server snaps the range to whole weeks). */
  from: string
  /** Sunday of the last week. */
  to: string
  /** Monday of each week, ascending. */
  weeks: string[]
  people: PersonRow[]
  total: number
  limit: number
  offset: number
}

export type Person = {
  id: number
  name: string
  weeklyHours: number
}

export const PAGE_SIZE = 100

/** An error whose message is safe to show to the manager. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (init?.signal?.aborted) throw err
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }

  if (!res.ok) {
    let message = `The server returned an error (${res.status}).`
    try {
      const body: unknown = await res.json()
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        message = body.error
      }
    } catch {
      // Not JSON (e.g. a proxy error page); keep the generic message.
    }
    throw new ApiError(message, res.status)
  }
  return (await res.json()) as T
}

export function fetchCapacity(
  from: string,
  to: string,
  offset: number,
  signal?: AbortSignal,
): Promise<CapacityPage> {
  const query = new URLSearchParams({
    from,
    to,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  })
  return request<CapacityPage>(`/api/capacity?${query}`, { signal })
}

export function updateWeeklyHours(id: number, weeklyHours: number): Promise<Person> {
  return request<Person>(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
}
