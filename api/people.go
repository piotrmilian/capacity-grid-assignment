package main

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

const maxWeeklyHours = 168

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// updatePersonRequest uses a pointer to tell the difference between
// a missing value and zero, since someone on leave may have no capacity.
type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id} with body {"weeklyHours": n}.
//
// Returns the saved person. After a successful save, the grid fetches
// the current range again so all capacity calculations stay in the database.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "id must be a positive integer")
		return
	}

	var req updatePersonRequest
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, `body must be {"weeklyHours": number}`)
		return
	}
	if req.WeeklyHours == nil {
		writeError(w, http.StatusBadRequest, "weeklyHours is required")
		return
	}
	hours := *req.WeeklyHours
	if math.IsNaN(hours) || hours < 0 || hours > maxWeeklyHours {
		writeError(w, http.StatusUnprocessableEntity, "weeklyHours must be between 0 and 168")
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(), `
		UPDATE people
		SET weekly_hours = $2
		WHERE id = $1
		RETURNING id, name, weekly_hours::float8`,
		id, hours,
	).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "person not found")
		return
	}
	if err != nil {
		log.Printf("update person %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "could not save weekly hours")
		return
	}

	writeJSON(w, http.StatusOK, p)
}
