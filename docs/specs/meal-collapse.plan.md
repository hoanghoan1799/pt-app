# Plan: Collapse and expand meal cards

## Source

- Intent: `intent/2026-11-03-meal-collapse.md`
- Spec: `docs/specs/meal-collapse.md`
- KAN key: KAN-88 / KAN-89

## Files that change

- `features/meal-plans/utils/meal-collapse.ts` (new): pure helpers `toggleMealCollapsed`, `areAllMealsCollapsed`, `pruneCollapsedMeals`, with `__tests__/meal-collapse.test.ts`.
- `features/meal-plans/hooks/use-meal-collapse.ts` (new): state of collapsed meal ids for one day plan; `isCollapsed`, `toggle`, `collapseAll`, `expandAll`, `isAllCollapsed`.
- `features/meal-plans/components/MealCollapseToggle/index.tsx` (new): the chevron disclosure button.
- `features/meal-plans/components/MealPlanTitle/index.tsx` (new): "Plan bữa ăn" title row with the optional collapse/expand all button.
- `TraineeMealPlan` (now a client component), `TraineeMealCard`, `MealPlanDay`, `MealCard`: wire the state, header toggle, body wrapper with `hidden`, summary line.
- `e2e/meal-log.spec.ts`, `e2e/meal-plans.spec.ts`: collapse cases from the test matrix.

## Order of work

1. Pure helpers + unit tests.
2. Hook, toggle and title components.
3. Trainee view, then admin view.
4. e2e cases, `pnpm verify`, browser check at 390px.

## Risks

- KAN-87 edits `TraineeMealCard` / `TraineeMealPlan` at the same time: rebase this branch on it once it merges and resolve by hand.
- Existing e2e selectors keep working because the default is all open.

## Proof

- `pnpm verify`; `pnpm test:e2e` for the meal specs.
- Browser at 390px: trainee and admin, fold one, fold all, open all.

## Deviations

None yet.
