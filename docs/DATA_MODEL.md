# Data model

Schema version: 2. Root/item/location contracts are implemented. Restore reports are an additional
optional operational collection; this addition does not rewrite existing inventory records.

## 1. Paths and ownership

```text
/inventories/{inventoryId}                 trusted owner binding + inventory settings
/inventories/{inventoryId}/rooms/{roomId}
/inventories/{inventoryId}/boxes/{boxId}
/inventories/{inventoryId}/items/{itemId}
/inventories/{inventoryId}/restores/active
/inventories/{inventoryId}/restores/active/records/{kind}_{recordId}

Storage:
inventories/{inventoryId}/items/{itemId}/photos/{photoId}/detail.jpg
inventories/{inventoryId}/items/{itemId}/photos/{photoId}/thumb.jpg
```

Use `(default)` Firestore in Standard edition. Use opaque stable item, photo, room, and box IDs; do not
put names, serial numbers, or room labels in object paths. `main` is a proposed inventory ID within each
separate environment. IDs are not secrets or authorization credentials. Application IDs must match
`[A-Za-z0-9_-]{1,128}` and occupy one path segment; reject slashes, traversal components, and duplicate
IDs during import. Photo hashes are 64 lowercase hexadecimal characters, and dimensions/sizes are
positive integers within the documented limits.

The inventory root is created by a trusted administrator, never by arbitrary authenticated clients.
It contains `schemaVersion: 2`, `ownerUid`, `displayName`, `defaultCurrency: string | null`, `createdAt`,
and `updatedAt`. Clients may update only display name, default currency, and update timestamp. The owner
binding and schema version are not client-editable. No membership/invitation collection in V1.

## 2. Item contract

The following TypeScript notation describes stored values after server timestamps have resolved. Document
IDs come from paths; add `id` in repository objects and exports, not as a second mutable source of truth.

```ts
import type { Timestamp } from "firebase/firestore";

type Decision = "undecided" | "store" | "take" | "sell" | "give_away";
type Progress = "not_started" | "in_progress" | "completed";

type Money = {
  amountMinor: number; // nonnegative safe integer; TOTAL for the entry
  currency: string;    // supported ISO currency code, e.g. EUR; not a default choice
};

type PhotoFile = {
  storagePath: string;
  contentType: "image/jpeg";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;      // hash of the generated file bytes
};

type Photo = {
  id: string;
  state: "pending" | "ready" | "deleting";
  detail: PhotoFile;
  thumbnail: PhotoFile;
};

type ItemDocument = {
  schemaVersion: 2;
  revision: number;
  name: string;
  quantity: number;
  estimatedValue: Money | null;
  serialNumber: string | null;
  notes: string;
  category: string | null;
  roomId: string | null; // persistent room tag
  boxId: string | null;  // null = not packed (or Gone)
  reviewStatus: "needs_review" | "reviewed";
  decision: Decision;
  progress: Progress;
  completedAt: Timestamp | null;
  recordState: "draft" | "ready" | "deleting";
  coverPhotoId: string | null;
  photos: Photo[];     // ordered; embeds metadata, never image bytes
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
```

Create records with explicit defaults: quantity 1, no value/serial/category/room, empty notes,
no packing box, needs-review, undecided/not-started, no completion/deletion timestamp, revision 1.
Capture-room selection sets roomId only. Prepare derivative metadata before creating a
cloud draft so pending entries contain exact expected paths, sizes, and checksums.

`photos` only contains metadata and is deliberately bounded. If this model later becomes unwieldy,
migrate to photo documents deliberately; do not silently introduce two competing sources of truth.

## 3. Room and box contracts

Rooms contain `schemaVersion`, `name`, `sortOrder`, `revision`, `createdAt`, `updatedAt`, and
`archivedAt: Timestamp | null`. Boxes have the same fields except `label` replaces `name`; an optional
plain-text `notes` field defaults to empty. Suggested box labels are B001, B002, and so on.

