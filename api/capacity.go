package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

const (
	dateLayout = "2006-01-02"
	maxWeeks = 53
	defaultLimit = 100
	maxLimit     = 500
)

// This is the grid's view of a date range: one column per week, one row per person, cells aligned by index with Weeks.
type capacityResponse struct {
	From   string           `json:"from"`  // Monday of the first week
	To     string           `json:"to"`    // Sunday of the last week
	Weeks  []string         `json:"weeks"` // Monday of each week, ascending
	People []personCapacity `json:"people"`
	Total  int              `json:"total"`
	Limit  int              `json:"limit"`
	Offset int              `json:"offset"`
}

type personCapacity struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	WeeklyHours float64    `json:"weeklyHours"`
	Weeks       []weekCell `json:"weeks"`
}

// weekCell carries capacity per week rather than once per person so that
// per-week capacity (holidays, effective-dated contracts) can arrive later
// without changing the shape the grid reads.
type weekCell struct {
	Allocated float64 `json:"allocated"`
	Capacity  float64 `json:"capacity"`
}

// GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD[&limit=&offset=]
// The range is widened to whole ISO weeks (Monday–Sunday) so every column means the same thing; the effective range is echoed back in from/to.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	firstWeek, lastWeek, err := parseWeekRange(q.Get("from"), q.Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	limit, err := parseIntParam(q.Get("limit"), defaultLimit, 1, maxLimit, "limit")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	offset, err := parseIntParam(q.Get("offset"), 0, 0, 1<<31-1, "offset")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	people, total, err := s.queryCapacity(r, firstWeek, lastWeek, limit, offset)
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load capacity")
		return
	}

	var weeks []string
	for wk := firstWeek; !wk.After(lastWeek); wk = wk.AddDate(0, 0, 7) {
		weeks = append(weeks, wk.Format(dateLayout))
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:   firstWeek.Format(dateLayout),
		To:     lastWeek.AddDate(0, 0, 6).Format(dateLayout),
		Weeks:  weeks,
		People: people,
		Total:  total,
		Limit:  limit,
		Offset: offset,
	})
}

// capacitySQL returns one row per person on the page, with allocated hours and capacity as arrays ordered by week.
//
// Allocation counts weekdays only: an assignment contributes hours_per_day
// for each Monday–Friday it covers. Because a week's weekdays are the
// contiguous span [monday, monday+4], the overlap is a single subtraction —
// no per-day expansion, so cost scales with assignments × weeks touched.
//
// $1 first Monday, $2 last Monday, $3 limit, $4 offset.
const capacitySQL = `
WITH weeks AS (
  SELECT d::date AS week_start
  FROM generate_series($1::date, $2::date, interval '7 days') AS d
),
page AS (
  SELECT id, name, weekly_hours
  FROM people
  ORDER BY name, id
  LIMIT $3 OFFSET $4
),
alloc AS (
  SELECT a.person_id,
         w.week_start,
         sum(a.hours_per_day * (
               least(a.end_date, w.week_start + 4)
             - greatest(a.start_date, w.week_start) + 1
         )) AS hours
  FROM assignments a
  JOIN page p  ON p.id = a.person_id
  JOIN weeks w ON a.start_date <= w.week_start + 4
              AND a.end_date   >= w.week_start
  WHERE a.start_date <= $2::date + 4
    AND a.end_date   >= $1::date
  GROUP BY a.person_id, w.week_start
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       array_agg(round(coalesce(al.hours, 0), 2)::float8 ORDER BY w.week_start)
FROM page p
CROSS JOIN weeks w
LEFT JOIN alloc al ON al.person_id = p.id AND al.week_start = w.week_start
GROUP BY p.id, p.name, p.weekly_hours
ORDER BY p.name, p.id
`

func (s *server) queryCapacity(r *http.Request, firstWeek, lastWeek time.Time, limit, offset int) ([]personCapacity, int, error) {
	ctx := r.Context()

	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM people`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count people: %w", err)
	}

	rows, err := s.db.Query(ctx, capacitySQL, firstWeek, lastWeek, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	people := []personCapacity{}
	for rows.Next() {
		var (
			p         personCapacity
			allocated []float64
		)
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours, &allocated); err != nil {
			return nil, 0, err
		}
		p.Weeks = make([]weekCell, len(allocated))
		for i, a := range allocated {
			p.Weeks[i] = weekCell{Allocated: a, Capacity: p.WeeklyHours}
		}
		people = append(people, p)
	}
	return people, total, rows.Err()
}

// parseWeekRange parses from/to and snaps them to the Mondays of the ISO weeks that contain them. Both are inclusive.
func parseWeekRange(fromStr, toStr string) (firstWeek, lastWeek time.Time, err error) {
	if fromStr == "" || toStr == "" {
		return time.Time{}, time.Time{}, errors.New("from and to are required (YYYY-MM-DD)")
	}
	from, err := time.Parse(dateLayout, fromStr)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("from: expected YYYY-MM-DD, got %q", fromStr)
	}
	to, err := time.Parse(dateLayout, toStr)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("to: expected YYYY-MM-DD, got %q", toStr)
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, errors.New("to must not be before from")
	}

	firstWeek, lastWeek = mondayOf(from), mondayOf(to)
	if weeks := int(lastWeek.Sub(firstWeek).Hours()/24/7) + 1; weeks > maxWeeks {
		return time.Time{}, time.Time{}, fmt.Errorf("range spans %d weeks; at most %d allowed", weeks, maxWeeks)
	}
	return firstWeek, lastWeek, nil
}

// mondayOf returns the Monday of t's ISO week. t is a UTC date, so there are no DST shifts to account for.
func mondayOf(t time.Time) time.Time {
	daysSinceMonday := (int(t.Weekday()) + 6) % 7
	return t.AddDate(0, 0, -daysSinceMonday)
}

func parseIntParam(raw string, def, min, max int, name string) (int, error) {
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, min, max)
	}
	return n, nil
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}