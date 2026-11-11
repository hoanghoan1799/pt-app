# Plan: profile page redesign

Spec: `docs/specs/profile-redesign.md`. One PR into `main` (#193).

1. `features/social/utils/streak-rules.ts`: pure `computeDayStreak` and `canViewTrainingStats`, with unit tests.
2. `features/social/services/profile-stats.ts`: `getTrainingStats(userId)` (server-only).
3. `profile-queries.ts`: add `role` to `ProfileData` via `toAdminRole`.
4. UI: `ProfileAvatar` (camera + lazy `AvatarSheet`), `ProfileStats`, new header in `ProfileView`; left-align `BioEditor`.
5. Both profile pages compute visibility and fetch stats; skeletons match the new layout.
6. vi/en/zh strings; `pnpm verify`; browser check at phone width in light and dark; update the Blueprint artifact.