Names/labels can change; IDs cannot. Warn about duplicate labels, but never treat labels as identifiers
or promise cross-tab uniqueness without implementing it. Archived locations are not new assignment
choices. Keep their labels available wherever existing references are displayed. A box cannot be
archived while it holds owned items. Rooms can be archived while tagged items remain; their tags stay
readable in filters, groups and the overview with an “(archived)” label.
Archived locations can be explicitly reactivated. Restore of an owned trashed item requires its retained
packing box to be active first; item fields remain unchanged.

## 4. Invariants and transitions

| Operation | Required behavior |
| --- | --- |
| Set room | Explicitly set/clear roomId, preserving boxId |
| Pack / rebox | Set boxId, preserving roomId and workflow |
| Unpack | Clear boxId, preserving roomId |
| Change decision | Reset progress/completion; warn about discarded progress |
| Complete store/take | Still owned; preserve room and packing |
| Complete sell/give-away | Gone; clear boxId, preserve roomId and photos |
| Reopen | Clear completion timestamp; remain Not packed |
| Trash / restore | Set/clear deletion timestamp without changing tags, workflow or photos |
| Permanent delete | From Trash only; marker, object cleanup, then document deletion |

Nullable roomId/boxId references point inside this inventory. Both facets can be present together.
Undecided requires not_started and no completion time. Other decisions have a completion time exactly
when completed. A Gone entry has boxId null; pack is rejected until reopened. Explicit room changes
remain possible on Gone entries. Assignment uses active destinations; retained archived tags stay valid.

A ready record may have no photos (`photos: []`, `coverPhotoId: null`). If any photo is ready, its cover
refers to a ready photo in that same item; otherwise the cover is null. Photo absence is not a draft.
A draft can contain pending photos and have no cover yet. Existing ready records can have additional
pending/deleting photos; continue showing their ready photos and expose the unfinished operation.
Do not claim a photo addition/removal complete while its metadata or objects remain unfinished.

The schema-v2 capture and attachment paths retain the optional-photo lifecycle. The current first-photo flow accepts a photo-free ready item, registers pending
metadata in a revision-checked partial patch, and finalizes only photo fields after verified uploads.
Cancellation marks only those photos deleting, removes their exact objects, then clears their metadata.
The item's identity, details, location, and ready state remain intact. There is no v1 compatibility or migration; the approved clean reset is separately controlled.

Derived predicates (do not add independently editable copies):

```text
isDisposed = decision in {sell, give_away} AND progress == completed
isOwned = NOT isDisposed
inDefaultView = recordState == ready AND deletedAt == null AND isOwned
inGoneView = recordState == ready AND deletedAt == null AND isDisposed
inReviewInbox = inDefaultView AND reviewStatus == needs_review
inTrash = deletedAt != null
```

Default owned counts use owned, ready, nontrashed items. Item counts and quantity totals are distinct
and must be labeled. Completing disposal clears boxId so box contents do not retain sold
possessions. The room tag and optional notes preserve context. Overview includes Gone separately.

## 5. Value and text validation

Money is stored in integer minor units. Use a supported currency table to parse/format the correct number
of fractional digits; never assume every currency has two. No conversion or automatic repricing when the
inventory default changes. Zero is a valid entered value; null means unknown. Never total mixed currencies.

Proposed limits, adjustable with tests before real use:

| Field | Limit / validation |
| --- | --- |
| Name | 1-200 characters after trimming |
| Quantity | Integer 1-100,000 |
| Serial number | Nullable string, at most 200 characters; preserve leading zeros |
| Notes | At most 10,000 characters; plain text |
| Category | Nullable string, at most 100 characters |
| Room name / box label | 1-100 characters after trimming |
| Photos per item | At most 2 total metadata entries, including unfinished operations; see decision D10 |
| Money | Nonnegative safe integer in a supported currency |
| Revision | Positive integer, incremented on every item/room/box update |

See [Photo pipeline](PHOTO_PIPELINE.md) for byte limits. All nullable fields are explicitly null, not
sometimes missing. Validate unknown/imported records before rendering, with a recoverable unsupported-
schema error rather than silently dropping fields.

## 6. Concurrency, timestamps, and integrity boundaries

