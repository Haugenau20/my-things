# Stable photos during metadata edits

Date: 2026-10-31

The owner reported gallery-wide thumbnail flashing after small review edits and asked whether it
caused unnecessary Storage traffic. Inventory saves refresh the metadata index. Each parsed PhotoFile
is a new object; PrivatePhoto previously used that object's identity as an effect dependency. The
effect cleared the image and released its URL lease, then acquired the unchanged file again. Final
lease release evicts its URL, so this also repeated owner-authorized Storage URL requests and could
reload media served with private/no-store cache metadata.

Compare all six PhotoFile fields as primitive effect dependencies, and construct the acquisition
argument inside the effect. Equivalent refreshed metadata keeps the mounted image and its lease.
Actual file changes, visibility, session and retry changes retain the existing lifecycle. Keep full
server metadata refreshes for accurate filters, counts and revision checks. No schema, authorization,
cache lifetime, dependency, persistent storage or production data changes are needed.

Keeping a longer-lived URL cache would increase private-data lifetime and would still allow visible
image clearing. Reworking saves to patch the local metadata index would broaden this fix and require
separate consistency handling. Stabilizing the existing photo lifecycle is the smallest change.

The emulator browser regression creates two synthetic photographed items, opens an inspector, disables
the browser cache and counts all Storage requests. It checks that the original image elements remain
connected and no new Storage requests occur through decision, progress and review edits, explicit
refresh and revision-conflict recovery. Existing tests cover URL denial/retry, bounded requests,
late results on sign-out and media-error retry. Production billing and actual-device behavior require
separate observation after the reviewed pipeline release.
