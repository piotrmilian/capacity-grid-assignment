# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

There are things this brief doesn't specify. Which ones did you hit, what did you decide,
and why?

One of the first things I ran into was whether weekends should count toward allocated hours. The spec didn't say, so I looked at the actual data. About half of the assignments end on a Saturday or Sunday, and counting weekends would put Ana at 56 hours in the week of December 29 instead of exactly 40. It also increased the number of over-allocated cells from 54 to 180 in the default range. That was enough for me to decide that only weekdays should count.
I also came across what initially looked like duplicate assignment rows. They had the same dates but different IDs, and when I added their hours together, they worked out to exactly 8 hours per day (14 × 0.5 + 1 × 1.0). So I kept them all rather than removing what looked like duplicates. The spec wasn't clear about partial weeks either. I decided to extend the requested date range to full Monday–Sunday weeks and have the API return the actual range it used. I felt this made more sense than adjusting capacity for partial weeks, especially when comparing allocations across different weeks. There were no specific performance requirements, but I still wanted the application to work well with larger datasets. I handled aggregation in a single SQL query without expanding assignments into individual days, limited each request to 53 weeks, and paginated people 100 at a time. A full year of data for 500 people took around 0.3 seconds in my testing. Another small decision was how to handle people with zero capacity. I treated any allocated hours above zero as over-allocation. Eli, for example, has 20 allocated hours but no available capacity, so marking him as over-allocated made sense. I also had to decide what should happen after a save. I went with refetching the loaded pages instead of updating local state or using optimistic updates. Since the server already handles capacity calculations, I didn't want to duplicate that logic on the client. I'd also rather have managers looking at confirmed numbers than numbers that could potentially be rolled back. The extra request seemed like a reasonable trade-off.
For failed saves, I kept the editor open with the user's input and the error returned by the server, while leaving the grid unchanged. If the save succeeds but the refresh fails, the user gets a banner with a Refresh button instead of having to submit the changes again. Finally, the brief mentions managers viewing "their team," but there isn't a teams table or any relationship defining who belongs to which team. Rather than introducing something outside the scope of the brief, I decided to include everyone.

## What did you notice that looked wrong?

Anything in the output that didn't match what you expected. Whether you fixed it or left
it, we want to know you saw it.

One thing I noticed was that January 1 was being counted as a normal working day. Since there isn't a holidays table in the database, I left it as it was rather than hardcoding holidays into the application. I also noticed that changing someone's `weekly_hours` affects their capacity for past weeks as well, not just future ones. That's fine if you're only using the tool to plan ahead, but it gives misleading results when looking back. Ideally, capacity changes would have effective dates so historical values could be preserved. Since the schema was fixed, I left that behavior unchanged. Something else that stood out was the "N over capacity" count in the header. It only reflects the people loaded so far, not everyone in the database. I changed the wording to make that clear, although a proper fix would be to calculate the count on the server.
There's also a potential issue when two managers edit the same person at the same time. Whoever saves last overwrites the other person's changes without any warning. I left this as a known limitation.
Finally, Eli has 20 hours of work assigned against zero available capacity. The grid correctly marks him as over-allocated, so I didn't change anything there. In a real-world scenario, though, I'd want to clarify whether zero capacity means he's on leave or whether his capacity simply hasn't been entered yet. Those are two very different situations.

## What did the AI get wrong that you caught?

I caught an issue while testing the application with a throttled network. I changed someone's hours and clicked "Load more" while the save was still in progress. Once the refresh finished, the page I'd just loaded disappeared from the grid. It turned out that the AI-generated code was taking a snapshot of the loaded pages before making the request, so any pages loaded during that time were lost when the refresh completed. I fixed it by disabling the "Load more" button while the refresh is in progress.

## What would you do differently with a week?

With a week, I'd start by improving how capacity is tracked. I'd make capacity changes effective from a specific date so they don't affect historical data, and I'd add support for public holidays and time off to make allocation numbers more realistic. I'd also move the over-allocation count and filtering to the server. A manager dealing with thousands of people should be able to see who's over-allocated without having to load everyone first. Along with that, I'd add row virtualization to keep the grid responsive when working with larger teams. Another thing I'd address is concurrent editing. I'd add a version or ETag check to the PATCH endpoint so that two managers can't accidentally overwrite each other's changes without knowing.
I'd also spend more time writing automated Go tests for the capacity query. I did verify the results by independently recalculating the allocations from the seed data and found zero mismatches across roughly 26,000 cells. However, that verification script isn't in the repo, so I'd want to turn those checks into proper, repeatable tests that can catch regressions as the application evolves.
