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

Authorized production release evidence will be recorded after deployment. The exact denied production
request body was not collected; actual owner retry is still needed
to confirm this reproduced rule defect accounts for the reported device failure. No real inventory
records or photos were read, changed, discarded or migrated during investigation.
