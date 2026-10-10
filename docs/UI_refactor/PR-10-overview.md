# PR-10: "Where everything is" overview

Screen **D**.

## Goal
One page that answers "where is everything?" in every phase of the move.

## Scope
- New view, linked from the sidebar nav (and from More on the phone).
- Header: eyebrow "Overview", Georgia 46px "Where everything is", and on the right the totals "{n} not packed · {n} in {k} boxes · {n} gone".
- A matrix in a `#fffefa` bordered card: **rows = active rooms (+ "No room" if any)**, **columns = Not packed · each active box · Gone**, plus a Total column. Box headers are monospace `#84613f`.
- Cell: a count in a 46px-tall rounded tile. Tint by column type: not packed `rgba(54,90,61,α)`, box `rgba(198,167,124,α)`, gone `rgba(98,107,96,α)`, with α scaled by count. 0 shows a muted "·".
- **Clicking a cell** goes to Things with Room = row and Box = column. Clicking a row label or column header sets just that facet.
- Legend + the selected-cell summary at the bottom.
- Many boxes: the matrix scrolls horizontally with a sticky first column. On the phone it shows as a list of rooms, each with box counts.

## Acceptance criteria
- The counts match the Things view for the same Room × Box selection, using the same filter function.
- Trash is excluded. Gone counts disposed items.
