# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Capacity endpoint

- We agreed to count only weekdays when calculating allocated hours, and the seed data backs up that decision. Around 46% of assignments end on a Saturday or Sunday. Counting calendar days would put Ana at 56 hours instead of 40 for the week starting December 29, 2025, and increase the number of overallocated cells from 54 to 180 in the default range.
- One thing I noticed in the seed data is that assignments are split into roughly 15 smaller records with different IDs but identical dates. For example, fourteen records of 0.5 hours and one of 1 hour add up to 8 hours per day. These are separate allocations rather than duplicates, so I kept them all in the calculation.
- I decided to round the requested date range to full weeks, starting on Monday and ending on Sunday, and return the adjusted dates in the response. Supporting partial weeks would mean prorating capacity, which would make comparing weeks in the grid less straightforward.
- Since Monday through Friday is a continuous range, I can calculate the number of overlapping working days using least(end, mon+4) - greatest(start, mon) + 1 without generating individual dates. PostgreSQL handles the aggregation and returns one row per person with a float8[] containing their weekly allocations.
- Weekly capacity is currently the same across all weeks for a given person, but I chose to return it with each cell. This leaves room for holidays or changes in working hours over time without having to change the API response structure later.
- I limited each request to 53 weeks and added offset-based pagination for people, with a default page size of 100 and a maximum of 500. Results are ordered by name and ID, and the response includes the total number of people. Offset pagination should be sufficient for a few thousand employees, so I didn't see a reason to introduce cursor-based pagination at this stage.
- There isn't a teams table in the current schema, so the endpoint returns everyone. There's also no holiday calendar, which means January 1, 2026, is treated as a normal working day.
- I didn't get around to adding Go unit tests because I didn't have a local Go toolchain available. Instead, I wrote an independent Python script that recalculates allocations day by day using seed.sql and compares the results against the running API.
- The comparison found no mismatches across the default range (1,500 cells), a 52-week range covering 500 people (26,000 cells), and a paginated date range extending into 2027. A full-year request for 500 people took around 0.3 seconds and returned roughly 820 KB of data.
- I also checked how the endpoint handles invalid input, including malformed dates, reversed date ranges, ranges longer than 53 weeks, missing parameters, and a page size of zero. All returned a 400 response with a JSON error.

