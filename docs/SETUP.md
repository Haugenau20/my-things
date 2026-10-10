# Repository, Firebase, and development setup

This is a setup guide, not a record of completed cloud provisioning. M0 adds a local application,
toolchain configuration, emulator tooling, and authorization tests. Production releases now use only
GitHub Actions after merge to `main`; trusted administrative setup and device checks remain separate.

## 1. First commit

Create the GitHub repository, clone it, and extract this pack into its root. Do not put the pack inside
an extra nested application directory. Review the files, then from Windows PowerShell:

```powershell
git status
git add .
git diff --cached --stat
git commit -m "docs: define inventory app scope and implementation plan"
```

Push using the branch/remote you actually created; none is assumed here. The repository includes the
owner's MIT LICENSE. A private repository is a reasonable starting preference, not an app access
control: the application must remain secure even if its source becomes public.

## 2. Decide and record environment values

| Value | Initial choice / action |
| --- | --- |
| Local project ID | `demo-inventory` - synthetic emulator-only configuration |
| Cloud workflow | Owner chose one production project; normal development/tests use local emulators |
| Production project | Owner supplied actual configuration in ignored `.env.production.local` |
| Inventory ID | Proposed default `main` in each environment |
| Firestore | Existing Standard edition, `(default)` database, European multi-region `eur3` |
| Storage | Existing default bucket in regional `us-east1` |
| Owner UID | Obtain independently from Firebase Authentication in each cloud project |
| Display name | Suggested `My inventory`; editable |
| Default currency | Initially null; choose when first entering a value or in settings |

