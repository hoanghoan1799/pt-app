# Profile page redesign

Status: approved by Hoan on 2026-11-11 (prototype https://claude.ai/artifact/FPgvAf4HNPV4cW74Fbi36f). No Jira ticket, per Hoan's rule for this round of UI work.

## Goal
Restyle the social profile page (trainee, PT, super admin) to the new dark fitness mockup, keeping only what fits the app's data model.

## Decisions
- D1 Header card: avatar left, name + verified badge, friend count (trainees), role chip (Trainee / PT / Super admin) right; bio below; existing actions stay.
- D2 Camera button on the avatar, own profile only, opens the existing avatar sheet.
- D3 Trainee stats row: Workouts = distinct workout days with at least one completion; Day streak = consecutive such days back from today, starting from yesterday when today has none; Total sets = rows in `exercise_sets`. No XP (the app has none).
- D4 Stats visibility: owner, accepted friends, any admin viewer (admin pages are already scoped). Others see a locked note. The query does not run when hidden.
- D5 Dropped from the mockup: albums (one photo per post), "Suggested for you" and Follow (friends are added by email), the Profile tab and the settings gear.
- D6 Post card, composer and privacy picker are restyled in the feed redesign, not here. Hoan asked for the privacy picker to be a list of options, not cycle-on-tap.
- D7 No schema change.

## Test matrix
| Case | Expected |
| --- | --- |
| Streak: no completions | 0 |
| Streak: today + 2 days before | 3 |
| Streak: none today, yesterday + day before | 2 |
| Streak: gap two days ago | stops at the gap |
| Duplicate / unsorted dates | same result |
| Viewer is owner / friend / admin | stats shown |
| Viewer is stranger or pending request | locked note, no query |
| Profile is PT / super admin | no stats row |