Normal creates/updates use server timestamps for `createdAt`/`updatedAt`; a saved indicator waits for
acknowledgment. Item/room/box updates read the current revision in a transaction, compare it with the
expected revision, apply an explicit patch, and increment it. Never do network uploads inside a retriable
Firestore transaction callback.
Capture, setRoom, pack, and owned restores into a retained box increment the destination record's revision in the same
transaction. Rules require that paired write and an active destination. Archiving reads a location
revision before inspecting every server item page, rejects owned items and pending captures for boxes,
then checks that revision in its transaction. Concurrent incoming assignments invalidate that inspection.
Collection-wide emptiness is enforced by the application, not a query inside Security Rules.

Permanent deletion uses existing fields: a revision-checked ready trash item with all photos ready moves
to `recordState: deleting`. Keep its cover, photo paths, and historical fields intact. It cannot be edited
or restored while cleanup is in progress. The document is removed only after exact-prefix file cleanup
and an empty-prefix check. Photo-free trash follows the same marker protocol. Separate capture discard
markers have `deletedAt: null`; permanent-deletion markers retain their trash timestamp.

An import is a dedicated operation: preserve exported historical creation/completion/deletion times,
set a new server `updatedAt`, and start the destination revision at 1. Photo/finalization transactions
then increment it normally. Imported precision must be representable by Firestore (nanoseconds divisible
by 1,000). Rules must distinguish allowed
creation of historical timestamps from ordinary immutable `createdAt` updates; do not relax ownership
checks for imports. The already provisioned inventory root retains its destination owner.

The owner-only active report has `schemaVersion: 2`, positive `revision`, opaque `operationId`, `exportId`,
exact `manifestSha256`, state `restoring | interrupted | completed`, expected counts
`items/rooms/boxes/photos/photoFiles`, `claimedRecords`, `completedRecords`, and server creation/update
timestamps. Limits are 5,000 per record collection, two photos per item and two files per photo. Counters
satisfy `0 <= completedRecords <= claimedRecords <= items + rooms + boxes`; completion requires both
equal the total. Immutable identity binds resumption to the same validated archive.

Each claim has schema/revision, operation ID, kind `item | room | box`, record ID, canonical source-record
SHA-256, state `pending | verified`, original `deletedAt` and `coverPhotoId` (null for locations), and server
timestamps. Claims and initial records are created together only when the target is absent. Locations
preserve historical archive times and start verified. Items initially have ready scalar records, no
photos, null cover/trash timestamp and a pending claim. The active report makes the whole import
unfinished, including staged photo-free items. Historical archived-room/box references do not change
location revision/history; normal capture/assignment rules continue to require active destinations.

Photos use the existing pending-first-attachment protocol with destination-derived paths. After exact
private-byte verification, a narrow transaction applies original cover/trash history, verifies the claim
and increments the completed counter. Final inspection checks every record, reference, count and file
hash before report completion. Ordinary record/settings writes and full export pause until completion.
Completed reports remain as provenance; a different archive requires another authorized empty destination.
Reports/claims are excluded from portable exports. An unused interrupted report with zero claims may be
explicitly removed without deleting inventory data. No automatic cleanup or data migration is performed.

Rules enforce ownership and feasible field/type/transition restrictions. Application/import validation
also enforces cross-record references and photo integrity. Do not claim Firestore rules can prove Storage
objects exist, or that a JPEG content-type header proves the bytes are a safe image. Every such boundary
must be reflected in tests; see [Security](SECURITY.md).

Future schema changes require an explicit version/migration plan, an export before touching real data, and a
restore test into an empty, isolated, administrator-authorized verification inventory. Do not drop unknown
future fields during an older client's write.

The 2026-10 schema-v2 change is the owner-approved clean-reset exception. V1 is rejected; no migration
or legacy archive reader is implemented. Preserve authorization and update the root version through a
trusted administrative cutover, never a client write. Production reset has not been executed.

## Capture details and retry identity

Desktop capture may provide the existing quantity, estimatedValue, serialNumber, notes and category fields at creation. They use the same runtime/rules bounds as metadata edits. Omitted fields retain quantity 1, null value/serial/category and empty notes. Room is active or null, Box remains null, and workflow remains undecided/not_started. No stored schema or archive format changes. Stable capture retry identity includes these details as well as name, room, review state and photo metadata; a different payload cannot reuse an acknowledged attempt ID.