Blaze billing and US photo storage are accepted. New Firebase Storage buckets require Blaze; the chosen
region is eligible for the documented US no-cost Storage allowance. This is not a guarantee that all
storage, operations, downloads, or other services will cost zero. Do not assume two projects multiply
all billing-account-level free allowances. [References S01](REFERENCES.md#s01).

Select database/bucket locations carefully before creating resources. The Firestore database location
cannot be changed in place. [References S12](REFERENCES.md#s12).

## 3. Owner's single production cloud project

The owner created the cloud resources. See [M1 setup](M1_SETUP.md) for read-only verification and pending
checks. The sequence below describes required setup, not permission to recreate existing resources.
Use the Firebase console for remaining administrative setup; no privileged provisioning automation is required.

1. Verify the existing project and owner-reported Blaze plan. Do not enable optional Analytics or
   extensions by default. Any billing change requires explicit authorization.
2. Create an alerts-only billing budget at an amount you choose. Alerts do not automatically pause
   Firestore/Storage. Review actual usage after device testing and initial uploads.
   [References S02](REFERENCES.md#s02).
3. Verify the registered Web app and copy its exact web configuration into the ignored `.env.production.local`
   environment file. Copy the actual bucket name from the console, never infer it from an old tutorial.
4. Enable Google as the initial sign-in provider. Configure the app/support information requested by the
   console. Do not enable anonymous, phone, or password sign-in without a requirement.
5. Keep existing Firestore Standard `(default)` in `eur3` and Storage in `us-east1`. Review their actual
   rules for default-deny access. Do not switch to temporary public/test-mode access or recreate resources.
6. Review existing **Firebase Hosting** configuration for the static Vite build directory (`dist`) and SPA routing. No
   automatic production deployment in M0. The standard Hosting initialization flow is documented in
   [References S03](REFERENCES.md#s03).
7. Release the minimal sign-in shell through the reviewed GitHub pipeline. Complete the owner bootstrap in
   [Security](SECURITY.md): authenticate, obtain the UID, and seed the inventory root as administrator.
   Then disable end-user signup/deletion and verify the owner is the only production Auth user.
   Existing owner sign-in must work; another Google account must be rejected during authentication.
8. Release reviewed owner rules through the pipeline. Separately authorize and verify Storage-to-Firestore
   permission setup. Configure
   bucket CORS for the actual Hosting origin and test authenticated blob downloads, including denial for
   another account. No public bucket access.

A first cloud origin on the project's `firebaseapp.com` domain with a matching Auth domain keeps the
initial sign-in setup simple. Verify Firebase authorized domains and OAuth redirect configuration for
every served origin. Add localhost only if testing real OAuth from localhost is necessary; normal local
work uses the Auth emulator. Do not assume a Hosting preview automatically works with OAuth or isolates
the backend. Use the official redirect guidance for Safari. [References S08](REFERENCES.md#s08).

Inspect the bucket's soft-delete, retention, and versioning policies, and record the actual choice in an
ignored local operations note. Retained deleted objects may incur storage charges. Do not create lifecycle
rules that expire ordinary inventory photos. [References S18](REFERENCES.md#s18).

## 4. Local Windows toolchain

M0 uses mise with exact Node.js `24.21.0` and Temurin Java
`temurin-21.0.12+8.0.LTS` pins. npm `11.19.0` ships with that pinned Node release;
`packageManager` and strict npm engines record/enforce the matching version. The Firebase CLI
is pinned in `devDependencies`, never assumed globally. TypeScript 6.0.3 is selected because the
current typescript-eslint release supports TypeScript below 6.1; package versions are exact.

From PowerShell, after reviewing and trusting `mise.toml`:

```powershell
mise trust
mise install
mise exec -- npm ci
Copy-Item .env.example .env.local
mise exec -- node node_modules/@playwright/test/cli.js install chromium
mise exec -- npm run emulators
```

Keep the emulators running. In a second PowerShell terminal:

```powershell
mise exec -- npm run seed:local
mise exec -- npm run dev
```

Open `http://127.0.0.1:5173`. Local-only buttons sign in as the synthetic owner or an
unrelated synthetic account. Password sign-in is an emulator fixture, not a cloud sign-in provider.
Seeding creates only synthetic users and a trusted inventory policy; it does not claim an inventory
from the browser or overwrite an existing different owner. Seed input rejects cloud configurations.

The normal service ports remain 9099/8080/9199. Automated rules, integration, and browser tests start
their own suite on 19099/18080/19199, hub 14400, logging 14500, and Firestore websocket 19150. Tests
never reuse a running suite. If a port is occupied, the command fails; do not seed an unrelated suite.
Emulator binaries use ignored `.firebase-emulators/` so CLI upgrades cannot replace another project's
running Java files. First startup downloads them. Run suites sequentially, not concurrently.

Normal application data stays in memory; Auth persists only in the browser tab's session. Sign-out is
broadcast to other same-origin app tabs. M1 capture/gallery/recovery and cloud Google redirect sign-in
are implemented. Organization remains M2; cloud/device verification remains pending.

M0 loads `.env.local` for local commands and dedicated `.env.development.local` or
`.env.production.local` files for cloud builds. These do not inherit local emulator values. Process
`VITE_`/`APP_` values can override file values but still pass the same validation. Missing files or
values are hard failures. Cloud examples intentionally contain blank project/configuration values.
Production builds require `APP_PRODUCTION_PROJECT_ID` to match the actual Web configuration; no cloud
development project is required. Optional development builds require both explicit, distinct IDs if a
second project is ever authorized. Cloud builds now initialize the Firebase client SDK and enable
Google redirect sign-in. They must not be used as automated-test targets. The default CLI alias remains `demo-inventory`; cloud commands must
select the intended project explicitly.

When updating the toolchain, select a currently supported Node.js LTS release compatible with the chosen Vite and
Firebase CLI versions. Pin it in repository toolchain configuration and `package.json` engines. Commit
the npm lockfile and use a pinned project-local Firebase CLI through npm scripts. Install a Java runtime
compatible with the selected Firestore emulator; the official emulator guide currently calls out Java
21 or later for the upcoming requirement. Recheck when installing. [References S07](REFERENCES.md#s07).

Use Windows-compatible Node scripts rather than requiring Bash, WSL, or macOS. Add a small preflight that
checks environment mode, project ID, emulator flags/ports, and expected tool availability.

After the application exists, copy `.env.example` to `.env.local`. Its values are fake, local-only IDs.
Connect Auth, Firestore, and Storage emulators before any service call. Ports in the example are 9099,
8080, and 9199. Seed a synthetic owner/root and synthetic inventory through emulator-only tooling.
That seed must reject non-demo projects. Do not use a downloaded service-account key for normal local work.

For real iPhone camera/OAuth tests, use an explicitly authorized HTTPS cloud build with disposable samples. A phone's
`localhost` is not your Windows computer; LAN/emulator networking is not an initial requirement.

## 5. Implemented M0 command contract

These commands now exist. Scripts never deploy implicitly. Run them through `mise exec --` when mise
is not activated in your shell.

| Command | Required behavior after implementation |
| --- | --- |
| `npm ci` | Install exact dependencies from the committed lockfile |
| `npm run dev` | Start Vite in validated local/emulator mode |
| `npm run emulators` | Start required emulators with the explicit demo project |
| `npm run seed:local` | Create deterministic synthetic data; reject cloud projects |
| `npm run lint` | Check lint and formatting conventions |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run test` | Noninteractive unit/component tests |
| `npm run test:rules` | Start/use demo emulators and run positive/negative rules tests |
| `npm run test:rules:cloud -- --project PROJECT_ID` | Synthetic cloud Rules API evaluation in the deploy job using ADC; no inventory data reads/writes; local diagnostic use requires explicit authorization |
| `npm run test:integration` | Start isolated demo emulators and verify real SDK/seed integration |
| `npm run test:e2e` | Browser flows against emulators only |
| `npm run build` | Compile a local validation build; never deploy |
| `npm run build:dev` | Optional separate cloud-development build; unavailable in the owner's single-project workflow |
| `npm run build:prod` | Build with explicit production config; reject demo/development IDs |
| `npm run deploy:check -- production PROJECT_ID main` | Validate baked-in environment/project/inventory against an explicit destination; does not deploy |
| `npm run release:prepare` | Validate the production build/configuration fingerprint and write ignored exact-origin CSP/CORS settings for review; no cloud action |
| `npm run check` | Run lint, typecheck, unit, rules, integration, browser, and local build sequentially |

A build writes `dist/build-environment.json`. Deployment preflight rejects local builds and mismatched
environment/project/inventory values. Only the GitHub deployment job may invoke Firebase deployment;
it runs this preflight before publishing. Do not deploy from a local CLI or console.
The root Hosting CSP remains local-only. M1's `release:prepare` generates a separate ignored production
Firebase configuration with the required Auth/Firestore/Storage endpoints and same-origin auth frames.
Its exact-origin CORS file is never applied automatically. Follow [GitHub release steps](GITHUB_ACTIONS.md);
the cloud CSP, OAuth, CORS, IAM, and device gate still need actual verification after authorization.

## 6. Commit configuration, not secrets

During implementation, commit `firebase.json`, `.firebaserc` aliases as deliberately configured, Firestore
and Storage rule files, required Firestore index definitions, and documented CORS/header templates.
Do not commit admin credentials, personal records, cloud exports, emulator data, or real test photos.
The supplied `.gitignore` is a starting safeguard, not a secret scanner.

Every `VITE_` value becomes browser configuration, not a private server environment variable. Do not put
service-account keys or arbitrary secret API tokens there. [References S17](REFERENCES.md#s17).

## 7. Production release and operating routine

GitHub test/deployment automation is defined in `.github/workflows/ci.yml`; see
[GitHub Actions setup](GITHUB_ACTIONS.md) for the owner's three variables, keyless authentication,
one-time cloud setup and activation gates. PR checks use only emulators. Successful `main` builds
publish Firestore rules/indexes, Storage rules and Hosting after the explicit production preflight.
This is the only production deployment path. Every new or changed feature must have relevant emulator
coverage before merge. A failed job blocks release; fix through a PR and retry in Actions.

Use the existing production project and complete its verified bootstrap/configuration. Before merge, pass the
[test plan](TEST_PLAN.md), inspect the project/bucket IDs in the built config, review rules and indexes,
and review the pipeline's explicit deployment destination. Merge reviewed changes into `main`; the
pipeline publishes all tracked components after verification. Do not make local CLI/console releases.

Test owner login and one unauthorized account after deployment. Verify direct photo access is denied
without credentials, room/box behavior is correct, and no synthetic emulator records were seeded into cloud data. Record the release
commit and manual checks. Do not enter irreplaceable inventory data before export/restore works.

After substantial inventory sessions and before migrations, export an independent copy. Periodically
review usage, billing notifications, broken-photo reports, and unfinished operations. A previous frontend
release can be restored through a reviewed revert PR and pipeline deployment, but that does not
automatically undo database changes; migrations need their
own recovery plan. No paid automated backup service is assumed in V1.

## 8. Approved v1 reset and schema-v2 cutover

The owner approved replacing the initial test inventory without migration or v1 archive compatibility.
The owner explicitly preapproved the scoped production wipe on 2026-10-10. This section documents the operation; it does not claim execution.
V2 clients and both rule sets require a schema-v2 inventory root. Preserve its exact existing owner UID,
settings, creation timestamp and Auth account; change only its schema version through a trusted
administrative action. Do not delete the root, re-bootstrap ownership or allow a client to change it.

### Local demo reset

Local emulators are ephemeral: stop the `npm run emulators` process with Ctrl+C, then start it again
with `mise exec -- npm run emulators`, without importing an old emulator snapshot. Run
`mise exec -- npm run seed:local` in another terminal. The trusted synthetic owner/root is recreated
under `demo-inventory/main` with schema v2, and deterministic example rooms, boxes and photo-free items
are seeded. This is never a production credential or ownership source. Local examples include Gone,
review, packed/unpacked and a referenced archived room. Existing nonempty local items are not overwritten
by seed. Browser-test emulators deliberately seed Auth/root only; their tests create isolated examples.

### Production: owner-approved maintenance

Before executing anything, verify and report the exact project, inventory path, bucket prefix, observed collection
counts and intended root-version change. The owner has already authorized this scoped reset; no repeated wipe confirmation is required. Do not log
private records, photos or owner identifiers. The accepted reset discards v1 test content; exporting or
migrating it is not required for this specific owner-approved reset. Preserve any backup the owner wants
outside the repository. Refresh/close old app tabs and stop editing during the cutover.

1. Read the existing root administratively and preserve its owner binding, settings and creation history.
   Verify the independently configured production project, inventory ID and bucket. Never infer targets
   from the CLI default alias, a backup, an email or an environment variable that claims ownership.
2. Under the recorded owner authorization, delete **only** the target inventory's `items`, `rooms`, `boxes` and
   `restores` child collections, including restore-report `records` subcollections. Do not delete
   `/inventories/{inventoryId}`, other inventories, or Authentication users. In the Firestore console,
   open that exact inventory document and use Delete collection separately on each named child.
3. In Storage, open exactly `inventories/{inventoryId}/items/` in the independently verified bucket
   and delete its item-photo objects and child folders. Do not delete the bucket or other prefixes.
   Verify no objects remain there. Retention/soft-delete may retain billed historical copies; this is
   not a claim of physical erasure. Do not change retention, billing or IAM for this reset.
4. Verify the four child collections and nested restore claims are empty. On the preserved inventory
   root, edit only `schemaVersion` from integer 1 to integer 2 as administrator. Re-read the root and
   verify owner binding, settings and creation history remain identical. Never expose administrative
   credentials to frontend configuration.
5. Coordinate this maintenance with the owner-authorized merge of PR-01. Release Hosting, rules and
   indexes exclusively through the reviewed GitHub pipeline. A root/client/rule version mismatch must
   fail closed; expect a temporary unavailable state during cutover. Merge permission remains separate.
6. After the pipeline succeeds, refresh the application, verify owner sign-in and the empty v2 inventory,
   then perform separately authorized disposable device checks. Record actual maintenance and deployment
   evidence in the decision log, including the deployed commit/workflow and any unperformed checks.

Do not run these steps during ordinary implementation or as part of an automatic release. Rolling back
to a v1 client/rules does not recover wiped test content and conflicts with the v2 root. Prefer a reviewed
v2 fix or revert that retains v2 support. No migration, restore of ownership or automatic production seed
is introduced by the refactor.

### Executed production maintenance evidence

The owner preapproved this reset in the implementation chat on 2026-10-10. Administrative preflight independently verified project `my-things-c7305` and bucket `my-things-c7305.firebasestorage.app` belong together. Scope: `/inventories/main`, its four named child collections, and Storage prefix `inventories/main/items/`. Counts were items=1, rooms=1, boxes=0, restores=0, objects=0, with no nested collections.

The deployed Firestore rules were read and their v1 trusted-root/owner gate verified. A single administrative Firestore commit deleted the two observed documents using update-time preconditions and patched only the preserved root schemaVersion to 2 using its update-time precondition. The atomic operation also closed the old v1 client write gate. Root fields were re-read and verified identical except that version. All four collections (including missing parent documents) and the photo prefix were rechecked empty. Authentication was untouched. There was no Storage deletion because the scoped prefix was already empty. No credentials, owner UID, item content or private paths were logged in this evidence.

Hosting, rules and indexes were not deployed. The v1 app is temporarily unavailable until an owner-authorized PR merge completes the reviewed release pipeline. Wiped content cannot be recovered by rolling back the app.
