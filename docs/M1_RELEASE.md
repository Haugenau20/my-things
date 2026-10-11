# M1 deployment evidence

> Historical evidence: behavior, authorization and pending checks below describe their recorded
> milestone. For current schema, photo policy, release procedure and acceptance status, start with
> [current operations](OPERATIONS.md). Earlier permissions do not authorize new maintenance or merges.

Date: 2026-10-10. The owner confirmed PR #2 was merged and explicitly authorized deployment and
necessary configuration. Initial released application/rules source: merged main commit
`d0ab84e126b227fad56eb35bc877138445139bd3`. **M1 owner/device acceptance remains pending.**

## Applied changes

- Firebase Hosting static release, Firestore rules/index exemptions, and Storage rules, using the pinned
  CLI and generated production configuration. Both rule sets compiled and release completed successfully.
- Granted only `roles/firebaserules.firestoreServiceAgent` to the existing Firebase Storage service agent
  so Storage rules can consult the trusted inventory policy and pending capture document.
- Applied the generated single `https://PROJECT_ID.firebaseapp.com` origin CORS policy: GET/HEAD,
  Content-Type/Length/Disposition response headers, 3,600-second maximum age. No wildcard or public grant.
- After the owner supplied their verified Firebase Auth UID, confirmed an active Google user with that
  UID and created `inventories/main` through a trusted create-only administrative operation. Read-back
  verified all six typed fields and matching UID. Display name is `My things`; currency remains null.
- On the owner's stricter sign-in request, disabled end-user signup/deletion through managed Auth
  configuration and verified the singleton Auth user set contains only the owner. Settings read-back
  succeeded with `FIREBASE_AUTH` subtype; no Identity Platform upgrade or blocking function.
- Added a generic owner-only rejection message for restricted/disabled-account Auth errors without
  exposing provider details. Backend owner-based rules remain independently enforced.

The existing Firestore database and Storage bucket were retained. Seven-day bucket soft deletion is
unchanged. No production item records, photos, analytics, App Check, additional provider, billing
change, or credential file was created. Real configuration and CLI logs remain ignored.

## Checks actually run

The placeholders below denote the owner's explicit existing production destination, not demo defaults.

| Command/check | Result |
| --- | --- |
| `mise exec -- npm run build:prod` from merged main | Passed; existing >500 kB Firebase chunk warning remains |
| `mise exec -- npm run deploy:check -- production PROJECT_ID main` | Passed |
| `mise exec -- npm run release:prepare` | Passed; generated paths, CSP, target, and CORS inspected |
| `gcloud projects add-iam-policy-binding PROJECT_ID --member=serviceAccount:STORAGE_SERVICE_AGENT --role=roles/firebaserules.firestoreServiceAgent --condition=None` | Succeeded; targeted grant verified by subsequent read |
| `gcloud storage buckets update gs://BUCKET --cors-file=.firebase/production.cors.json --project=PROJECT_ID` | Succeeded; exact CORS read back; region/retention unchanged |
| `mise exec -- node node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules,firestore:indexes,storage,hosting --project PROJECT_ID --config .firebase/production.firebase.json --non-interactive` | Exit 0; rules/indexes/Hosting released |
| Administrative Auth configuration reads | Google provider enabled; canonical Firebase Hosting domain authorized |
| Administrative inventory-root existence read before bootstrap | `inventories/main` absent, HTTP 404 |
| Trusted bootstrap | Supplied UID matches an active Google Auth user; create-only root succeeded; owner/schema/field types read back correctly |
| Auth user-list and targeted configuration update/read-back | Only the owner account exists; end-user signup/deletion disabled; Auth subtype unchanged |
| Owner-run sign-in checks | Owner reaches Capture after reauthentication; separate Google account cannot finish Firebase sign-in |
| Auth user-list read after that negative check | Still exactly one user, the bound owner; no second account created |
| Live GET `/` and `/build-environment.json` | HTTP 200; production/project/inventory identity matches release; expected CSP, no-store, nosniff, no-referrer, anti-framing headers |
| Live GET `/__/auth/iframe` and `/__/auth/handler` | HTTP 200; application anti-framing headers do not block reserved Auth helpers |
| Anonymous Firestore root and item-list requests | HTTP 403 for both |
| Anonymous Storage inventory-prefix list and synthetic photo download request | HTTP 403 for both; no object created |
| Isolated signed-out browser inspection | Sign-in button visible, no observed console/page errors; click reached `accounts.google.com` |
| Follow-up Hosting-only deploy | Exit 0; clearer rejection-message frontend released |
| Follow-up live inspection | HTTP 200; new message present in served bundle; credential-free browser still reaches Google without observed errors |

The app's browser tool failed to initialize because of an environment sandbox setup error. A fresh,
credential-free Chromium context inspected only the deployed sign-in shell and redirect start instead.
It did not sign in, submit credentials, create an Auth user, or write inventory data. Automated unit,
rules, SDK integration, and product browser suites retain their demo-only configuration; their previously
run evidence is in [M1 capture](M1_CAPTURE.md). The follow-up frontend change only maps Auth rejection
errors to safe owner-only messages; it adds no client authorization or email allowlist.

Follow-up validation: `mise exec -- npm run lint` and `typecheck` passed; `npm run test` passed all
90 unit tests (six new rejection-message cases); `npm run test:e2e` passed all 12 demo-only browser tests.
Local and production builds, production deployment preflight, and release preparation passed. The
new tests first failed because the mapper was absent, then passed after implementation. Rules and SDK
integration suites were not rerun for this frontend-message/documentation change; their M1 evidence
remains applicable because those implementations are unchanged. `git diff --check` passed and release
configuration remains ignored. The clearer rejection message still needs an actual other-account retry
after the follow-up Hosting release; the owner's initial test observed the older generic message.

## Required owner/device evidence

1. Owner reauthentication and other-account rejection are verified by the owner. Confirm the clearer
   rejection text after the follow-up frontend release. Backend unrelated-UID denial still has emulator
   coverage; the complete cloud SDK authorization matrix remains pending.
2. Use disposable samples on the actual iPhone and Windows browser: camera/library formats, readable
   labels, both derivatives, several saves/reload, interruption/recovery/discard, and sign-out across tabs.
3. Confirm actual authenticated photo delivery and cross-service rules, cache metadata/token policy,
   soft-delete behavior and cross-region latency. Anonymous probes against an absent synthetic path do
   not prove an uploaded photo's complete privacy or positive owner access. Billing-alert configuration
   and the complete [test plan](TEST_PLAN.md) remain manual operating checks.

M2's implementation authorization is already given, but M1's documented real-device gate remains open.
M3 backup/restore is absent; this release is not evidence of a real backup or dependable-primary-use gate.
