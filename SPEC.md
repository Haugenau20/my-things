# Product specification

Version: 1.0 | Status: initial implementation baseline | Date: 2026-10-10

## 1. Purpose and context

The owner expects to move country in approximately six months and needs to inventory possessions,
choose what to store/sell/give away/take, and visually browse retained possessions while abroad. No exact
move date has been supplied. The inventory is primarily a personal organizing tool, not an insurance,
accounting, marketplace, or photographic-archive product.

The owner is a software engineer using Windows, has React/TypeScript and Firebase experience, and will
use agentic coding. Building the application is part of the appeal. All production infrastructure must
be managed; no self-hosted server. No paid off-the-shelf inventory subscription. Blaze billing and US
photo storage are accepted, but unnecessary recurring costs remain undesirable.

## 2. Scope and actors

V1 has one owner and one inventory. A second user is a possible future need, not a current requirement.
The application works on an iPhone and a desktop browser; both clients use the same records and photos.
Individual items are the default. A grouped entry is allowed when its contents share a location and
moving outcome.

### In scope

Phone capture; multiple photos; optional item details; room and box management; explicit review inbox;
photo gallery and compact table; search and filters; bulk edits; simple disposition tracking; owner-only
login; private photo access; trash; export and restore; basic mobile Home Screen presentation when the
core workflow is stable.

### Not in scope

IAP, YubiKey integration, custom WebAuthn, native apps, offline capture or offline inventory browsing,
public sharing, invitations/roles, marketplace integrations, interested-buyer tracking, pickup scheduling,
AI naming/OCR, receipts/document attachments, barcode scanning, arbitrary location trees, shelves/storage
units, custom field builders, automatic currency conversion, and a general-purpose multi-tenant service.
Do not add these without an explicit scope decision. Basic notes are the escape hatch for uncommon data.

## 3. Primary flows

### CAP-01: Capture an item

1. Open Capture on the phone. Optionally select the current room; keep it selected for subsequent items
   within that capture session, with the selected room always visible.
2. Take a photo or select existing photos. Enter a short name. Both a nonblank name and at least one
   successfully stored photo are required for a completed inventory entry.
3. Optional details are collapsed by default: quantity, estimated value/currency, serial number, notes,
   category, location, and moving decision/progress.
4. Choose **Save & next**. Show processing/upload progress and do not claim success before the server
   acknowledges the required photo files and the completed record.
5. Reset the item form but retain the capture room. The item goes to the review inbox by default.
   **Save as reviewed** is an explicit alternative.

The first selected photo becomes the cover unless changed. One capture creates one item even when several
photos are selected. There is no automatic one-file-per-item batch import in V1.

A draft used for upload recovery is not a completed inventory item. Interrupted saves must be visible in
a recovery state, not silently counted as completed entries. See [Photo pipeline](docs/PHOTO_PIPELINE.md).

### ORG-01: Review on desktop

The inbox contains entries whose review status is `needs_review`. Show a large photo beside editable
fields and allow navigation to the next item. Optional fields may remain blank on a reviewed item.
Changing a field does not automatically mark the item reviewed or unreviewed.

Provide a photo grid and a compact table using the same filters and selection. Bulk actions include
mark reviewed, set category, change current room, pack into a box, change moving decision/progress, and
move to trash. Update only explicitly chosen fields. Show the selected count and individual failures;
never report an entire batch as successful when only some items changed.

### LOC-01: Rooms now, boxes later

An item has exactly one current location: a room, a box, or unassigned. It may also have an original room.
Original room means the first room recorded for that item, not a second claim about its current location.

Example: Bedroom -> Living room -> Box B012. Current location changes twice; original room stays Bedroom.
Packing an item does not reset the original room or mark its moving task complete. A room/box rename does
not change its stable ID or require rewriting items. Boxes are a flat list, not nested containers.

For a new item captured in a room, set both room fields to that room. When an item initially has no
original room, its first assignment to a room fills it. Later moves preserve it; correcting an erroneous
original room is a separate explicit edit.

A box page shows its current contents as photos. A room page means **currently in this room**. Provide a
separately labeled **Original room** filter for recalling possessions after packing. No need to track a
box's room in V1.

Archive unused rooms/boxes rather than remove labels referenced by history. Require current owned items
to be moved out before archiving their room/box. Retained references from completed/trash records and
original rooms remain readable. Warn about duplicate names/labels rather than relying on them as IDs.

### MOV-01: Moving decisions and progress

Decisions: `undecided`, `store`, `take`, `sell`, `give_away`.
Progress: `not_started`, `in_progress`, `completed`.

These are independent of review status, upload status, and location. `undecided` only permits
`not_started`. Changing decision resets progress to `not_started` after warning when previous progress
would be lost. A note can hold lightweight selling information; listing/buyer systems are not required.

Completing `store` or `take` leaves the item owned and visible in the default inventory. Completing `sell`
or `give_away` moves it to the completed archive, clears its current location to unassigned, and preserves
its original room and photos. Confirm that removal from its room/box in the completion action. Undoing
completion restores ownership but does not invent a new physical location. Reopen a disposed entry
before assigning it a current room or box.

An entire grouped entry shares one decision/progress/location. To split a group across boxes or outcomes,
create separate entries and adjust quantities; automatic partial-quantity workflows are deferred.

