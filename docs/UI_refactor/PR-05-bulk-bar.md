# PR-05: Selection + contextual bulk bar

Screen **A** (bar shown in the 1a/2a explorations; same visual).

## Goal
Remove the always-visible `BulkEditor` block. Show bulk actions only when something is selected.

## Scope
- A floating bar at the bottom-centre of the main column (`position: sticky` or fixed within main). Bg `#263c32`, text `#faf8f3`, radius 10, padding `12px 14px 12px 18px`, shadow `0 10px 30px rgba(38,60,50,.25)`.
- Contents: **{n} selected** · Mark reviewed · Set room · Pack / unpack · Decision · Progress · Category · Trash (or Restore when in Trash) · on the right **Select all {n} filtered** and **Clear**.
- Each action opens a small popover with its single input (reuse the `BulkEditor` command logic). Warnings and confirmations (decision reset, completing sell/give away, trash) use the existing `.confirmation` content inside the popover.
- Results: a toast/status in the bar, "{saved} saved · {failed} not saved", with an expandable per-item list. Failed items stay selected (existing behaviour).
- Keyboard: `Esc` clears the selection, and `Shift`+click selects a range.

## Acceptance criteria
- With nothing selected, no bulk UI is visible.
- Behaviour matches the current BulkEditor for every command, including the revision checks and partial-failure reporting.
- The bar never covers the last row of cards (main gets bottom padding while the bar is visible).
