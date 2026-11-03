# Plan: Meal plan builder

Status: approved by Hoan on 2026-10-30, split into three stories: KAN-70 (energy model), KAN-69 (meal plan builder), KAN-71 (trainee meal log).

## Source

- Spec and decisions: `docs/specs/meal-plan.md` (Q1-Q7, R1-R6, S1-S5, C1-C7)
- Builds on: food library (KAN-65, merged in PR #46)
- KAN key: KAN-69, proposed split into three stories below
- Workflow: dojo developer workflow (analyze, plan, fix, verify in the running app, PR, `/code-review`, human review, PR walkthrough artifact)

## Proposed split (one story per PR)

The decisions touch three areas. One PR for all of them would be about 3x the size of PR #46, so the plan ships them in order:

| Order | Story                      | What ships                                                                                                               |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | Energy model (KAN-70)      | C1, C2, C3: PT-set kcal adjustment, protein g/kg by sex, one on-target rule                                              |
| 2     | Meal plan builder (KAN-69) | Q1-Q6, R1, R2, R5, S2, S5: per-day plans in the admin Dinh dưỡng tab, auto grams, copy days / last week, trainee request |
| 3     | Trainee meal log (KAN-71)  | R6, S4, C4, C5, S3: trainee sees the plan, logs what was eaten from the library, marks meals; weekly kcal notice         |

## Story 1: Energy model (KAN-70)

Files

- `db/schema.ts`: `body_profiles.kcal_adjustment` (integer, nullable) and `body_profiles.protein_per_kg` (real, nullable). Null keeps today's behaviour for existing members until the PT saves the profile, so no target changes silently on deploy.
- `features/nutrition/constants/energy.ts`: `PROTEIN_PER_KG_DEFAULT` = male 2.0, female 1.6; `ON_TARGET` = kcal ±80, protein -5 g, carbs/fat ±10 g. `GOALS.calorieFactor` and `proteinPerKg` kept only as the fallback for null columns.
- `features/nutrition/utils/energy.ts`: BMR stays Mifflin-St Jeor (Hoan, 2026-10-30); `calculateEnergyPlan()` uses `kcal_adjustment` and `protein_per_kg`; goal label derived from the adjustment sign.
- `features/nutrition/utils/nutrition.ts`: `compareToTarget()` / `isDayOnTarget()` use `ON_TARGET` instead of `TARGET_TOLERANCE`.
- Body profile form: "Thâm hụt / dư kcal mỗi ngày" and "Đạm (g/kg)" fields with the defaults filled in.

Risks

- Existing members' numbers change once the PT re-saves a profile (kcal adjustment replaces the goal factor, protein by sex). The PT sees the new target before it applies.

## Story 2: Meal plan builder (KAN-69)

Schema (all new tables)

- `users`: `preferred_meal_count` (integer, nullable, 2-6), `food_note` (text, nullable) for the trainee's request (Q1).
- `meal_plan_days`: `id`, `user_id`, `date` (unique per user). A day with a plan; no plan names (R1).
- `meal_plan_meals`: `id`, `day_id`, `position`, `name`, `share_percent` (nullable; null = equal split, Q4).
- `meal_plan_items`: `id`, `meal_id`, `food_id` (references `foods`, archived foods still readable), `grams`.

Logic (pure, unit tested)

- `features/meal-plans/utils/meal-targets.ts`: split the day target across meals (equal or by %, total 100).
- `features/meal-plans/utils/solve-grams.ts`: for the foods chosen in a meal, find grams that hit the meal's P/C/F (non-negative least squares on the 3 macros, kcal follows), rounded to 5 g; returns the gap per macro (Q5, Q6). Worked example from the spec as a test: chicken, rice, 300 g broccoli give 427 g / 757 g and "Thiếu 36 g fat".
- `features/meal-plans/utils/plan-status.ts`: day status with the S2 + R5 rule.
- Suggestions for a gap: library foods of the group that fills it (fat: Dầu & chất béo, Đậu & hạt).

UI (admin Dinh dưỡng tab, S5)

- Week day tabs as today; each day shows its plan or "Chưa có plan" with "Tạo plan" and "Áp dụng tuần trước" (R2, never automatic).
- Meal list (defaults from the trainee's meal count, else 3; add, remove, rename, reorder; "Học viên muốn 4 bữa" when different).
- Per meal: search the food library, add foods, "Tính tự động", editable grams, totals vs meal target.
- "Sao chép sang ngày khác" to copy a day to chosen days.
- Trainee request fields on the trainee Dinh dưỡng page (Q1).

## Story 3: Trainee meal log (KAN-71)

- Trainee Dinh dưỡng page shows today's plan per meal, read-only (Q7).
- Per meal: "Đạt", or log what was eaten: search the library + amount, or a free name with optional macros; add, edit, remove (C5). New table `meal_logs` (`user_id`, `meal_id`, `food_id` nullable, `custom_name` nullable, `grams`, macros nullable) and `meal_marks` (`meal_id`, `achieved`, `note`).
- The free-text food log form is hidden; `food_entries` stays in the database and old entries still show in history (additive schema).
- Remove `describeFoodEquivalent` lines (C4).
- Weekly notice (S3): after a weigh-in the TDEE target already updates (`saveWeighIn`, unless manual). The admin Dinh dưỡng tab compares each planned day's kcal with the new target and shows "Plan lệch +120 kcal so với mục tiêu mới" when the gap is above 80 kcal.

## Proof (each story)

- Unit tests with hand-computed numbers for every formula (BMR bands, split, solver, status, notice).
- e2e for the main flow of each story at 390 px; browser proof screenshots.
- `pnpm verify` green, `/code-review`, PR walkthrough artifact.

## Deviations

- Scope change (Hoan, 2026-10-30): Henry & Rees BMR dropped; BMR stays Mifflin-St Jeor for all ages (C7 rejected).

- Code review fixes (KAN-70): (1) with a kcal adjustment set, the target never falls below the member's BMR; the plan carries `isFlooredToBmr` and the form preview and card warn "Mục tiêu không được thấp hơn BMR, đã dùng X kcal". Legacy (null) profiles are not floored so their numbers stay. (3) `KCAL_ADJUSTMENT_LIMITS` is -1500..+1500 (was -1000..+1000) so the legacy prefill always fits. (4) A legacy profile's protein field is prefilled with its old per-goal value (2.2 / 1.8 / 2.0 g/kg), with the hint "Mặc định mới: 2,0 g/kg"; the sex default (2.0 / 1.6) is only used for new profiles.

- Story 2 (KAN-69), worked example: the spec's 427 g chicken / 757 g rice are the unrounded solution (426.99 g / 756.74 g). Because grams are rounded to 5 g (Q5), the solver returns 425 g / 755 g, leaving 36.2 g fat short ("Thiếu 36 g fat"). Both numbers are pinned in `solve-grams.test.ts`.
- Story 2: the solver weights protein and carbs 1 and fat 0.01 (`SOLVER_MACRO_WEIGHTS`), so foods are fitted to P and C first (as in the worked example) and fat only decides foods that are mostly fat (oil). A food that does not help is returned as 0 g.
- Story 2: "fixed" foods (e.g. 300 g broccoli) are a per-item "Giữ gram" toggle kept on screen only, sent with "Tính tự động"; no extra column was added to `meal_plan_items`.
- Story 2: adding or removing a meal resets a custom % split to equal (the total would no longer be 100). Meal targets are whole grams that add up exactly to the day target (largest remainder).
- Story 2: a meal gap is shown from 5 g (`MEAL_GAP_MIN_GRAMS`); extra protein is never a gap. The day verdict uses `ON_TARGET` unchanged.
- Story 2: added "Xóa plan của ngày này" (not listed in the plan) so an accidental plan can be undone. "Áp dụng tuần trước" copies every planned day of last week into empty days of the shown week and never overwrites; "Sao chép sang ngày khác" offers this and next week and overwrites (marked "sẽ ghi đè"). Deleting a member also deletes their plans.

- Story 3 (KAN-71), plan changes: (1) Logs and marks belong to the plan meal and are deleted with it: removing a meal, deleting a day, "Sao chép sang ngày khác" over a day (KAN-78 asks the PT first) and deleting a member all remove that meal's `meal_logs` and `meal_marks` (done in `deleteMeals`, since foreign keys are not enforced). Chosen over keeping orphan logs because a log without its planned meal has nothing to be compared with and would be unreachable on the trainee page. "Áp dụng tuần trước" never overwrites, so it never touches logs. (2) The trainee can log only for today and earlier plan days (same rule as the old food log); future days show the plan read-only. (3) S4 is a per-meal free-text note ("Món nào thiếu hoặc dư?") plus "Đạt", not a per-food short/over picker; a note with `achieved` false is kept, and a mark with neither is deleted. (4) Library logs store only `food_id` and grams; their macros are read from the library at display time (archived foods still resolve) and kcal follows 4/4/9 from those macros, the same basis as the plan, so eating exactly the plan shows the plan's kcal; ~~editing a food's numbers later changes old logs~~ (replaced by KAN-93: a library log stores its computed numbers and a meal marked "Đạt" freezes its planned items, see `docs/specs/eaten-snapshot.md`). A log whose food row is missing shows "Món không còn trong thư viện", cannot be edited, and can still be removed. Free foods store what was typed (kcal left empty = 4/4/9 from the macros; no numbers = "Chưa có số liệu dinh dưỡng" and counts as 0 in totals); their grams may be 0 (unknown). (5) C4: `describeFoodEquivalent`, `FOOD_EQUIVALENTS`, `formatLang` and `GRAMS_PER_LANG` are removed everywhere (target card, energy summary, progress row), not only where meal plans show; their tests went with them. (6) The trainee page's "Nhật ký cũ" shows old `food_entries` read-only and is hidden when a day has none; day totals (trainee progress card, day tab markers, `isDayOnTarget`, week summary, admin day view) count old entries plus `meal_logs`. (7) S3 notice: planned days from the shown week start up to 28 days ahead are compared with `getTargetForDate`; days without foods or without a target are skipped; the gap is rounded to whole kcal and flagged above 80 (80 itself is fine). It lists each day, so the PT sees how much to change per day. (8) Meal macros of the plan on the trainee page are the PT's planned foods, not the meal target; the target line stays read-only text. (9) KAN-78: overwriting or deleting a day that has trainee logs or marks warns "Học viên đã ghi bữa ăn ở …; ghi đè sẽ xóa nhật ký đó." before the PT confirms.

- KAN-78: the overwrite confirmation is a step inside the "Sao chép sang ngày khác" sheet (`role="alertdialog"` with "Hủy" / "Ghi đè"), not a second modal: the repo has no dialog component (it uses `window.confirm`, which cannot be shown in a screenshot) and a native `<dialog>` would fight the sheet's focus trap. "Hủy" goes back to the date list with the ticks kept.

- KAN-69 e2e (test only): the Q1 spec now reloads between saves, because the DB row is written before the client finishes the action and React then resets the uncontrolled form to its saved values; the meal-plans queries are scoped to E2E Planner so other seeded trainees' plans do not leak in.
