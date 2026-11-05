# Intent: Mobile UI/UX polish for trainees and PTs

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-114

## Problem

Several screens feel unfinished on a phone. The nutrition tab shows the meal plan first and the calendar colours say "macros on target", not "I ate my plan". Confirmations use the browser `window.confirm`. The header has loose icons and no theme or notification setting. The admin unread badge is stale until a reload, and chat has no typing indicator. Copying a plan offers past days in a plain checkbox list. After a password change the user stays on the form.

## Proposed outcome

- The nutrition tab reads top to bottom as Calendar, Daily goals, Meal plan, and the calendar colours show how much of the planned meals the trainee marked eaten.
- Every confirmation is an in-app dialog; no `window.confirm` is left.
- Both sites have one gear menu (theme, push notifications) and one avatar menu (change password, log out).
- Unread badges update live on both sites and each side sees when the other is typing.
- Copying a plan uses a month picker that does not accept past days.
- A password change ends with a redirect and a toast.
- The admin dashboard has quick actions, per-trainee unread badges, and an add-user sheet that never hides the one-time password.

## Affected users and systems

Trainees and admins, mobile only. Nutrition tab, meal plan cards, copy plan sheet, header on both sites, chat transport and unread routes, change password page, admin dashboard and add-user sheet, food chips. No schema change.

## Constraints

Mobile first (390 px, check 320 px). Vietnamese UI copy. Schema untouched. One PR per sub-task of KAN-114, in the order set in the plan. Prototype: https://claude.ai/artifact/GrLoPEkZJwDmsHka4hvyd2

## Open questions

None blocking. See `docs/specs/mobile-ui-polish.md`, Open questions.

## Out of scope

Desktop and tablet layouts, a new dashboard page, changing the tab bar, message edit/recall/delete (deferred to a later story), a "Your Stats" section on the nutrition tab, General/Account/Admin settings pages, Edit profile.
