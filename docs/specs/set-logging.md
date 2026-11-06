# Set logging (capstone, dojo Day 12-15)

Decision log from the `/grill-me` intake. Source of truth for the KAN ticket pack; the Jira tickets link here.

## Goal

Trainees record what they actually lifted (weight and reps per set) while they train, see last time's numbers so they stop guessing, and feel rewarded when they beat their old best. The PT sees who is getting stronger.

"Done" for the client: a trainee can log a set in a few taps on a phone between sets, and the PT can tell from the member page whether a trainee is progressing.

## Facts from the repo (not decisions)

- `exercises` is one row per exercise per day (`db/schema.ts`); each week gets new rows. `sets` is a nullable integer, `reps` is free text (e.g. `12`, `8-12`, `30s`), `youtubeId` is required.
- `exercise_completions` holds at most one row per exercise (unique `exerciseId`) with `completedAt`; cascade-deleted with the exercise.
- Completion toggle (`features/workouts/services/completion-actions.ts`): `requireUser()`, refuses future dates (Asia/Ho_Chi_Minh), insert to mark, delete to un-mark.
- Copy week (`copyWeekAction` in `features/workouts/services/workout-actions.ts`) replaces the whole target week: existing days and exercises are deleted, so anything attached to them by cascade is deleted too.
- Admin member pages: `/admin/users/[id]` (week, completions, history), `/summary`, `/nutrition`, `/preview`.
- The Vercel build runs `drizzle-kit push` against production, so schema changes must be additive.

## Decisions

Rounds 1 and 2 answered 2026-10-22 by Hoan: all recommendations accepted.

| #   | Question                                               | Recommended                                                                                                                                                                                                               | Decision |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Q1  | Log per set, or one line per exercise?                 | Per set: weight + reps for each set; number of rows prefilled from `sets`                                                                                                                                                 | Accepted |
| Q2  | Units?                                                 | kg only, steps of 0.5 kg                                                                                                                                                                                                  | Accepted |
| Q3  | Bodyweight and timed exercises (`30s`)?                | Weight optional (empty = bodyweight); reps is a whole number; timed exercises have no set logging in v1 (KAN-44: sets already logged for a timed exercise show read-only in "Đã ghi:", but it never gets inputs or "Lưu") | Accepted |
| Q4  | How does logging relate to "Đánh dấu đã tập"?          | Optional; saving the first set also marks the exercise done; marking done without sets stays possible                                                                                                                     | Accepted |
| Q5  | Un-marking a done exercise: what happens to its sets?  | Sets are kept; un-mark only clears the check                                                                                                                                                                              | Accepted |
| Q6  | How do we know it is "the same exercise" across weeks? | Same user + same `youtubeId`                                                                                                                                                                                              | Accepted |
| Q7  | Which days can be logged or edited?                    | Same rule as completion: today and past days, never future                                                                                                                                                                | Accepted |
| Q8  | What does "getting stronger" mean?                     | Per exercise, the best set is the heaviest weight (tie: more reps); progress = latest best vs the previous best                                                                                                           | Accepted |
| Q9  | Where does the PT see it?                              | Member page: logged sets under each exercise; Summary tab: a per-exercise "Tiến bộ" list (latest best vs previous best). Not on the dashboard in v1                                                                       | Accepted |
| Q10 | How do trainees "feel proud"?                          | A "Kỷ lục mới" badge on the exercise card when a saved set beats the previous best; also shown in the admin recent activity. No push notification                                                                         | Accepted |
| Q11 | Do we show last time's numbers?                        | Yes: each set row shows the same set from the latest previous session as a hint ("Lần trước 40 kg × 10"); one tap copies it                                                                                               | Accepted |
| Q12 | Copy week onto a week that already has logged sets?    | Refuse with a message while the target week has logged sets (today copy silently deletes them)                                                                                                                            | Accepted |
| Q13 | Can the PT edit a trainee's sets?                      | No, read-only for the PT in v1                                                                                                                                                                                            | Accepted |
| Q14 | Can the trainee add or remove set rows?                | Yes: add rows beyond the PT's `sets`, delete own rows; at most 10 rows per exercise                                                                                                                                       | Accepted |

