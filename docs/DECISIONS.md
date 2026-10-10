# Decision log and implementation defaults

Date: 2026-10-10. "Agreed" means established by the owner/conversation. "Default" means a concrete choice
proposed by this pack so implementation can proceed; it may be revised with rationale and tests. Defaults
are not additional claims about the owner's possessions, accounts, budget, or preferred currency.

## Agreed decisions

| ID | Decision | Reason / consequence |
| --- | --- | --- |
| A01 | Photo-first personal inventory for an international move | Optimize capture and later visual recall |
| A02 | Individual entries by default, some groups | Quantity exists but one entry has one location/outcome |
| A03 | Phone capture, optional immediate detail entry, desktop organization | Capture must not require a large form |
| A04 | Name and photo required; quantity/value/serial optional | Blank optional fields do not mean incomplete review |
| A05 | Rooms now; flat numbered boxes when packing | Retain original room separately from current location |
| A06 | Simple store/take/sell/give-away workflow | No marketplace, buyer, or pickup-management system |
| A07 | No offline capture requirement | Do not add a persistent local photo-sync system |
| A08 | One owner initially; all inventory data behind login | Public login shell accepted; backend data/photo authorization required |
| A09 | Responsive React/TypeScript + Vite + Firebase direction accepted | Familiar managed stack; no self-hosting |
| A10 | Blaze billing and US photo storage accepted | Target small usage costs, not guaranteed zero spend |
| A11 | Native iOS deferred; IAP and YubiKey explicitly out of scope | Do not implement them as hidden prerequisites |
| A12 | Export actual photos, test restore, and keep trash | Reliability before dependence on the application |
| A13 | Agentic coding on Windows | Clear specifications, repeatable tests, cross-platform scripts |
| A14 | Only the owner may authenticate to the production app | Close public signup after trusted owner bootstrap; keep only the owner Auth account |

## Concrete defaults supplied by this pack

| ID | Default | How to revisit |
| --- | --- | --- |
| D01 | Working title `Home Inventory`; inventory ID `main` | Rename without changing product behavior |
| D02 | Existing Storage `us-east1`; Firestore Standard `eur3` | Owner-created locations retained; test actual cloud behavior |
| D03 | Local demo project and one production cloud project | Owner chose no second project; automated tests remain emulator-only |
| D04 | Owner UID stored in trusted inventory root; Storage rules consult it | Change only with a reviewed policy and negative tests |
| D05 | Google sign-in with session-scoped Auth persistence initially | Test phone usability; persistence is not offline data storage |
| D06 | First-room association retained; current-location union | Correct original room explicitly, never silently on packing |
| D07 | Value is total entry value in integer minor units | Never reinterpret existing amounts through default changes |
| D08 | No currency selected; null default permitted | Choose at first value entry or in settings |
| D09 | JPEG detail 2,000 px / thumbnail 400 px; no cloud originals | Validate readability and real device formats before mass use |
| D10 | 2 photos/item; bounded file sizes and processing concurrency | Full embedded-metadata rules validation exceeded the expression budget at higher counts in M1 |
| D11 | Embedded bounded photo metadata, item revisions, staged recovery | Avoid a new backend merely to obtain cross-service transactions |
| D12 | In-memory metadata search; 250-document reads; 5,000-item test target | Measure before adding server search/pagination complexity |
| D13 | Simple category plus notes; no tag/custom-field engine | Add only after a repeated real need appears |
| D14 | Archive disposed entries; clear their current location | Do not leave sold objects in current box contents |
| D15 | Empty-destination restore; no merge; optional multipart export | Keep the exit path reliable and memory-bounded |
| D16 | npm, pinned tools, manual production release initially | Update scripts/docs together if changing tooling |

## Runtime details still to fill in

Actual project/Web configuration is now supplied in ignored local files; selected tools are pinned in M0.
Owner UID is verified and bound; origin/CORS/IAM are applied. Remaining details include billing alert amount; default
currency when desired; actual room names; and results of camera/HEIC/session tests. These are setup choices,
not blockers for writing M0. The single-project choice and existing regions are recorded below.
No precise move date or item count has been supplied.

### 2026-10-10 — Owner-only sign-in

