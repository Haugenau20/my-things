# PR-08: Phone browse + tab bar

Screen **E**.

## Scope (≤850px)
- Hide the sidebar and panel. Add a **bottom tab bar**: Things · Review {n} · More (More = Where everything is, Manage rooms & boxes, Trash, Backup & settings, Sign out). Respect `env(safe-area-inset-bottom)`. 44px+ targets.
- Things view: Georgia 30px title "Your things" + count; search; a **horizontally scrolling chip row** with **Room ▾** and **Box ▾** first (bottom-sheet pickers with counts), then Decision ▾ and More ▾. Active chips are dark, with ×.
- A summary line under the chips, e.g. "18 things in B012 · from 4 rooms".
- 2-column grid (`grid-auto-rows:max-content`), square thumbnails, name, and the room tag (or the box tag when filtered by room).
- Floating **+ Add** button (bottom-right, above the tab bar; `#84502e`, radius 28) → opens the capture flow from PR-09.
- Tapping a card opens the full item view (the existing ItemEditor, made responsive).

## Acceptance criteria
- Filters and scroll position survive opening an item and coming back.
- Works in iPhone Safari, including Home Screen mode, with no horizontal page scroll.
