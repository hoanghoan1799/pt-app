# Intent: Freeze eaten nutrition once the trainee marks or logs

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-93

## Problem

"Đã ăn" totals are read live from the current plan and the food library. When the PT changes grams, adds or removes a planned food, or edits a library food's macros, the eaten totals of days the trainee already finished change, with no input from the trainee. Found in the 2026-11-03 meal plan audit; the PT and the trainee both see past days drift.

## Proposed outcome

What the trainee ate is fixed at the moment they record it: tapping "Đạt" on a meal, or logging/editing a library food. Later edits to the plan or the library change the plan, not the eaten history.

## Affected users and systems

Trainees (meal cards, day summary, week strip on /nutrition) and PTs (member nutrition page). Tables `meal_marks`, `meal_logs`, a new snapshot table. Actions `setMealMarkAction`, `addMealLogAction`, `updateMealLogAction`; counting in `features/meal-plans/utils/meal-log.ts` and `getNutritionWeek`.

## Constraints

Additive schema only (Vercel build runs `drizzle-kit push`). Existing marks and logs keep today's live behaviour (no backfill). Vietnamese UI copy; no UI change planned.

## Open questions

None open; Hoan chose "freeze when marked" on 2026-11-03 in the project thread.

## Out of scope

Freezing the plan itself (the PT can still edit it). Nutrition targets (already dated by `effectiveFrom`). Legacy `food_entries`.
