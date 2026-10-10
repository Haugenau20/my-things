# M1 capture implementation and release gate

Date: 2026-10-10. Capture is implemented, tested locally, and deployed after owner authorization.
**M1's owner and actual-device acceptance gate is pending.** See [deployment evidence](M1_RELEASE.md)
for Hosting/rules/indexes, IAM/CORS, signed-out live checks, trusted owner bootstrap, and closed signup.
No production item/photo seed, billing change, or real-data maintenance has been performed.
M2 organization and M3 backup remain future work.

## Implemented behavior

- Name plus one or two photos; camera hint and existing-file selection; sticky room within the mounted
  capture session; minimal room creation; needs-review default and explicit reviewed save.
- Stable item/photo IDs, strict versioned runtime validation, explicit field defaults, and matching
  original/current room. Server-acknowledged draft precedes all uploads. Both derivatives are verified
  by metadata, size, and SHA-256 before revision-checked finalization. Only then does Save & next reset.
- Sequential browser image decoding, fresh metadata-free JPEG encoding, normalized orientation,
  no upscaling, detail 2,000 px/8 MiB and thumbnail 400 px/512 KiB limits. Sources stay untouched.
- Resumable uploads with two files in flight; failed attempts retain their prepared bytes and identity
  while the page remains open. Reload recovery verifies exact uploaded paths and hashes, finishes when
  all files exist, or requests all original sources in order. Different derivatives are rejected.
- Explicit unfinished-capture discard records a deleting marker, performs authenticated paginated
  item-prefix cleanup, and removes the document last. Cleanup failure keeps a retryable marker.
- Owner-only private gallery and detail photos through authenticated bytes and temporary blob URLs.
  Only mounted viewers retain URLs; downloads are bounded to two and encoded photo leases to 24 MiB.
  Sign-out/account change cancels further work, clears mounted private UI, and revokes session URLs;
  other same-origin tabs receive sign-out. Metadata stays in memory, Auth uses tab session persistence.
- Cloud SDK initialization and Google redirect sign-in are wired for the reviewed default
  `https://PROJECT_ID.firebaseapp.com` origin. Local configuration still requires all three emulators
  and `demo-inventory`; missing settings fail before SDK initialization.
- Validation-only production release preparation creates ignored destination-specific Hosting/rules
  configuration and exact-origin CORS. The build fingerprint prevents preparing from changed settings.

