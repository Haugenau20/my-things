# Efficient data loading and cacheable photos

Date: 2026-11-22

The owner asked for a review of unnecessary Firestore reads and Storage downloads, then asked for
every finding to be fixed without changing how the app is used, including replacing the no-store
photo cache metadata and providing a script for photos already uploaded.

## Findings

1. Every save called `reload()`, which re-read every item, room and box plus the inventory root and
   restore report with server-only reads. One inspector click cost about N + rooms + boxes + 2 reads;
   a phone capture triggered two such reloads (draft registration and completion). Concurrent reloads
   were all billed. `editItem` re-read the saved item and the reload read it again; reactivating and
   archiving a location read the location back and discarded it; archiving a box read the whole
   inventory to check its contents.
2. `PrivatePhoto` released its URL lease whenever an image left the viewport, including views hidden
   with `display:none` (Overview, Locations, Settings, phone full view). The session forgot released
   URLs at once, and objects were stored with `private, no-store, max-age=0`, so every reappearance
   issued a new `getDownloadURL` request and downloaded the bytes again.
3. The compact inspector showed the 2,000 px detail derivative (up to 8 MiB) for a small panel, so
   stepping through items with j/k downloaded every detail photo.
4. Each upload was downloaded again in full to verify it.
5. Just-saved items fetched thumbnails that the browser still held locally.

## Changes

- **Live metadata index.** `subscribeInventory` opens snapshot listeners on items, rooms, boxes, the
  inventory root and the restore report. `LiveCollection` merges listener changes with records a save
  already read back: a confirmed record wins until the listener reaches its revision, and a confirmed
  removal hides the record until the listener removes it. Components call `sync(update)` with the
  acknowledged records instead of `reload()`. **Refresh inventory** resubscribes and keeps the previous
  data visible until the new snapshot set is complete. Listener errors show the existing refresh error.
  Restore, export and orphan inspection keep their own explicit server reads; the listeners pause
  while a restore runs and resubscribe once afterwards.
- **In-flight operations under live updates.** Listeners now show intermediate states during an
  operation, so desktop capture and photo attachment mark themselves active before their first write
  (recovery no longer offers to discard an upload in progress, and the attachment panel stays
  mounted), recovery entries are keyed by item ID only, and the unfinished-import banner is hidden
  while a restore is running. Browser tests that relied on a stale second tab now race the outside
  change into the running operation's first commit.
- **Location reads.** Archive/reactivate return the location they read back; archiving a box queries
  only items with that `boxId`.
- **Photo retention.** Released URLs stay in session memory for ten minutes, at most 500 entries, and
  are dropped on sign-out. Hidden views keep their mounted photos; scrolling still releases leases.
- **Cacheable objects.** New uploads use `private, max-age=31536000, immutable`. Paths are immutable
  (replacement needs a new photo ID; Storage rules deny updates) and token URLs are stable, so the HTTP
  cache is safe. Verification accepts the legacy value. `npm run photos:cache` updates existing objects'
  metadata only, dry run first, conditional on metageneration, rerunnable.
- **Inspector dwell.** The compact inspector shows the thumbnail at once and requests the detail
  derivative after 400 ms on the same item; full view loads detail immediately.
- **Upload acknowledgment.** The local bytes are SHA-256-checked before upload; afterwards the upload
  response's path, size, type, Cache-Control and MD5 must match them. Without a reported MD5 the
  authenticated byte download is used. Recovery of existing objects and export are unchanged.
- **Local thumbnails.** Acknowledged captures and attachments seed their verified thumbnails into the
  photo session as object URLs, revoked on expiry and sign-out.

## Privacy consequence

With cacheable metadata, downloaded photo bytes may remain in the browser profile's HTTP cache after
sign-out. The owner accepted this on 2026-11-22. Bearer-URL behavior is unchanged.

## Verification

Unit tests cover the merge rules, URL retention/expiry/local seeds, MD5 against RFC 1321 and Node,
MD5-based upload acknowledgment and its fallbacks, legacy cache acceptance, and the migration logic.
An emulator integration test migrates legacy objects and confirms bytes and token URLs are unchanged
and the new header is served. Browser tests confirm saves issue no items collection query, outside
changes arrive without refresh, new items show local thumbnails without Storage requests, view changes
issue no Storage requests, and stepping past an item never fetches its detail photo. Production billing,
real-device behavior and the production migration need separate observation after release.