## Open questions for the client

Answered by the client on 2026-10-22 (comment on KAN-20). The assumptions stand, plus one addition in OQ1.

- OQ1: When the PT deletes an exercise or changes its YouTube link after the trainee logged sets, should the history disappear (today's cascade) or be kept? **Answer:** deleting the exercise deletes its sets; a new link starts a new history. Before deleting an exercise with logged sets, the PT's confirm says the sets go too (KAN-33). Changing the link of an exercise that has logged sets asks the same way (KAN-39): the PT confirms, the server deletes that exercise's sets and updates the link in one transaction (the completion is kept), and it refuses the change without `confirmResetSets=true`. Editing only title or reps never touches the sets.
- OQ2: Should a set logged as bodyweight (no kg) ever count as a personal best? **Answer:** no, only sets with a weight count in v1.
- OQ3: Is "Tiến bộ" on the Summary tab enough for the PT, or does the client also want it on the dashboard soon? **Answer:** the Summary tab is enough; personal-best entries in the dashboard activity list (F3) cover the dashboard. A tile can be a later story.
- Note (KAN-59): Deleting a member: the existing confirm ("Xóa user này và toàn bộ lịch tập của họ? …") already covers their logged sets, so no separate set warning is shown.

## Out of scope (v1)

- Pounds, plate calculators, rest timers.
- Logging for timed exercises (`30s`, `1 phút`).
- Charts of weight over time; estimated one-rep max.
- PT editing a trainee's sets; push notifications; dashboard tiles.

## Ticket pack

Created in Jira 2026-10-22: epic KAN-20; KAN-21 (A), KAN-22 (B), KAN-23 (C), KAN-24 (QA). Full text lives on the tickets; the summaries below are the reference.

Order: Story A merges first; B and C run in parallel worktrees after it; the QA task follows B.

### KAN-20 Epic: [Capstone] Set logging: trainees record actual weight and reps per set

Links this spec. Children: A, B, C, QA.

### KAN-21 Story A: Store logged sets and compute bests

As a trainee, I want my sets saved against the exercise, so that the app can show last time's numbers and my records.

- Schema (additive): new table `exercise_sets` (id, exercise_id FK cascade, user_id FK cascade, position 0-based, weight_kg real nullable, reps integer, created_at; no updated_at, D4).
- Server action `saveExerciseSetsAction(exerciseId, sets[])`, replace-on-save (D1): `requireUser()` first, Zod (weight empty or 0.5-500 step 0.5, reps 1-100 integer, at most 10 rows; D3), only the trainee's own exercises, refuse future dates (Asia/Ho_Chi_Minh). Saving the first set inserts the completion if missing (Q4); un-marking keeps sets (Q5).
- Pure utils with Vitest tests: `getBestSet` (heaviest, tie on reps; weightless sets ignored, OQ2), `isPersonalBest`, `getPreviousSession` (same user + `youtubeId`, latest earlier date, Q6).
- `copyWeekAction` refuses when the target week has logged sets, with a Vietnamese error message (Q12).
  Acceptance criteria:
- Given a past or today exercise of mine, when I save 3 sets, then 3 rows exist and the exercise is marked done.
- Given a future exercise, when I save a set, then the action refuses and nothing is stored.
- Given another user's exercise id, when I save, then the action refuses.
- Given weight 40.25 or reps 0 or 11 rows, then validation fails with a message.
- Given a target week with logged sets, when the PT copies a week onto it, then the copy is refused and nothing changes.
- `pnpm test && pnpm lint && pnpm typecheck` green; new utils covered by tests.
  Files: `db/schema.ts`, `features/workouts/services/*`, `features/workouts/utils/*` (+ `__tests__`).

### KAN-22 Story B: Trainee logs sets while training

Depends on A. As a trainee holding a phone between sets, I want to log each set in a few taps, so that I stop guessing next week.

- On today's and past exercise cards (not timed ones, not future days): one row per set, prefilled count from `sets` (Q1), kg + reps inputs with large tap targets, add row / delete row (max 10, Q14).
- Hint per row "Lần trước 40 kg × 10" from the previous session; one tap copies it (Q11).
- "Kỷ lục mới" badge on the card when a saved set beats the previous best (Q10).
  Acceptance criteria:
- Given an exercise with 3 sets and a previous session, when I open it today, then I see 3 rows with last time's hints.
- Given I tap a hint and save, then the set is stored and the card shows "Đã tập xong".
- Given a set heavier than my previous best, when I save, then "Kỷ lục mới" shows on that card.
- Given a timed exercise (`30s`) or a future day, then no set rows are shown.
- Works at 390 px wide (iPhone 12) without horizontal scroll.
  Files: `features/workouts/components/UserExerciseItem`, `ExerciseCard`, new `SetLogger` component, hook `use-exercise-sets.ts`.

### KAN-23 Story C: PT sees logged sets and progress

Depends on A. As a PT, I want to see what each trainee lifted and who is getting stronger.

- Member page `/admin/users/[id]`: logged sets under each exercise, read-only (Q13).
- Summary tab: "Tiến bộ" list per exercise: latest best vs previous best, with the change in kg (Q8, Q9).
- Recent activity: an entry when a trainee sets a personal best (Q10).
  Acceptance criteria:
- Given a trainee logged sets this week, when the PT opens the member page, then each exercise lists its sets and there is no edit control.
- Given two sessions of the same exercise (same link), then "Tiến bộ" shows both bests and the difference.
- Given a trainee with no logged sets, then "Tiến bộ" shows an empty state.
- Every new admin query is behind `requireAdmin()` / the admin layout.
  Files: `app/admin/(protected)/users/[id]/*`, `features/members/*`, `features/dashboard/services/dashboard-queries.ts`.

### KAN-24 Task QA: Test matrix and first e2e suite

Depends on B. Test matrix in this file (one row per acceptance criterion, level unit or e2e). Add `@playwright/test` with an e2e run for the trainee flow (log sets, hint, record badge) against a seeded local DB, and run it in CI if it stays under 3 minutes.

## Sub-tasks

Each Story is split by layer; one branch and one PR per sub-task (`feat/KAN-<sub-task>-<short-name>`).

| Parent | Sub-task                                                     | Layer | Needs          |
| ------ | ------------------------------------------------------------ | ----- | -------------- |
| KAN-21 | KAN-25 Add `exercise_sets` table                             | BE    | -              |
| KAN-21 | KAN-26 Pure utils: best set, personal best, previous session | BE    | KAN-25         |
| KAN-21 | KAN-27 Save/delete set actions, linked to completion         | BE    | KAN-25         |
| KAN-21 | KAN-28 Copy week refuses a logged target week                | BE    | KAN-25         |
| KAN-22 | KAN-29 Load sets and last-session hints with the week        | BE    | KAN-21         |
| KAN-22 | KAN-30 `SetLogger` component                                 | FE    | KAN-21         |
| KAN-22 | KAN-31 Last-time hint and "Kỷ lục mới" badge                 | FE    | KAN-29, KAN-30 |
| KAN-23 | KAN-32 Admin queries: sets, progress, record activity        | BE    | KAN-21         |
| KAN-23 | KAN-33 Member page: read-only sets                           | FE    | KAN-32         |
| KAN-23 | KAN-34 Summary "Tiến bộ" list and activity entry             | FE    | KAN-32         |
| KAN-24 | KAN-35 Test matrix                                           | QA    | -              |
| KAN-24 | KAN-36 Playwright e2e setup and trainee spec                 | QA    | KAN-22         |

## Zero-questions test decisions

Each Story was read as a developer with no context (prompt E); every question went to Jira with a suggested answer. Hoan (BA) accepted all of them on 2026-10-22. They override the Story summaries above where they differ.

### KAN-21 (D1-D9)

| #   | Decision                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Replace-on-save: one `saveExerciseSetsAction(exerciseId, sets[])` deletes and re-inserts the exercise's rows; no delete action.                                                                    |
| D2  | Saving an empty list clears the sets and keeps the completion.                                                                                                                                     |
| D3  | Weight is empty (bodyweight) or 0.5-500 in steps of 0.5; 0 is rejected.                                                                                                                            |
| D4  | No `updated_at` column; `position` is 0-based.                                                                                                                                                     |
| D5  | Wrapped in `withResultErrorHandling`; returns `{ status, personalBest }`.                                                                                                                          |
| D6  | Personal best = strictly better than every earlier set of that user + `youtubeId` before that date; a tie is not a record.                                                                         |
| D7  | "Previous session" means strictly earlier dates only; the same day never counts.                                                                                                                   |
| D8  | Personal bests are computed on read, not stored.                                                                                                                                                   |
| D9  | The copy-week guard checks logged sets only (completions alone do not block it).                                                                                                                   |
| D11 | (2026-10-23, answered by Hoan on KAN-35) The first-ever weighted set is not a "Kỷ lục mới": `isPersonalBest` needs at least one earlier weighted set, otherwise false ("Tiến bộ" shows "Lần đầu"). |

D10 (2026-10-22, from the Jira auto-analysis, verified in code): `PRAGMA foreign_keys` is never set and every delete path removes child rows by hand, so `onDelete: cascade` is not relied on. `deleteExerciseAction`, `copyWeekAction` and `deleteMemberAction` delete `exercise_sets` explicitly, in the same transaction and before the parent rows (KAN-25).

D9 guard placement (2026-10-23, approved by Hoan on KAN-28): `copyWeekAction` checks for logged sets as the first query inside its copy transaction, not before it. libSQL opens the transaction with `BEGIN IMMEDIATE`, so a trainee cannot save a set between the check and the delete; any `exercise_sets` row on the target user's 7 target dates blocks the copy, and the explicit delete from D10 stays as a safety net.

Hardened save (KAN-40): `saveExerciseSetsAction` re-checks that the exercise still exists inside its write transaction (same `BEGIN IMMEDIATE` reasoning as D9), so a PT deleting it mid-save leaves no orphan `exercise_sets` or `exercise_completions` rows (D10) and the trainee gets the not-found message. It also compares the submitted sets with the stored ones (`areSetsEqual`, by position, weight and reps) and skips the delete + insert when they match, so re-saving an old session does not bump `created_at`, which `getRecentPersonalBests` uses as `occurredAt`; the completion row is still inserted as before when the list is not empty (D1, D2, Q4 unchanged).

### KAN-22 (E1-E8)

| #   | Decision                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- |
| E1  | When `sets` is null, the logger starts with 1 row.                                                   |
| E2  | The reps input placeholder is the PT's target `reps`.                                                |
| E3  | One "Lưu" button saves all rows.                                                                     |
| E4  | A pure `isTimedReps` util detects timed exercises (`s`, `sec`, `giây`, `p`, `ph`, `phút`, `'`, `"`). |
| E5  | The admin preview shows the logger read-only.                                                        |
| E6  | The "Kỷ lục mới" badge is computed on read in KAN-29.                                                |
| E7  | Hints match by row position (row n shows the previous session's set n).                              |
| E8  | Toasts follow `useExerciseCompletion` (success and error).                                           |

Note (KAN-59): The admin preview of a trainee's day shows the "Kỷ lục mới" badge read-only, same as the trainee view.

### KAN-23 (F1-F6)

| #   | Decision                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Member page: a read-only "Đã ghi:" line inside `ExerciseEditorItem`.                                                                                                 |
| F2  | `ActivityItem` gets a `kind` field; list keys are `${kind}-${id}`.                                                                                                   |
| F3  | Personal-best entries also show in the `/admin` dashboard activity list; no new tile.                                                                                |
| F4  | "Tiến bộ" compares the selected week's best with the best before it.                                                                                                 |
| F5  | When the title changed across weeks, show the latest title.                                                                                                          |
| F6  | Bodyweight-only exercises are excluded from "Tiến bộ"; an exercise with one session shows "Lần đầu".                                                                 |
| F7  | (2026-10-23, KAN-32) A record shows as two activity entries, the completion and the personal best; KAN-34 may group them visually.                                   |
| F8  | (2026-10-23, KAN-32) The record lookback is not capped (a cap would flag false records); only the activity window is capped by `limit`.                              |
| F9  | (2026-10-23, KAN-32) `ActivityItem.completedAt` is renamed `occurredAt`; KAN-33 reads logged sets from KAN-29's week data, so there is no separate admin sets query. |

## Test matrix

Filled by KAN-35 (2026-10-23). Answers accepted by Hoan on KAN-35 (comment 10041): server-action criteria are manual (no DB test harness; the KAN-36 e2e suite covers the main path), validation is unit-tested through `exerciseSetsSchema` exported by KAN-27 from `features/workouts/utils/sets.ts`, future days are refused by the server and hidden in the UI.

Levels: **unit** = Vitest on pure utils (`pnpm test`), **e2e** = Playwright against a seeded local DB (KAN-36), **manual** = checked by hand on a local DB before the PR is merged. Test files:

- `features/workouts/utils/__tests__/sets.test.ts`: `exerciseSetsSchema`, `getBestSet`, `isPersonalBest`, `getPreviousSession`
- `features/workouts/utils/__tests__/exercise.test.ts`: `isTimedReps`
- `features/workouts/utils/__tests__/week-sets.test.ts`: `groupSetSessions`, `attachSetsToWeek` (KAN-29 mapping helper)
- `features/members/utils/__tests__/progress.test.ts`: "Tiến bộ" progress rows
- `e2e/trainee-sets.spec.ts`: trainee flow (KAN-36)
- `e2e/admin-sets.spec.ts`: PT views, rows C1, C3, C4, C8, C9 (KAN-38), C11 (KAN-39), C13 (KAN-51)

### KAN-21 Store logged sets and compute bests

| ID  | Criterion (Given / When / Then)                                                                                                                               | Source      | Level  | Target                                                         | Owner          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | -------------------------------------------------------------- | -------------- |
| A1  | My past or today exercise / save 3 sets / 3 rows exist and the exercise is marked done                                                                        | AC1, Q4     | e2e    | `e2e/trainee-sets.spec.ts`                                     | KAN-27, KAN-36 |
| A2  | A future exercise / save a set / refused, nothing stored                                                                                                      | AC2, Q7     | manual | `saveExerciseSetsAction`                                       | KAN-27         |
| A3  | Another user's exercise id / save / refused, nothing stored                                                                                                   | AC3         | manual | `saveExerciseSetsAction`                                       | KAN-27         |
| A4  | Weight 40.25, 0 or 500.5 / validate / fails with a message; empty, 0.5 and 500 pass                                                                           | AC4, D3     | unit   | `sets.test.ts` (`exerciseSetsSchema`)                          | KAN-27         |
| A5  | Reps 0, 101 or 2.5 / validate / fails with a message; 1 and 100 pass                                                                                          | AC4         | unit   | `sets.test.ts` (`exerciseSetsSchema`)                          | KAN-27         |
| A6  | 11 rows / validate / fails with a message; 10 rows pass                                                                                                       | AC4, Q14    | unit   | `sets.test.ts` (`exerciseSetsSchema`)                          | KAN-27         |
| A7  | A done exercise with sets / save an empty list / sets cleared, completion kept                                                                                | D2          | manual | `saveExerciseSetsAction`                                       | KAN-27         |
| A8  | A done exercise with sets / un-mark it / sets kept, only the check is cleared                                                                                 | Q5          | manual | `completion-actions.ts`                                        | KAN-27         |
| A9  | An exercise with 3 sets / save 2 sets / exactly 2 rows remain, positions 0 and 1                                                                              | D1, D4      | manual | `saveExerciseSetsAction`                                       | KAN-27         |
| A10 | A target week with logged sets / PT copies a week onto it / refused with a Vietnamese message, nothing changes                                                | AC5, Q12    | manual | `copyWeekAction`                                               | KAN-28         |
| A11 | A target week with completions but no sets / PT copies onto it / copy succeeds                                                                                | D9          | manual | `copyWeekAction`                                               | KAN-28         |
| A12 | Sets exist / delete the exercise, copy a week or delete the member / no orphan `exercise_sets` rows (SQL count)                                               | D10, OQ1    | manual | `deleteExerciseAction`, `copyWeekAction`, `deleteMemberAction` | KAN-25, KAN-28 |
| A13 | Sets of mixed weights / `getBestSet` / heaviest wins, a tie goes to more reps                                                                                 | Q8          | unit   | `sets.test.ts` (`getBestSet`)                                  | KAN-26         |
| A14 | Bodyweight sets mixed in, or only bodyweight sets / `getBestSet` / weightless ignored; all bodyweight is null                                                 | OQ2         | unit   | `sets.test.ts` (`getBestSet`)                                  | KAN-26         |
| A15 | An earlier best of 40 kg × 10 / `isPersonalBest` with 42.5 × 5 or 40 × 11 / true                                                                              | D6, D8      | unit   | `sets.test.ts` (`isPersonalBest`)                              | KAN-26         |
| A16 | An earlier best of 40 kg × 10 / `isPersonalBest` with 40 × 10 (tie) or less / false                                                                           | D6          | unit   | `sets.test.ts` (`isPersonalBest`)                              | KAN-26         |
| A17 | No earlier weighted set (first session, or only bodyweight before) / `isPersonalBest` / false                                                                 | D11         | unit   | `sets.test.ts` (`isPersonalBest`)                              | KAN-26         |
| A18 | A bodyweight-only set / `isPersonalBest` / false                                                                                                              | OQ2         | unit   | `sets.test.ts` (`isPersonalBest`)                              | KAN-26         |
| A19 | Sessions on several dates / `getPreviousSession` / latest strictly earlier date of the same user + `youtubeId`                                                | Q6, D7      | unit   | `sets.test.ts` (`getPreviousSession`)                          | KAN-26         |
| A20 | Sets earlier the same day, by another user or with another link / `getPreviousSession` / never returned                                                       | D7, Q6, OQ1 | unit   | `sets.test.ts` (`getPreviousSession`)                          | KAN-26         |
| A21 | Any PR of the story / CI runs / `pnpm test && pnpm lint && pnpm typecheck` green                                                                              | AC6         | CI     | `.github/workflows/ci.yml`                                     | KAN-25..28     |
| A22 | Two lists of sets / `areSetsEqual` / true only for same length, order, weight (bodyweight only equals bodyweight) and reps                                    | KAN-40      | unit   | `sets.test.ts` (`areSetsEqual`)                                | KAN-40         |
| A23 | The exercise is deleted after the page loaded / save sets / not-found message, no `exercise_sets` or completion row written                                   | KAN-40, D10 | manual | `saveExerciseSetsAction`                                       | KAN-40         |
| A24 | A session with sets / re-save the same sets / rows and `created_at` untouched, so its record keeps its place in recent activity                               | KAN-40      | manual | `saveExerciseSetsAction`                                       | KAN-40         |
| A25 | The exercise is deleted after the page loaded / mark it done / not-found message, no `exercise_completions` row written (check and insert in one transaction) | KAN-52, D10 | manual | `setExerciseCompletionAction`                                  | KAN-52         |

### KAN-22 Trainee logs sets while training

| ID  | Criterion (Given / When / Then)                                                                                                                                     | Source              | Level      | Target                                                                 | Owner          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- | ---------------------------------------------------------------------- | -------------- |
| B1  | 3 sets and a previous session / open today / 3 rows, row n hints "Lần trước 40 kg × 10" from set n                                                                  | AC1, Q11, E7        | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-31, KAN-36 |
| B2  | A hint / tap it and press "Lưu" / set stored, success toast, card shows "Đã tập xong"                                                                               | AC2, E3, E8         | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-31, KAN-36 |
| B3  | A set heavier than my previous best / save / "Kỷ lục mới" on that card                                                                                              | AC3, Q10, E6        | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-31, KAN-36 |
| B4  | A tie with the previous best, or a first-ever weighted set / save / no badge                                                                                        | D6, D11             | manual     | `UserExerciseItem`                                                     | KAN-29, KAN-31 |
| B5  | A timed exercise (`30s`) / open its card / no set rows                                                                                                              | AC4, Q3             | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-30, KAN-36 |
| B6  | A future day / open its card / no set rows (the server also refuses, A2)                                                                                            | AC4, Q7             | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-30, KAN-36 |
| B7  | `isTimedReps` / `30s`, `45 sec`, `30 giây`, `1p`, `2ph`, `1 phút`, `1'`, `30"`, `30 seconds`, `1 minute`, `2 mins`, `45 secs` true; `12`, `8-12`, `10` false        | E4                  | unit       | `exercise.test.ts` (`isTimedReps`)                                     | KAN-29         |
| B8  | `sets` null / open the card / 1 row; `sets` 4 / 4 rows                                                                                                              | E1, Q1              | manual     | `SetLogger`                                                            | KAN-30         |
| B9  | 9 rows / add a row / 10 rows, then add is disabled; delete a row / 9 rows                                                                                           | Q14                 | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-30, KAN-36 |
| B10 | A row / look at the reps input / placeholder is the PT's target `reps`                                                                                              | E2                  | manual     | `SetLogger`                                                            | KAN-30         |
| B11 | A save fails (e.g. weight 40.25 bypassing the input) / press "Lưu" / error toast, nothing changes                                                                   | E8, D5              | manual     | `use-exercise-sets.ts`                                                 | KAN-30         |
| B12 | Viewport 390 px (iPhone 12) / open the day / no horizontal scroll (`scrollWidth <= innerWidth`)                                                                     | AC5                 | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-30, KAN-36 |
| B13 | Admin opens `/admin/users/[id]/preview` / the logger shows read-only                                                                                                | E5                  | manual     | `/preview`                                                             | KAN-30         |
| B14 | A week of exercises and the user's set history / `attachSetsToWeek` / sets by position, previous-session hints, record flag (tie, first-ever false)                 | E6, E7, D6, D7, D11 | unit       | `week-sets.test.ts`                                                    | KAN-29         |
| B15 | A timed exercise (`30s`) that already has logged sets / open its card / "Đã ghi:" lists them read-only, no inputs or "Lưu"; without sets nothing shows (B5)         | Q3, KAN-44          | e2e        | `e2e/trainee-sets.spec.ts`                                             | KAN-44         |
| B16 | `canShowLoggedSets` / timed reps with sets true; timed without sets false; non-timed false (the logger or the day view covers them)                                 | Q3, KAN-44          | unit       | `set-logger.test.ts` (`canShowLoggedSets`)                             | KAN-44         |
| B17 | 4 planned sets, nothing saved / save set 1 only / after reload row 1 filled and rows 2-4 still shown with their hints; saved sets beyond the plan stay, max 10 rows | E1, Q1, Q14, KAN-50 | e2e + unit | `e2e/trainee-sets.spec.ts`, `set-logger.test.ts` (`createInitialRows`) | KAN-50         |
| B18 | No saved sets, all rows blank / press "Lưu" / error toast "Nhập ít nhất một hiệp", no server call; with saved sets, blank rows still clear them (D2)                | D2, KAN-50          | unit       | `set-logger.test.ts` (`isEmptyFirstSave`)                              | KAN-50         |
| B19 | Weight typed as ",5", ".5", "5," or "5." / save / parsed as 0.5 or 5 kg; "1e2", "0x14", "," and "." still rejected; reps stay whole numbers                         | E8, KAN-50          | unit       | `set-logger.test.ts` (`rowsToSetInputs`)                               | KAN-50         |

### KAN-23 PT sees logged sets and progress

| ID  | Criterion (Given / When / Then)                                                                                                                                                           | Source       | Level     | Target                                                                       | Owner                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- | ---------------------------------------------------------------------------- | ---------------------- |
| C1  | A trainee logged sets this week / PT opens the member page / each exercise shows "Đã ghi:" sets, no edit control                                                                          | AC1, F1, Q13 | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-33, KAN-38         |
| C2  | Two sessions of the same link / "Tiến bộ" / selected week's best vs the best before it, with the kg change                                                                                | AC2, F4      | unit      | `features/members/utils/__tests__/progress.test.ts`                          | KAN-32                 |
| C3  | Same as C2 / open the Summary tab / list renders both bests and the difference                                                                                                            | AC2, Q9      | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-34, KAN-38         |
| C4  | A trainee with no logged sets / open the Summary tab / "Tiến bộ" empty state                                                                                                              | AC3          | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-34, KAN-38         |
| C5  | One weighted session only / "Tiến bộ" / shows "Lần đầu"                                                                                                                                   | F6, D11      | unit      | `progress.test.ts`                                                           | KAN-32, KAN-34         |
| C6  | A bodyweight-only exercise / "Tiến bộ" / excluded                                                                                                                                         | F6, OQ2      | unit      | `progress.test.ts`                                                           | KAN-32                 |
| C7  | The title changed across weeks (same link) / "Tiến bộ" / shows the latest title                                                                                                           | F5           | unit      | `progress.test.ts`                                                           | KAN-32                 |
| C8  | A trainee sets a personal best / PT opens member activity and `/admin` / a record entry, keys `${kind}-${id}`                                                                             | Q10, F2, F3  | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-32, KAN-34, KAN-38 |
| C9  | An exercise with logged sets / PT deletes it / the confirm says the sets are deleted too                                                                                                  | OQ1          | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-33, KAN-38         |
| C10 | Every new admin query / code review / behind `requireAdmin()` or the admin layout                                                                                                         | AC4          | manual    | `features/members/*`, `dashboard-queries.ts`                                 | KAN-32                 |
| C11 | An exercise with logged sets / PT changes its video link / confirm appears; dismiss keeps sets and link, accept wipes the sets and saves the link                                         | OQ1          | e2e       | `e2e/admin-sets.spec.ts`                                                     | KAN-39                 |
| C12 | Same link (any URL form) or no sets / PT saves / no confirm; the server asks `confirmResetSets=true` only for a new link over existing sets                                               | OQ1          | unit      | `exercise.test.ts` (`shouldConfirmLinkChange`), `workout-schemas.test.ts`    | KAN-39                 |
| C13 | A page loaded before the trainee logged sets / PT deletes the exercise / the server refuses without `confirmDeleteSets`, the warning confirm appears; dismiss keeps the exercise and sets | OQ1          | e2e, unit | `e2e/admin-sets.spec.ts`, `workout-schemas.test.ts` (`deleteExerciseSchema`) | KAN-51                 |

### Video review checklist

Screen recordings for UI/UX review, made on a seeded local DB before the KAN-24 sign-off. Phone flows are recorded at 390 px wide.

| ID  | Flow recorded                                                                              | Rows covered    | Owner  | Reviewer | Status  |
| --- | ------------------------------------------------------------------------------------------ | --------------- | ------ | -------- | ------- |
| V1  | Trainee logs sets on a 390 px phone: fill rows, add and delete a row, "Lưu", "Đã tập xong" | A1, B2, B9, B12 | KAN-30 | Hoan     | Pending |
| V2  | Hint copy "Lần trước 40 kg × 10" per row and one tap to copy it                            | B1, B10         | KAN-31 | Hoan     | Pending |
| V3  | "Kỷ lục mới" badge after beating the previous best (and no badge on a tie)                 | B3, B4          | KAN-31 | Hoan     | Pending |
| V4  | Timed exercise and future day show no logger                                               | B5, B6          | KAN-30 | Hoan     | Pending |
| V5  | Admin member page: read-only "Đã ghi:" sets, delete confirm mentions sets                  | C1, C9          | KAN-33 | Hoan     | Pending |
| V6  | Summary "Tiến bộ": bests and change, "Lần đầu", empty state                                | C3, C4, C5      | KAN-34 | Hoan     | Pending |
| V7  | Dashboard activity: personal-best entry on `/admin` and in member activity                 | C8              | KAN-34 | Hoan     | Pending |
