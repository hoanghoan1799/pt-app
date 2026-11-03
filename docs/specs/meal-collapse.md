# Spec: Collapse and expand meal cards

KAN-88 (sub-task KAN-89 [FE]). Intent: `intent/2026-11-03-meal-collapse.md`.

## Today

- Trainee: `TraineeMealPlan` renders a "Plan bữa ăn" title and one `TraineeMealCard` per meal, all fully open.
- Admin: `MealPlanDay` renders the same title, `MemberMealRequest`, and one `MealCard` per meal (name input, reorder, delete, items, food picker, totals, auto solve, trainee logs).

## Decisions

| #   | Decision                                                                                                                                                                                     | Why                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| D1  | Both views get the feature, trainee and admin.                                                                                                                                               | Both lists get long with 4-6 meals; same mental model for PT and trainee.                        |
| D2  | Each card header starts with a chevron icon button (right when collapsed, down when open), `aria-expanded`, `aria-controls` pointing at the card body, label "Thu gọn {meal}" / "Mở {meal}". | Standard disclosure pattern; the admin reorder chevrons stay on the right so the two do not mix. |
| D3  | A collapsed card keeps its header (admin: name input, reorder, delete still work) and shows one summary line: trainee "Đã ăn X / Y kcal", admin "X kcal / target kcal · N món".              | The PT can still reorder folded meals; the summary keeps the day scannable.                      |
| D4  | The body is hidden with the `hidden` attribute, not unmounted.                                                                                                                               | Open sheets, typed grams and auto-solve locks keep their state when a card is folded.            |
| D5  | One button on the "Plan bữa ăn" title row: "Thu gọn tất cả" while any meal is open, "Mở tất cả" when all are folded. Shown only when the day has a plan.                                     | One control, its label always says what it will do.                                              |
| D6  | State lives in the page (React state keyed by meal id), not saved. Every visit and every day switch starts all open; a newly added meal starts open; deleted meal ids are dropped.           | Out of scope to persist (intent Q1).                                                             |

## Obsolete behaviour to revisit

None. Nothing is removed; the default view is unchanged.

## Test matrix

| Case                                                       | Level   | Expected                                                               |
| ---------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| Toggle a meal id on and off                                | unit    | id added, then removed                                                 |
| All collapsed with ids `[1,2]` collapsed and meals `[1,2]` | unit    | true                                                                   |
| Stale id of a deleted meal                                 | unit    | ignored by "all collapsed" and dropped                                 |
| No meals                                                   | unit    | "all collapsed" is false                                               |
| Trainee folds one meal                                     | e2e     | its "Ghi món đã ăn" button is hidden, toggle has `aria-expanded=false` |
| Trainee "Thu gọn tất cả" then "Mở tất cả"                  | e2e     | every card body hidden, then shown                                     |
| Admin folds a meal                                         | e2e     | food picker hidden, reorder still enabled                              |
| 390px width                                                | browser | header row does not wrap or overflow                                   |