Two photos is the current editable D10 limit: full embedded-photo validation exceeded Firestore's
1,000-expression budget at higher counts. The rules check every supported photo field and transition;
M2 edits/boxes, root claiming, public access, and Storage replacements remain closed. New Storage objects
must match a pending photo's byte size in a draft. See [decisions](DECISIONS.md) and
[Firestore limits](https://firebase.google.com/docs/firestore/quotas#security_rules).

## Local evidence

Exact checks actually run:

| Command | Result |
| --- | --- |
| `mise exec -- npm run check` | Passed: ESLint/Prettier, strict TypeScript, 84 unit, 63 rules, 9 SDK integration, 11 browser tests, and local build |
| `mise exec -- npm run test:e2e` after the camera fix | Passed: all 12 Chromium browser tests, including sequential camera selection |
| `mise exec -- npm run lint` and `mise exec -- npm run typecheck` after the camera fix | Passed |
| `mise exec -- npm run build:prod` | Passed; compilation only, no cloud browser session |
| `mise exec -- npm run deploy:check -- production OWNER_PROJECT main` | Passed against the explicit production build; no deployment |
| `mise exec -- npm run release:prepare` | Passed; ignored production settings generated and paths/origin/ignore status inspected |
| `mise exec -- npm run build` after the camera fix | Passed; local demo build |
| `mise exec -- npm run release:prepare` against that local build | Correctly refused, exit 1, configuration fingerprint mismatch |
| `git diff --check` and `git check-ignore` for real/local cloud settings | Passed |

The Firebase shared chunk is 591.77 kB minified / 176.82 kB gzip; Vite reports its existing >500 kB
warning. No bundle-performance claim on the actual phone is made. No dependencies were added.

Exercised: positive/negative owner rules, real client SDK draft/upload/recovery/discard,
browser two-photo save/reload, original-source reselection recovery, explicit failed-attempt discard,
unsupported HEIC failure, EXIF orientation/metadata stripping, narrow-screen reviewed save, cross-tab
sign-out, and loopback-only browser requests. All fixtures and screenshots are synthetic.

Read-only cloud IAM/bucket checks found no existing Storage-agent `roles/firebaserules.firestoreServiceAgent`
grant, no configured bucket CORS entry, and no public-principal bucket IAM binding. Public access
prevention is inherited and uniform bucket-level access is disabled; object ACLs and token capabilities
were not audited, so this is not proof of private cloud delivery. The existing soft-delete retention
is 604,800 seconds (seven days). These were pre-release checks; subsequent authorized IAM/CORS changes
are recorded in [deployment evidence](M1_RELEASE.md).

Tests deliberately failed before the domain/repository implementation and capture UI existed. The
new pending-capture Storage regression also failed before the matching-draft restriction was added.
Earlier failed experimental larger photo counts are evidence for D10, not skipped acceptance tests.

## Reviewable production release preparation

Run from the repository root. These commands do not connect browser SDKs to cloud services or deploy:

```powershell
mise exec -- npm run check
mise exec -- npm run build:prod
mise exec -- npm run deploy:check -- production PROJECT_ID main
mise exec -- npm run release:prepare
```

Review ignored `.firebase/production.firebase.json`, `.firebase/production.cors.json`, the destination
in `dist/build-environment.json`, and the source rules. The generated config has absolute local paths;
regenerate it on another checkout. The root `firebase.json` remains local-only and the default CLI alias
remains `demo-inventory`. Do not deploy a local build or use the root local CSP for a cloud release.

Only after the owner explicitly authorizes deployment, run the pinned CLI with the reviewed project
and generated configuration (replace placeholders; the authorized release used this command):

```powershell
mise exec -- node node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules,firestore:indexes,storage,hosting --project PROJECT_ID --config .firebase/production.firebase.json
```

Storage rules use two Firestore documents: the trusted inventory root and the matching draft. The
Firebase CLI/console may request permission to connect Storage rules to Firestore. This is an IAM
change requiring explicit owner authorization, not an implied permission to broaden rules. Confirm
the required connection instead of substituting broad authenticated access.
[Firebase cross-service rule documentation](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_cloud_firestore).

Apply the generated CORS policy to the existing exact bucket only after authorization; review existing
CORS first because setting the policy replaces it. Do not add wildcard origins or public IAM access.
Direct SDK downloads require CORS; CORS itself is not authorization.
[Firebase direct downloads](https://firebase.google.com/docs/storage/web/download-files#cors_configuration).

Use the default `firebaseapp.com` origin for the initial app and Google sign-in, including the phone.
The app refuses to start Google redirect from another origin. A later `web.app` or custom-domain release
requires an explicit authDomain/redirect-origin change and new CSP/CORS verification.
[Firebase redirect guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices).

## Trusted owner bootstrap

1. Verify Google provider settings and the exact Hosting domain in Firebase Authentication authorized
   domains. Complete sign-in once. Access remains denied before administrator bootstrap.
2. The owner/project administrator identifies the owner's **Firebase Authentication UID** in the
   console's Users list. Do not infer authority from an email, environment variable, or first visitor.
3. Through the trusted Firestore console, create `inventories/main` only if it is absent. If it exists,
   inspect the owner and stop on mismatch. Set exactly these typed fields:

   | Field | Value/type |
   | --- | --- |
   | `schemaVersion` | number `1` |
   | `ownerUid` | string containing the verified owner's Auth UID |
   | `displayName` | string, for example `My things` |
   | `defaultCurrency` | null until deliberately selected |
   | `createdAt`, `updatedAt` | Firestore timestamp values |

4. Refresh/sign in again and verify owner access. Independently test another Google account and
   unauthenticated access: both must remain denied for records, photos, listing, and writes.
5. Disable end-user signup/deletion after the owner account is verified; keep only that account in the
   production Auth user set. Other Google accounts must be rejected during sign-in. The initial owner
   binding and these restrictions are now applied; see [deployment evidence](M1_RELEASE.md).

No production bootstrap script or private admin credential is shipped in the frontend. Existing local
seed scripts reject cloud destinations. Never copy emulator users or records into production.

## Remaining manual acceptance

- Record iPhone model/iOS/Safari and Windows browser/version. Test camera and library JPEG/PNG/HEIC,
  portrait/landscape orientation, labels/serial-number readability, several saves, reload, and Windows
  gallery/detail display. Optimized derivatives are not full-resolution photographic backups.
- Test actual Google redirect/session/cross-tab sign-out and enforced Hosting CSP, including auth helper
  frames. Emulator/Chromium results do not establish Safari OAuth or native camera behavior.
- Verify actual Firestore/Storage rules, two-document cross-service permissions, exact-origin CORS,
  bucket IAM/public access, download-token exposure/revocation policy, private cache metadata, bucket
  soft-delete/retention behavior, billing alerts, and cross-region access/latency.
- Interrupt upload and finalization; close/reopen and reselect the exact originals. Derivative encoding
  can differ between browsers, so recovery rejects a different encoding and offers explicit discard.
  Test cleanup retry and another-tab races. Firestore and Storage are not one atomic transaction;
  retained provider resumable sessions and exceptional orphan behavior need real cloud evidence.
- Native HEIC support is unproven on the owner's device. Add a conversion dependency only if that
  measured spike shows it is needed. Source/header guards cannot guarantee every browser's decoded
  allocation; large/unsupported decode failures must remain visible.
- M2 optional-field editing, room/box management, search/bulk workflows and M3 trash/backup/restore are
  absent. Do not use this prototype as the primary inventory record before the M3 recovery gate.

Follow [the full test plan](TEST_PLAN.md). Record cloud/device results without putting personal photos,
UIDs, access tokens, or inventory exports in this repository or external test tools.
