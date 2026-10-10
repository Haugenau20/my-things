# PR-02: App shell, sidebar, Backup & settings view

Screen **A** (sidebar), all desktop screens.

## Goal
Give the signed-in app a clear structure: a slim left sidebar for navigation and a main area for content. Move admin out of the workspace.

## Scope
- New layout in `InventoryWorkspace.tsx`: `grid-template-columns: 200px minmax(0,1fr) [380px panel, from PR-06]`. The page background stays `#faf8f3`. Sidebar: bg `#f2f0e8`, `border-right:1px solid #deded2`, padding `26px 16px`.
- Sidebar contents, top to bottom:
  1. Wordmark (the existing `.brand-mark` at 34px).
  2. **+ Add a thing** (secondary style; opens the capture panel in PR-07; until then it scrolls to or focuses the existing CaptureForm). Keyboard shortcut `N`.
  3. Nav: **Things** (count) · **Review inbox** (brown count badge `#84502e`) · **Where everything is** (PR-10) · **Manage rooms & boxes** (existing LocationManager, moved into its own view).
  4. Footer: Trash · Backup & settings · Sign out. Show "✓ Owner verified" here instead of the large access badge.
- New **Backup & settings** view that hosts the existing `ExportPanel`, `RestorePanel`, `InventorySettings` and `OrphanInspection` as sections (they can stay as `<details>` or become headed sections).
- Remove the four `<details>` rows and the "My things / Owner access verified" hero from the workspace.
- The global restore-in-progress alert stays visible across all views (a banner at the top of main).
- `RecoveryPanel` and `DeletionRecovery` stay at the top of the Things view.
- Simple view state (or hash routing) for Things / Review / Overview / Rooms & boxes / Trash / Settings. The browser back button should work if hash routing is used.
- ≤850px: the sidebar is hidden. PR-08 adds the phone tab bar; until then a simple top menu is fine.

## Acceptance criteria
- On load, the first thing on screen is the inventory (or the recovery panel, if there is something to recover). No admin rows above it.
- Every capability that exists today is still reachable in at most 2 clicks.
- Export and restore still disable the rest of the app while busy (the existing `inert` fieldset behaviour).
- Keyboard: every nav item is focusable with a visible focus ring.
