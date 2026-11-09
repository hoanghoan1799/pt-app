# Plan: copy a workout day to other dates

Spec: `docs/specs/copy-workout-day.md`. No KAN ticket (Hoan, 2026-11-09). One PR into `main` (#177).

1. Server: `copyDaySchema` and `copyMonthInfoSchema` in `workout-schemas.ts`. Range queries `listDatesWithContent` and `listDatesWithSets`, plus `getDaySchedule`, in `workout-queries.ts`.
2. Actions: `copyDayToDatesAction` and `getWorkoutCopyMonthInfoAction` in `workout-actions.ts`. Extract `deleteWorkoutDays` and share it with `copyWeekAction`, whose behaviour stays the same.
3. Pure helper `normalizeCopyTargets` in `features/workouts/utils/copy-day.ts`, with a unit test.
4. UI: the `use-copy-workout-day` hook, the `CopyWorkoutDaySheet` component, and a copy icon button in `DayEditor` that shows only when the day has content.
5. i18n: vi, en and zh strings for the sheet and the new server messages.
6. Verify: `pnpm verify`, then a browser check on the local DB. Skip e2e (current rule).
