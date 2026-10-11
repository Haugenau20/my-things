# Photo upload denial investigation

Date: 2026-10-10. The owner reported photo capture failing on phone and desktop. The desktop
network log showed Storage metadata probes returning 404 followed by an upload POST returning 403.
The initial missing-object probes are expected; the denied upload leaves the recoverable draft.

The deployed Storage service agent has the required Firestore Rules role, and bucket CORS matches
the canonical application origin. Neither configuration was changed during this investigation.

## Cause and change

The creation rule unconditionally accessed `request.resource.metadata.keys()`. A cloud request may
omit that optional map when the application supplies no custom metadata. The cloud Rules test API
reproduced denial with `Property metadata is undefined on object` at that expression. An identical
synthetic request with an empty map passed. The installed emulator constructs an empty map for
Rules evaluation, concealing this difference from the existing SDK/browser tests.

The rule now permits either an absent metadata map or an empty one. It still requires the inventory
owner, exact pending photo ID and byte size, supported path/variant, JPEG content type and bounded
size. Existing-object replacement, arbitrary custom metadata and explicitly supplied download tokens
remain denied. This does not relax anonymous access or change the photo delivery implementation.
Firebase-managed download-token behavior remains a separate cloud audit gate; an upload metadata
allowlist is not proof that provider-generated tokens never exist.

Capture and first-photo attachment retain their attempt and selection after failure and now show a
fixed, recognized SDK error code when available. Raw SDK messages, paths and tokens are not copied
into those diagnostics. Retry the existing capture while its original selection remains available;
after reload, reselect the original files under Unfinished captures when files are still missing.

## Verification

