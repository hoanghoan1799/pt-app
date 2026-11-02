# Intent: Install pt-app on the home screen as an app (PWA)

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-79

## Problem

Trainees open pt-app in a phone browser tab and have to find it again every day. The app already has `app/manifest.ts` and `appleWebApp` metadata, but the manifest has no icons and there is no service worker, so Android Chrome does not offer "Install app" and iOS puts a page screenshot on the home screen instead of an icon.

## Proposed outcome

- A trainee can add pt-app to the home screen on Android (Chrome) and iOS (Safari). It opens full screen with the PT App icon, on the workout page.
- The app tells the trainee how to install it: an install button on Android, a short share-sheet hint on iOS. Both disappear once installed or dismissed.
- With no network, the installed app shows a Vietnamese offline page instead of the browser error.

## Affected users and systems

Trainees (user site). Root layout metadata, `app/manifest.ts`, `next.config.ts`, a new `features/pwa`, static icons in `public/`.

## Constraints

Vietnamese UI copy, mobile-first at 390 px, no schema change, no new runtime dependency. Personal data (workouts, meals, weight) must never be stored by the service worker.

## Open questions

See `docs/specs/pwa-install.md`.

## Out of scope

Push notifications, offline logging, app store publishing. (A separate PT Admin app was first out of scope and added on 2026-11-02, spec D8.)
