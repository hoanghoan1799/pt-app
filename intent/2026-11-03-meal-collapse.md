# Intent: Collapse and expand meal cards

- **Author:** Hoan
- **Status:** accepted
- **KAN key:** KAN-88 (sub-task KAN-89 [FE])

## Problem

A day's meal plan shows every meal fully open (plan, logs, buttons). With 4-6 meals the trainee and the PT scroll a long page to reach one meal. Hoan (2026-11-03): "add a collapse/expand icon for each meal, and buttons to collapse all or expand all above the meal plan title".

## Proposed outcome

Each meal card has a chevron that folds it down to its header and a one-line kcal summary. A "Thu gọn tất cả" / "Mở tất cả" button on the "Plan bữa ăn" title row folds or opens every meal of the day.

## Affected users and systems

Trainees (Dinh dưỡng page) and PTs (member Nutrition tab). Frontend only; no schema, server action or query changes.

## Constraints

Vietnamese UI copy, mobile-first (390px), touch targets of at least 44px, accessible disclosure buttons (`aria-expanded`, `aria-controls`).

## Open questions

1. Should the collapse state be remembered after a reload? Default: no, every visit starts expanded.

## Out of scope

Persisting collapse state; collapsing the day summary cards.