`npm run test:rules:cloud -- --project PROJECT_ID` invokes Firebase's
[Rules test API](https://firebase.google.com/docs/reference/rules/rest/v1/projects/test) with synthetic
requests and mocked policy/item documents. An explicit CLI project argument and authenticated CLI
account are required. It does not read inventory, upload objects, publish rules or seed data, and is
deliberately excluded from the demo-only `npm run check` command.

Before the change, its absent-map owner case failed; all other eight cases passed. After the change,
all nine cases passed: absent/empty maps allowed; extra metadata, explicit token, anonymous/unrelated
identity, wrong byte size/content type and existing-object replacement denied. The three safe-message
unit regressions first failed because the helper was absent and then passed after implementation.

`mise exec -- npm run check` passed lint/formatting, strict TypeScript, 140 unit tests, 100 rules
tests, 27 SDK integration tests, 26 Chromium browser tests and the local build (293 tests). Browser
coverage includes a simulated upload 403 displaying the safe error code while retaining the selection,
reload/reselection recovery, photo attachment and private photo downloads. The existing large Firebase
bundle warning remains. `mise exec -- npm run test:rules:cloud -- --project PROJECT_ID` passed all
nine cloud policy cases. `git diff --check` passed.

## Authorized production release

Released source commit `16d5343` with the owner's standing production deployment authorization.
`mise exec -- npm run build:prod`, deployment preflight against the explicit project/main inventory,
and `npm run release:prepare` all passed. The existing Firebase chunk warning remains.

`mise exec -- node node_modules/firebase-tools/lib/bin/firebase.js deploy --only storage,hosting
--project PROJECT_ID --config .firebase/production.firebase.json --non-interactive` exited 0: Storage
rules compiled/published and Hosting released. Firestore rules, IAM and CORS were not changed.
Post-release API reads confirmed both published rule sources match the repository; HTTP reads
confirmed the production shell and every built asset match local SHA-256 values. A fresh signed-out
Chromium context displayed sign-in and reached `accounts.google.com` with no observed page/console
errors. It did not sign in or access inventory.

The exact denied production request body was not collected; actual owner retry is still needed
to confirm this reproduced rule defect accounts for the reported device failure. No real inventory
records or photos were read, changed, discarded or migrated during investigation.

## 2026-10-11: explicit-empty-map compatibility probe

The owner still observes actual upload 403s after the earlier absent-map rule repair. The owner
confirmed the app UID, simulated UID and trusted root owner UID match. A create simulation with
the registered JPEG size allowed the upload. The captured multipart client payload contains the
expected JPEG content type and private cache policy, with no custom metadata. Its request length
minus the pinned SDK's multipart wrapper matches the registered thumbnail length. These checks
establish the request's visible inputs; they do not expose the live service's complete rule context.

Read-only cloud checks confirmed the published rules match this repository, the default bucket is
linked to the configured bucket in the configured location/project, billing is enabled, Requester
Pays is off, Storage App Check is unenforced, and the Storage service agent has the required
Firestore role. Owner console inspection confirmed both Storage service-agent grants have no IAM
condition. The owner reports there are no successfully uploaded photos. No bucket was reset and no
provisioning, IAM, billing, CORS, trusted root or inventory data was changed.

The SDK now explicitly sends `customMetadata: {}` on each derivative upload, instead of omitting
the custom-metadata map. This is a controlled compatibility probe, not a confirmed diagnosis of
the live denial. It makes the wire request unambiguously use the existing allowed empty-map branch.
Authorization, pending registration, exact byte sizes, JPEG bounds, replacement denial and private
authenticated retrieval remain unchanged. The owner explicitly declined an exception for UUID
download-token metadata; Storage rules still reject that field and every other custom field.

A new Chromium test uses a deterministic synthetic image large enough to exercise both resumable
detail upload and multipart thumbnail upload. It inspects each initial SDK request, injects 403s,
checks that the source selection remains available, then retries that same capture successfully
against the demo emulators. Before the client change, its empty-map assertion failed with
`Received: undefined`. Expanded synthetic cloud policy cases also cover UUID, malformed, empty,
non-string, multiple and extra-field tokens, plus anonymous/foreign UUID-token requests; all remain
denied. Cloud policy tests use mocked synthetic documents and do not upload objects or read inventory.

The pinned Storage emulator generates a download token during finalization, then removes that field
from custom metadata before constructing the rules resource. Its successful uploads therefore do
not establish whether the production service presents generated tokens to rules in the same way.
The captured client request contains no token; provider-side token injection remains unconfirmed.

Local and GitHub verification/release evidence is recorded in the follow-up PR. An actual owner
retry after its pipeline release is still required. A passed simulation or emulator upload does not
establish that this probe fixes the production 403, or that provider-generated download tokens
cannot exist. If denial continues, retain the existing recoverable draft and record the outcome;
do not declare success or weaken metadata policy to bypass it.

## 2026-10-11: owner-approved token-bearing photo delivery

The owner retried PR #23's empty-map probe and still received 403. Read-only inspection of the owner's
other local Firebase application found the same upload API and matching SDK request-construction
functions, but its production rules permit token metadata and its gallery uses `getDownloadURL()`.
That comparison did not establish the production denial's cause. No neighboring project files or
cloud resources were changed or accessed.

The owner then explicitly approved token-bearing photo URLs, superseding the earlier refusal.
Storage creation now accepts absent/empty custom metadata or exactly one `firebaseStorageDownloadTokens`
field containing a lowercase UUID v4. Extra fields, malformed/multiple/non-string tokens and every
metadata update remain denied. Owner binding, valid pending registration, exact byte sizes, JPEG
limits, immutability, listing and deletion authorization are retained. Rules cannot distinguish a
provider-generated UUID from one supplied by the owner.

Gallery and restored-photo previews issue URLs through owner-authorized `getDownloadURL()` and keep
leases in memory only. Sign-out clears the images and suppresses late results, but cannot revoke a
copied link. Anyone possessing a valid link can download that photo without authentication until the
token is revoked or the object deleted. Records and backups still contain paths and verified photo
bytes, never download URLs/tokens. Upload/recovery/export checksum verification and private/no-store
object cache metadata are retained. The production image CSP is restricted to the configured bucket's
Firebase Storage endpoint. URL or media errors remain visible and retryable.

Before implementation, unit assertions failed on the blob URL and missing image CSP origin, and the
synthetic cloud owner-token case failed against the old rules. Focused SDK integration verifies owner
URL issuance, anonymous/foreign issuance denial, copied-link access after sign-out, absent/wrong token
denial and invalidation after object deletion. The emulator strips token custom metadata before rules,
so cloud synthetic cases separately validate the token shape and preserve negative authorization.

`mise exec -- npm run check` passed lint/formatting, TypeScript, 180 unit tests, 112 rules tests,
30 SDK integration tests, 58 Chromium browser tests and the local build (380 tests). The focused
capture/restore/token-photo browser run passed all 13 cases. The explicit synthetic cloud policy
command passed all 23 cases. The existing large Firebase bundle warning remains.

Pipeline release evidence is recorded in the follow-up PR. The owner must retry an
actual upload after deployment; passing simulated/emulator requests still does not prove that the
production 403 is resolved. No bucket change, new infrastructure, migration or real inventory operation
is part of this release.
