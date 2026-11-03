# Spec: Freeze eaten nutrition (KAN-93)

Intent: `intent/2026-11-03-eaten-snapshot.md`. Jira: KAN-93.

## Today

- A meal marked "Đạt" counts every planned item at its current grams and the current library macros; a food the trainee also logged counts the logged grams instead (KAN-87, `listMealNutrition`).
- A library food log stores only `food_id` and grams; macros come from the library at read time (`resolveLogNutrition`). `docs/specs/meal-plan.plan.md` (KAN-71 note 4) says "editing a food's numbers later changes old logs": this spec replaces that rule.

## Decisions

| #   | Question                                                 | Decision                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What is frozen for a marked meal?                        | A per-item snapshot taken when the mark turns "Đạt": food id, grams and the resulting protein/carbs/fat/kcal of each planned item. Kept per item so the KAN-87 rule (same-food log replaces the planned item) still works on logs added after the mark. |
| D2  | Where is it stored?                                      | New table `meal_mark_items` (`mark_id`, `meal_id`, `food_id`, `grams`, `protein`, `carbs`, `fat`, `kcal`). Additive.                                                                                                                                    |
| D3  | When is the snapshot (re)taken?                          | When `achieved` goes from false/none to true. Saving only the note on an achieved meal keeps the snapshot. Un-marking deletes it; marking again takes a fresh one from the current plan.                                                                |
| D4  | Library food logs                                        | On add and on edit, store the computed protein/carbs/fat/kcal on the `meal_logs` row (the columns free foods already use). Reading prefers stored numbers; a library log with all four null (logged before KAN-93) is read live, as today.              |
| D5  | Marked meal with no snapshot rows (marked before KAN-93) | Counted live, as today.                                                                                                                                                                                                                                 |
| D6  | Deleting a meal/day, copy overwrite, deleting a member   | `deleteMeals` also deletes `meal_mark_items` (foreign keys are not enforced).                                                                                                                                                                           |
| D7  | What still reads live                                    | The plan itself (planned macros, kcal notices, auto-calc) and the admin's plan totals: a plan is a plan.                                                                                                                                                |
| D8  | UI                                                       | No visible change; the numbers just stop drifting.                                                                                                                                                                                                      |

## Test matrix

| Case                                          | Expected                                         |
| --------------------------------------------- | ------------------------------------------------ |
| Mark "Đạt", PT changes grams 200 -> 400       | Eaten stays at 200 g worth                       |
| Mark "Đạt", PT adds or removes a planned food | Eaten unchanged                                  |
| Mark "Đạt", admin edits the food's macros     | Eaten unchanged                                  |
| Mark, save note only                          | Snapshot unchanged                               |
| Un-mark, PT edits grams, mark again           | Eaten uses the new grams                         |
| Mark, then log the same food 50 g             | Planned item replaced by the 50 g log (KAN-87)   |
| Library log, admin edits the food's macros    | Log keeps its numbers                            |
| Edit a library log's grams                    | Numbers recomputed from the library at edit time |
| Mark or library log made before KAN-93        | Read live (unchanged behaviour)                  |
| Delete the meal or overwrite the day          | Snapshot rows removed with the mark              |
| Week strip, day summary, meal card            | Same frozen totals in all three                  |
