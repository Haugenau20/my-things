# M3 archive validation and restore design

Continue under the owner's explicit instruction to implement unblocked phases while away. Separate this
slice from export and preserve the existing main inventory. No real inventory import/maintenance is run.

First implement strict, read-only archive validation: parse bounded ZIP32 central directories and local
headers before any decompression; reject encrypted, multi-disk, traversal, duplicate, symlink, unexpected
member/part/version, overlapping ranges, invalid UTF-8, declared/actual size overflow and bad checksums.
Read ordinary stored entries directly and inflate supported DEFLATE entries in small bounded chunks.
Require every part listed in the final manifest, all exact payload membership/counts/hash checks, strict
portable schemas with precise timestamps, valid IDs, room/box references, ready states and photo paths.
Process one photo at a time, never decompress a whole collection. Show counts/settings/history summary
and explicit destination without any writes. This preview does not itself establish cloud recovery.

Then implement restore only into an empty already-authorized destination root. Preserve stable IDs,
locations/history/timestamp precision, reset revisions to one and new server update times, derive every
Storage path from the selected destination, and retain its trusted owner/root creation policy. A narrow
owner-only restore-operation marker records export identity and affected IDs. Historical creates require
that explicit marker and fully validated field/path limits; normal capture restrictions remain intact.
Recheck emptiness/absence before each create so a raced unrelated record is never overwritten. Upload
exact verified archive bytes under pending first-photo metadata on claimed staged items, verify files,
then finalize their original cover/trash history. Keep
interrupted imports visibly incomplete with a report; do not wipe the destination automatically. Validate
all final counts, relationships and file hashes before success. Main inventory refuses nonempty restore.

Use synthetic emulator fixtures for round-trip, interrupted-import and negative-access checks. Deploying
tested functionality is covered by standing authorization; an actual cloud restore test and real device
acceptance still require separately reviewed isolated destination/data and manual owner cooperation.
No schema rewrite, data migration, new project/service, auth authority or public photo URL is introduced.