### BRW-01: Browse while abroad

Default view: photo grid of ready, nontrashed items that are still owned. Each card shows cover photo,
name, current location, and concise workflow/review indicators. Provide search over name, serial number,
notes, and category, plus filters for current room, box, original room, decision, progress, review status,
and archive/trash scope. Searching only loaded cards must never masquerade as a whole-inventory search.

Search is case-insensitive. Exact serial numbers remain displayable. A fancy search engine, semantic
search, and relevance ranking are not required. Show a clear indexing/loading state when the local
metadata index is incomplete. Thumbnails are loaded on demand; full detail photos load when opened.

Completed sales/donations are searchable in a separate archive. Trash is separate from that archive.
Searching by a box label can be offered, but direct box navigation is sufficient for V1.

### DEL-01: Trash and permanent deletion

Trash sets a deletion timestamp without deleting photos. Restore clears it and preserves the other item
fields, including whether the item was previously sold/given away. Permanent deletion is only available
from trash, needs explicit confirmation, and removes associated photo objects before removing the final
item document. A partial cleanup remains retryable; it must not be reported as finished.

Removing a photo from an item cannot leave a ready item with no ready photos. Changing/removing the cover
selects another ready photo explicitly or deterministically. Replacing a photo uses a new photo ID.

### BAK-01: Export and restore

Before relying on the inventory, implement a desktop export containing versioned records, a readable CSV,
and actual detail/thumbnail files. A cloud URL list is not a backup. Include retained completed and trash
records. An ordinary full export must not claim completeness when referenced photo files are missing.

Restore into an empty, already authorized destination inventory; preserve relationships and remap storage
paths. Do not restore account authorization from the archive. Demonstrate a round trip and photo checksums.
A static offline HTML gallery is useful but optional, not a release gate. See the
[export contract](docs/EXPORT_FORMAT.md) for exact scope and incomplete-operation handling.

## 4. Fields and meaning

| Field | Requirement / meaning |
| --- | --- |
| Name | Required, trimmed, nonblank |
| Photos | At least one ready photo for a completed item; multiple supported |
| Quantity | Optional entry; defaults to integer 1 |
| Estimated value | Optional; total for this entry, not per unit; currency required when a value exists |
| Serial number | Optional; a string, including leading zeros |
| Notes / category | Optional plain text; no rich HTML |
| Current location | Room, box, or unassigned |
| Original room | Optional retained room reference |
| Review | Explicit needs-review/reviewed status |
| Moving workflow | Decision plus progress, with a completion timestamp |

No currency has been selected by the owner. Capture must work without one. Ask for currency when a value
is first entered, and offer to save it as the inventory default. Keep a currency on each stored value;
changing the default does not reinterpret existing values. Do not sum different currencies into one total.

The detailed schema and editable size limits are in [Data model](docs/DATA_MODEL.md).

## 5. Nonfunctional requirements

**Sign-in:** Only the existing, administratively verified owner account may sign in to the production
application. Disable end-user account creation after owner bootstrap; reject other Google accounts
during Firebase Authentication. Keep the production Auth user set limited to the owner. A public login
page is acceptable. Changing to magic links would still require the same closed account policy.

**Privacy:** Only the configured owner can access records, filenames, photo bytes, exports, or storage
listings. A public login page is acceptable. No inventory content in public Hosting assets, telemetry,
URLs, or source-controlled fixtures. Do not use permanent bearer-style photo download links in the UI.

**Reliability:** A success indicator means a server-acknowledged save. Surface pending, failed, and unknown
outcomes, use stable IDs for retry, and do not lose unrelated fields during bulk or concurrent edits.
There is no promise of cross-service atomicity or of completing uploads after a phone closes the page.

**Usability:** Phone-first capture, desktop-first bulk editing, readable photo cards, accessible labels,
keyboard-operable controls, visible focus, and destructive-action confirmation. Preserve scroll/filter
position when returning from item details.

**Performance:** Provisional test scale: 5,000 item records with synthetic metadata and a representative
photo subset. This is a design/test target, not an estimate supplied by the owner. Avoid eager full-size
photo downloads, unbounded retries, and all-at-once browser image conversion.

**Compatibility:** Manually test the owner's actual iPhone in Safari and Windows in Edge or Chrome.
Test Home Screen mode before advertising support for it. Browser automation is additional evidence,
not a substitute for a real camera test.

**Cost:** Managed Firebase services, static hosting, client-side photo derivatives, no required custom
domain, no always-running custom server, no paid search/AI/analytics dependency. Budget alerts are not a
zero-spend guarantee; see [References S01](docs/REFERENCES.md#s01) and
[S02](docs/REFERENCES.md#s02).

## 6. Definition of usable V1

V1 is usable when the 20-item/two-room acceptance scenario in the README passes, cross-account and
unauthenticated access tests pass for records and photos, failed saves and partial deletions recover,
and an export restores into an empty, isolated, administrator-authorized verification inventory with
matching records and photo checksums. Under the owner's single-project decision, this cloud verification
destination is separate from the main inventory in the same project.

Do not classify optional polish as a dependency for starting real inventory work. Do not classify
security, backup recovery, or reliable photo storage as optional polish.
