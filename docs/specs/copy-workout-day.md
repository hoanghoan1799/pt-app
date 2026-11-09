# Copy a workout day to other dates

No KAN ticket: Hoan asked for this directly on 2026-11-09 and said to skip Jira for it. PR #177.

## Goal

A PT copies one day's workout (day title, note and every exercise in order) to one or more other dates of the same trainee. The flow matches the meal plan "Sao chép sang ngày khác" sheet.

## Decisions

- D1: Only admins (PTs) can copy, because only admins assign workouts. The actions call `requireAdmin()` and `requireAdminForUser()`.
- D2: A target day that already has a workout is replaced (title, note and exercises), after an overwrite confirm. The copy never merges into it, because merging would create duplicate exercises.
- D3: A target day where the trainee has logged sets cannot be picked. The server also refuses the whole request, checking inside the write transaction, so no history is ever deleted.
- D4: Past dates and the source date are not targets. A request can hold at most 14 dates.
- D5: Completions and logged sets are not copied, so a copied day starts fresh.
- D6: No schema change. The month grid helpers (`buildCopyMonth`, `mergeMonthDates`) and `useMealPlanAction` are reused from meal plans.

## Open questions

None. Hoan can ask for merge mode later if PTs want it.

## Test matrix

| Case | Expected | Covered by |
| --- | --- | --- |
| Duplicate dates and the source date in the request | deduped, source dropped | `features/workouts/utils/__tests__/copy-day.test.ts` |
| A past date in the request | whole request rejected | same unit test plus the server check |
| Copy to an empty future day | day created with the same exercises, nothing completed | browser check on local DB |
| Copy to a day that has a workout | overwrite confirm, then the day is replaced | browser check on local DB |
| Target day with logged sets | locked in the grid; the server refuses | server transaction check |
