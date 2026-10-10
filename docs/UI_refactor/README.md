# My things: workspace redesign handoff

Source repo: `Haugenau20/my-things` (main). Mockups: open `Agreed Mockups.dc.html` in a browser. They are static; the screens are labelled **A–F** and are referenced from every PR file.

## Why

The signed-in page stacks Backup, Restore, Settings, Photo maintenance, capture, seven filter dropdowns and an always-visible bulk editor, roughly in code order. There is no clear path through it. The redesign splits the work by device:

- **Desktop is for overview and editing**: browse, filter, inspect, move, pack, decide, review, trash.
- **The phone is for capture**: as few things on screen as possible. Photo → name → next.

## Agreed decisions

1. **Room and Box are two independent facets, with equal priority.**
   - **Room** = where a thing belongs. It is a permanent tag set at capture and never changed by packing. It is editable, but only explicitly.
   - **Box** = where it is packed: `Not packed` | a box | `Gone` (sold/given away, i.e. `isDisposed`).
   - A thing is never "in a room *or* a box"; it always has a room tag *and* a box state. Card copy: `Bedroom · B012`.
   - The "current room" and "original room" concepts are removed from the UI. Moving a thing between rooms before packing just edits its room; that history is intentionally dropped.
2. **No migration: wipe and redo the schema.** The app is new and holds one test item. Items, rooms, boxes and photos are wiped; owner authorization is kept. The schema goes to v2 with `roomId` + `boxId` only, and there is no legacy compatibility. A null room shows as "No room". See PR-01.
3. **Gone** is a value on the Box axis (it replaces the "Completed archive" scope). Box "All" means still owned (excludes Gone). Trash stays separate.
4. **Desktop shell = screen A (option 3a)**: a slim nav sidebar (200px), with Room and Box chip rows at equal weight above the grid. The rows combine (Room ∩ Box), the counts cross-filter, and a "Group by Room / Box / None" switch sections the grid.
5. **Right panel** (380px, collapsible) has two modes: **Inspector** for the selected thing (screen B) and **Capture** (screen C). Collapsed = the grid gets the full width.
6. **Bulk editing is contextual**: a floating bar that appears only when something is selected, plus group actions such as "Pack into box…".
7. **Admin leaves the workspace**: Backup export, Restore, Inventory settings and Photo maintenance move to a "Backup & settings" view reached from the sidebar footer.
8. **"Where everything is"** overview (screen D): Room rows × Box columns, where every cell is a filter link. Ships as its own PR.
9. **Phone**: browse (screen E) with a bottom tab bar (Things / Review / More) and a "+ Add" button that opens the **3-step capture** (screen F): shoot → name → saved toast with Undo, back to the camera. The room is sticky at the top. **No "Save as reviewed" and no details on the phone.**

## Unchanged constraints (from SPEC / SECURITY; do not regress)

- A success indicator means a server-acknowledged save. Partial and failed bulk results are shown per item, and failed items stay selected.
- Optimistic revision checks on edits ("changed elsewhere" handling stays).
- Destructive actions are confirmed. Permanent deletion happens only from Trash.
- Photo pipeline, interrupted-capture recovery (RecoveryPanel), the restore-in-progress lock and owner-only access all stay as they are.
- Search must never pretend to cover the whole inventory while the metadata index is incomplete.
- Accessible labels, keyboard operability, visible focus (`outline: 3px solid #a6562e`), 44px touch targets.

## Suggested PR order

| # | PR | Depends on | Screens |
|---|----|-----------|---------|
| 01 | [Room tag + Box state data model](PR-01-data-model.md) | — | model card |
| 02 | [App shell, sidebar, Backup & settings view](PR-02-app-shell.md) | — | A |
| 03 | [Room × Box chip filters, search, group-by](PR-03-filter-bar.md) | 01, 02 | A |
| 04 | [Item cards and grouped grid](PR-04-cards-grid.md) | 01, 03 | A |
| 05 | [Selection + contextual bulk bar](PR-05-bulk-bar.md) | 04 | A |
| 06 | [Inspector panel](PR-06-inspector.md) | 01, 04 | B |
| 07 | [Desktop capture panel](PR-07-desktop-capture.md) | 06 | C |
| 08 | [Phone browse + tab bar](PR-08-phone-browse.md) | 03, 04 | E |
| 09 | [Phone 3-step capture](PR-09-phone-capture.md) | 01, 08 | F |
| 10 | ["Where everything is" overview](PR-10-overview.md) | 01, 03 | D |

PRs 02 and 01 can run in parallel. Keep each PR shippable on its own, and update the docs (SPEC, DATA_MODEL, EXPORT_FORMAT, TEST_PLAN) in the same PR that changes the behaviour.

## Visual system (unchanged, from `src/styles.css`)

| Token | Value |
|---|---|
| Page background | `#faf8f3` |
| Ink | `#263c32` |
| Muted text | `#626b60` / description `#5d685e` |
| Panel (capture, sand) | `#eeeade` · sidebar `#f2f0e8` |
| Surface (inputs, cards) | `#fffefa`, card border `#deded2`, input border `#b7b8a8` |
| Primary button | `#84502e`, hover `#663d23` |
| Secondary button border / hover | `#8a9687` / `#e1e7dc` |
| Eyebrow | `#84613f`, 11px, 650, letter-spacing 2px, uppercase |
| Room tag | bg `#e8eee4`, text `#365a3d` |
| Box tag (kraft label) | bg `#f7f0df`, border `#c6a77c`, text `#84613f`, monospace |
| Needs-review dot | `#84502e`, 8px |
| Error | `#9d322d` · confirmation `#fff3da` / `#ba9c6d` |
| Photo placeholder | `#e8e8df` |
| Serif | Georgia (headings 28–46px, letter-spacing about −1px) |
| Sans | 'Segoe UI', system-ui |

Decision colour bar (screen D legend, optional in the cards): take `#657a60`, store `#a8b3a2`, sell `#dbbf88`, give away `#a47150`, undecided `#deded2`.
