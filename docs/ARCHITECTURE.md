# Architecture

Status: V1 implementation design with M0 foundation and M1 capture implemented locally. No cloud services have been provisioned
by this implementation. Read-only checks of the owner's existing project and remaining setup are
recorded in [M1 setup](M1_SETUP.md). Cloud SDK initialization and Google redirect are implemented;
deployment and actual OAuth/CORS/device verification remain pending. See [M1 evidence](M1_CAPTURE.md).

## 1. Components

```text
                       public static HTML / JS / CSS
 iPhone browser  -----> Firebase Hosting <----- Windows browser
          |                                      |
          +---------- Firebase Authentication ---+  Google sign-in
          |                                      |
          +---------- Cloud Firestore -----------+  records / owner policy
          |                                      |
          +---------- Cloud Storage -------------+  private image derivatives
```

The browser uses Firebase client SDKs directly. Authorization is enforced independently by Firestore
and Storage rules. There is no custom HTTP API, Cloud Function, server-side rendering, or always-on
application server in V1. Firebase Hosting supports static single-page applications; see
[References S03](REFERENCES.md#s03).

Google sign-in establishes identity; it does not automatically authorize the user. The trusted inventory
root contains the owner UID. Both services consult that owner policy. Storage can consult Firestore in
its rules; configuration/testing requirements are in [Security](SECURITY.md) and
[References S05](REFERENCES.md#s05).

## 2. Suggested source layout

This is a scaffold target, not a claim about files present today.

```text
src/
  app/                 routes, providers, authenticated shell
  features/
    capture/           photo selection, capture room, save-and-next
    inventory/         gallery, table, filters, item details
    review/            inbox and bulk review
    locations/         rooms and boxes
    transfer/          export, restore, recovery reports
  domain/              types, validation, workflow transitions, value helpers
  data/                Firebase bootstrap and record repositories
  media/               conversion, upload/download, blob cache, cleanup
  components/          small shared UI primitives
  test/                synthetic fixture builders and test setup
scripts/               cross-platform dev/check tooling; no embedded credentials
```

A router, form library, runtime schema library, and test runner can be selected during scaffolding. Avoid
adding a global state library until its role is clear. An in-memory inventory metadata store and small
feature-specific state are enough to start.

## 3. Record and photo flow

A capture allocates stable item/photo IDs, prepares derivatives, creates a recoverable draft, uploads
photo files, and marks the record ready after acknowledgment. Firestore and Storage are separate systems;
there is no atomic transaction covering both. The design therefore tracks incomplete operations and makes
retries idempotent. See [Photo pipeline](PHOTO_PIPELINE.md).

Store image object paths and derivative metadata in records, never base64 images or permanent sharing
URLs. Obtain photos through authenticated SDK downloads and display temporary browser object URLs. This
requires bucket CORS configuration; see [References S06](REFERENCES.md#s06).

Current location, original room, review status, moving workflow, record readiness, and trash status are
different concepts. See [Data model](DATA_MODEL.md); do not collapse them into a single `status` field.

## 4. Search, reads, and updates

Start with a complete in-memory metadata index for the single owner's inventory. Read metadata in pages
(default 250 documents), show loading progress, and expose whole-inventory search only after all pages
are indexed. Fetch photos separately and only as needed. Query owned inventory paths, not all inventories.

A 5,000-item synthetic test is the initial scale gate. Profile startup size/time on the actual phone. Do
not blindly load all photo bytes, or introduce a paid search service to solve an unmeasured problem.

V1 does not need continuous cross-device live updates. Refresh on explicit request and appropriate app
focus/navigation boundaries. Local successful writes update the local metadata index. Use per-item
`revision` checks in transactions so stale tabs do not silently overwrite one another. Show conflicts
and offer reload/reapply. Transactions are confined to Firestore; see [References S11](REFERENCES.md#s11).

A bulk operation is a set of independently checked item updates, not a promised all-or-nothing operation
across the entire selection. Use bounded concurrency and report exact successes, conflicts, and failures.
Exclude large text/photo metadata from unnecessary indexes and commit required index configuration.

## 5. Environments

| Environment | Backend | Data | Intended use |
| --- | --- | --- | --- |
| Local / automated tests | Auth, Firestore, and Storage emulators; `demo-inventory` | Synthetic only | Normal development and CI |
| Production / authorized device checks | Owner's single real Firebase project | Disposable device samples first; real possessions after M3 | Explicitly authorized HTTPS/OAuth/CORS checks and released personal inventory |

Use a demo project locally so missing emulator services cannot target live resources. Real-project
emulation can otherwise reach non-emulated live services; see [References S07](REFERENCES.md#s07).

Build configuration is explicit: `local` or `production` in the owner's workflow. Local mode requires all
emulator settings. Production requires its exact explicit destination and rejects demo IDs/emulator flags.
Optional `development` builds still require a separate, explicitly configured project if ever authorized.
Deployment scripts verify the built project ID and inventory ID against the explicit destination; a
renamed Hosting preview alone is not backend isolation. Automated tests never use the cloud project.

The existing photo bucket is regional `us-east1`; Firestore Standard is European multi-region `eur3`.
These owner-created resources are retained. Their locations differ; cloud device checks must establish
actual access and latency. No location migration is implied; see [Setup](SETUP.md).

## 6. Hosting and sessions

Serve the static Vite output from Firebase Hosting with SPA fallback and suitable security headers.
Inventory photos never live under the public build directory. Use the project's provided domain rather
than require a domain purchase.

Start with a Firebase-provided `firebaseapp.com` hosting origin and matching `authDomain` for the first
cloud authentication proof. Explicitly test any move to `web.app` or a custom origin. Redirect sign-in
has browser storage constraints; use the official supported configuration rather than a guessed OAuth
workaround. See [References S08](REFERENCES.md#s08).

Keep inventory metadata/photo caching in memory in V1. No persistent Firestore data cache, offline data
service worker, or offline photo queue. SDK pending writes must remain visibly pending until acknowledged.
A session-scoped Auth persistence default is proposed; test it on the phone before changing it. Auth
session persistence is separate from inventory data caching; see [References S09](REFERENCES.md#s09).

Home Screen manifest/icons are a later convenience. Do not introduce private-data caching merely to
label the site a PWA. No guarantee of upload execution after a browser is suspended.

## 7. Evolution seams

Keep Firebase access behind small modules and bind the inventory by a stable ID. A future client could
use the same backend. Future sharing would require a deliberate authorization-policy change, not a
migration from email strings scattered across components. Do not implement either feature now.

Any later move to an authenticated server/API must update both authorization and photo access; it is not
just a frontend hosting change. Any future scheduled cleanup, paid extension, or additional provider
needs an explicit cost/complexity decision.