The owner rejected allowing unrelated Google accounts to authenticate even when inventory access is
denied. Keep Google and the existing verified owner account, disable end-user signup/deletion through
managed Firebase Auth configuration, and retain the singleton production Auth user set. Setting read-back
succeeded with subtype `FIREBASE_AUTH`; no Identity Platform upgrade, Cloud Function, or magic-link
provider is required. No email/frontend allowlist becomes the inventory security authority. Keep
unrelated-UID emulator authorization tests as defense against an administratively created account.
The owner verified reauthentication reaches Capture and a separate account cannot finish Firebase
sign-in. A subsequent administrative read confirmed only the owner Auth account still exists.

## Decisions deliberately not made

The repository already includes an MIT license. No custom domain purchased. No sharing model, native authentication strategy, or
future paid service chosen. No exact budget/free-tier prediction or guarantee that all photos fit within
free allowances. No claim that this documentation is a deployed or security-audited application.

## Recording a change

### 2026-10-10 — M0 toolchain and authorization scope

The owner chose mise, matching their other projects. Pin Node LTS and Temurin Java in `mise.toml`,
record bundled npm explicitly, and keep npm scripts as the command contract. Pin the Firebase CLI as
a development dependency. TypeScript 6.0.3 retains compatibility with the selected lint tooling.
Automated tests use distinct loopback ports and a project-local emulator binary cache because another
project's suite is already running on the standard ports. No system processes/settings are changed.

M0 permits owner reads of documented collections, validated inventory settings updates, and bounded
JPEG creation/read/scoped-list/deletion. Child record writes and Storage object updates remain denied
until their feature-specific validation/recovery is implemented. Runtime settings validation checks
currency-code shape; supported currency selection/parsing belongs to M2. M0 provides no capture,
gallery, bulk edits, or backup functionality. No schema or product behavior has been changed.

### 2026-10-10 — Owner's single cloud project and existing regions

The owner explicitly chose the existing Firebase project as production and declined a separate cloud
development project. Normal development and all automated tests remain synthetic `demo-inventory`
emulator work. Production builds require an explicit matching production ID without a development ID;
if a development ID is configured, it must remain valid and distinct. Deployment, administrative owner
seeding, IAM/billing changes, and real-data maintenance still require explicit authorization.

Read-only checks confirmed Storage in `us-east1` and a Standard `(default)` Firestore database in `eur3`.
Keep both existing resources; no relocation is requested. Owner-reported Blaze/Google/Storage setup and
remaining manual checks are recorded in [M1 setup](M1_SETUP.md). App Check was considered and explicitly
deferred; Analytics remains absent from the application. Real Web settings stay in ignored production
configuration. Backup proof still requires an empty, isolated, administrator-authorized destination;
it must never overwrite the main inventory, and emulator checks are not real cloud recovery evidence.

### 2026-10-10 — M1 capture validation and bounded photos

The initial ten-entry default exceeded Firestore's 1,000-expression limit during full validation of
every embedded photo field. A three-entry version also exceeded the limit on the positive three-photo
capture test. Two entries passed full draft/completion authorization tests, including validation of
the second photo and rejection of a third entry. Keep strict validation and reduce D10 to two entries
before any real application inventory has been created. This is an editable numeric default; schema
version 1 and export structure remain unchanged. No real-data migration or cleanup was performed.
Increasing the limit requires a measured, tested rules/data-model change, not removal of field checks.

M1 permits exact acknowledged draft creation/finalization and explicit unfinished-capture discard.
Room creation is the minimal implementation needed by sticky capture; room edits and boxes stay M2.
Storage creation requires matching pending metadata and byte size in a draft, and existing objects
cannot be overwritten or have their metadata changed. Retries verify existing files and reuse them.
Private photo display holds at most 24 MiB of encoded data, with two concurrent downloads and URL
revocation when the last mounted viewer leaves or the authorized session ends. Source decoding is
sequential; uploads are bounded to two. Actual decoded browser memory is not a 24 MiB guarantee.

Native browser HEIC decoding is attempted. No conversion dependency is justified until the real-device
spike; failure explains JPEG/PNG reselection and leaves the source untouched. Cloud sign-in uses the
default firebaseapp.com Hosting origin so the helper and app share an origin. Release preparation
writes ignored exact-origin CORS/Hosting settings and validates the built configuration fingerprint;
it never deploys, changes IAM/CORS, seeds ownership, or changes billing. See [M1 evidence](M1_CAPTURE.md).

Add an entry with date, problem, decision, consequences, affected schemas/docs, test evidence, and rollback
or migration needs. Changes to privacy, data loss, scope, or paid infrastructure need explicit owner
agreement. Ordinary package choices and numeric limits may be adjusted with documented evidence.
