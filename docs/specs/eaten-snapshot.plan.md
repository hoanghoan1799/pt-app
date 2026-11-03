# Plan: Freeze eaten nutrition

## Source

- Intent: `intent/2026-11-03-eaten-snapshot.md`
- Spec: `docs/specs/eaten-snapshot.md`
- KAN key: KAN-93 (one PR)

## Files that change

- `db/schema.ts`: new table `meal_mark_items` (D2). Comment on `meal_logs` macros updated (D4).
- `features/meal-plans/services/meal-log-actions.ts`: `setMealMarkAction` takes the snapshot in a transaction when `achieved` turns true and deletes it on un-mark (D3); `addMealLogAction`/`updateMealLogAction` store computed macros for library foods (D4).
- `features/meal-plans/services/meal-plan-store.ts`: `deleteMeals` deletes `meal_mark_items` (D6).
- `features/meal-plans/utils/meal-log.ts`: `resolveLogNutrition` prefers stored numbers for library logs; `listMealNutrition` takes the snapshot items when present, live items otherwise (D1, D5).
- `features/meal-plans/services/meal-log-queries.ts` and `features/nutrition/services/nutrition-queries.ts`: load snapshot items with the marks and pass them to the counting (one shared path, so strip, summary and cards agree).
- Tests: `features/meal-plans/utils/__tests__/meal-log.test.ts`, `features/meal-plans/services/__tests__/meal-log-actions.test.ts`, `features/meal-plans/services/__tests__/meal-plan-actions.test.ts`, one e2e in `e2e/` for "PT edits after mark".
- `docs/specs/meal-plan.plan.md`: note that KAN-71 note 4 is replaced by KAN-93.

## Order of work

1. Schema: `meal_mark_items` table (additive), `pnpm db:push` on the local DB only.
2. Pure counting: snapshot-aware `listMealNutrition` and stored-first `resolveLogNutrition`, with unit tests for each matrix row that does not need the DB.
3. Actions: snapshot on mark, stored macros on library log add/edit, cleanup in `deleteMeals`; action tests against the test DB.
4. Queries: load snapshots in `getMealLogData` and `getNutritionWeek`.
5. e2e "PT edits after mark", then `pnpm verify`.

## Risks

- Counting paths diverge (strip vs summary vs card). Contained by one loader feeding `listMealNutrition` and a test comparing totals.
- Legacy rows: null snapshot means live, so nothing changes on deploy; no backfill.
- The production build runs `drizzle-kit push`; the change only adds a table, so it is safe.

## Proof

- Unit and action tests per row of the spec's test matrix; `pnpm verify` green.
- e2e: mark "Đạt", PT edits grams, the trainee's "Đã ăn" is unchanged.
- Browser check on a local DB at 390 px (`browser-proof`) for the same flow.

## Deviations

None yet.
