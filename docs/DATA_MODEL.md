# Data model

Schema version: 1. These are implementation contracts, not existing collections.

## 1. Paths and ownership

```text
/inventories/{inventoryId}                 trusted owner binding + inventory settings
/inventories/{inventoryId}/rooms/{roomId}
/inventories/{inventoryId}/boxes/{boxId}
/inventories/{inventoryId}/items/{itemId}

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
It contains `schemaVersion: 1`, `ownerUid`, `displayName`, `defaultCurrency: string | null`, `createdAt`,
and `updatedAt`. Clients may update only display name, default currency, and update timestamp. The owner
binding and schema version are not client-editable. No membership/invitation collection in V1.

## 2. Item contract

The following TypeScript notation describes stored values after server timestamps have resolved. Document
IDs come from paths; add `id` in repository objects and exports, not as a second mutable source of truth.

```ts
import type { Timestamp } from "firebase/firestore";

type CurrentLocation =
  | { kind: "unassigned" }
  | { kind: "room"; roomId: string }
  | { kind: "box"; boxId: string };

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
  schemaVersion: 1;
  revision: number;
  name: string;
  quantity: number;
  estimatedValue: Money | null;
  serialNumber: string | null;
  notes: string;
  category: string | null;
  originalRoomId: string | null;
  currentLocation: CurrentLocation;
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

Create records with explicit defaults: quantity 1, no value/serial/category/original room, empty notes,
unassigned location, needs-review, undecided/not-started, no completion/deletion timestamp, revision 1.
Capture-room selection overrides the two room defaults. Prepare derivative metadata before creating a
cloud draft so pending entries contain exact expected paths, sizes, and checksums.

`photos` only contains metadata and is deliberately bounded. If this model later becomes unwieldy,
migrate to photo documents deliberately; do not silently introduce two competing sources of truth.

## 3. Room and box contracts

Rooms contain `schemaVersion`, `name`, `sortOrder`, `revision`, `createdAt`, `updatedAt`, and
`archivedAt: Timestamp | null`. Boxes have the same fields except `label` replaces `name`; an optional
plain-text `notes` field defaults to empty. Suggested box labels are B001, B002, and so on.

Names/labels can change; IDs cannot. Warn about duplicate labels, but never treat labels as identifiers
or promise cross-tab uniqueness without implementing it. Archived locations are not new assignment
choices. Keep their labels available wherever existing references are displayed. A room/box cannot be
archived through the application while currently assigned owned items remain there.

## 4. Invariants and transitions

| Operation | Required behavior |
| --- | --- |
| First room assignment | Set current room; fill original room only when it is null |
| Later room move | Change current room only |
| Pack into box | Set current location to box; preserve original room and workflow |
| Unpack | Choose a room or unassigned; preserve original room |
| Correct original room | Explicit separate edit, including an intentional clear |
| Change decision | Reset progress and completion timestamp; warn about discarded progress |
| Complete store/take | Set completion timestamp; still owned; do not infer location |
| Complete sell/give-away | Set completion timestamp and current location to unassigned; retain record |
| Reopen completed outcome | Clear completion timestamp; do not guess a location |
| Trash / restore | Set/clear deletion timestamp without rewriting workflow or deleting photos |
| Permanent delete | Only from trash; mark record deleting, remove live photo objects, then delete record |

A location union contains only the fields for its selected kind. References point inside the current
inventory, not another inventory. `originalRoomId` may legitimately differ from current room, or exist
when current location is a box/unassigned. `undecided` requires `not_started` and a null completion time.
Other decisions have a completion time exactly when progress is `completed`. A disposed entry must
have an unassigned current location; reopen the outcome before assigning a room or box.

A ready record may have no photos (`photos: []`, `coverPhotoId: null`). If any photo is ready, its cover
refers to a ready photo in that same item; otherwise the cover is null. Photo absence is not a draft.
A draft can contain pending photos and have no cover yet. Existing ready records can have additional
pending/deleting photos; continue showing their ready photos and expose the unfinished operation.
Do not claim a photo addition/removal complete while its metadata or objects remain unfinished.

The optional-photo change retains schema-1 fields and all existing photo-bearing records without
rewriting live data. The current first-photo flow accepts a photo-free ready item, registers pending
metadata in a revision-checked partial patch, and finalizes only photo fields after verified uploads.
Cancellation marks only those photos deleting, removes their exact objects, then clears their metadata.
The item's identity, details, location, and ready state remain intact. No live-record migration is needed.

Derived predicates (do not add independently editable copies):

```text
isDisposed = decision in {sell, give_away} AND progress == completed
isOwned = NOT isDisposed
inDefaultView = recordState == ready AND deletedAt == null AND isOwned
inCompletedArchive = recordState == ready AND deletedAt == null AND isDisposed
inReviewInbox = inDefaultView AND reviewStatus == needs_review
inTrash = deletedAt != null
```

Default location/box counts use owned, ready, nontrashed items. Item counts and quantity totals are distinct
and must be labeled. Completing a disposal clears current location so box contents do not retain sold
possessions. Original room and optional notes preserve useful context.

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

An import is a dedicated operation: preserve exported historical creation/completion/deletion times,
set a new server `updatedAt`, and start the destination revision at 1. Rules must distinguish allowed
creation of historical timestamps from ordinary immutable `createdAt` updates; do not relax ownership
checks for imports. The already provisioned inventory root retains its destination owner.

Rules enforce ownership and feasible field/type/transition restrictions. Application/import validation
also enforces cross-record references and photo integrity. Do not claim Firestore rules can prove Storage
objects exist, or that a JPEG content-type header proves the bytes are a safe image. Every such boundary
must be reflected in tests; see [Security](SECURITY.md).

Schema changes require an explicit version/migration plan, an export before touching real data, and an
restore test into an empty, isolated, administrator-authorized verification inventory. Do not drop unknown
future fields during an older client's write.
