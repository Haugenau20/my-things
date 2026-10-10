# Home Inventory

A private, photo-first inventory for preparing an international move and finding possessions afterward.
Capture individual items on an iPhone, organize them on a Windows computer, decide what to store, take,
sell, or give away, and browse the things you still own while abroad.

**Repository status: M3 implementation verified in emulators; device and cloud recovery acceptance pending.** Name with optional photo
capture, a sticky room, optimized private photos, gallery/detail views, and interrupted-capture recovery
are present. Hosting, Firestore indexes/rules, and Storage rules are deployed. Required cross-service
IAM and exact-origin CORS are applied; the signed-out page and Google redirect start are verified.
Trusted owner bootstrap is complete and public signup is disabled. The owner verified reauthentication
and another account's rejection; actual iPhone/Windows capture checks remain pending. Review, metadata
editing, rooms/boxes, search, filters, bulk actions, moving outcomes, and reversible trash are implemented
for M2. M3 adds deployed recoverable permanent deletion and read-only orphan inspection, plus full
ZIP export with verified photo bytes, strict archive validation, and resumable restore into an empty
already-authorized inventory. See [M3 restore evidence](docs/M3_RESTORE.md), [M3 export evidence](docs/M3_EXPORT.md),
[M3 recovery evidence](docs/M3_RECOVERY.md), [M2 evidence](docs/M2_ORGANIZE.md),
[deployment evidence](docs/M1_RELEASE.md), [M1 evidence and release
steps](docs/M1_CAPTURE.md), and [M1 setup](docs/M1_SETUP.md). Real Web configuration remains ignored.

See [M0 evidence and limitations](docs/M0_FOUNDATION.md) and [Setup](docs/SETUP.md) for commands.

## The first version

- Fast capture: a name, optional photos now or later, optional details, and a sticky capture room.
- A desktop review inbox, photo gallery, compact table, search, filters, and bulk editing.
- Rooms before packing; numbered boxes during packing; original room retained after an item moves.
- Simple moving decisions and progress, with completed sales/donations kept in an archive.
- Owner-only access to records and photos, plus export/restore and recoverable deletion.

## Settled direction

| Area | Decision |
| --- | --- |
| Application | Responsive React + TypeScript + Vite web app; phone and desktop share one backend |
| Hosting | Firebase Hosting for the static application; not Firebase App Hosting |
| Authentication | Firebase Authentication with Google sign-in; one explicitly authorized owner |
| Records / photos | Cloud Firestore / Cloud Storage for Firebase |
| Billing | Blaze accepted; minimize usage costs rather than promise a zero bill |
| Location | Existing Storage is in `us-east1`; Firestore Standard is in European multi-region `eur3` |
| Development | Windows-friendly tooling; `demo-inventory` emulators locally and one production cloud project |
| Excluded | Native iOS app, IAP, YubiKey/WebAuthn integration, offline capture, and sharing workflows |

The public application shell and login page may be reachable by anyone. Private records and photos must
not be. Backend authorization, not the visibility of a React screen, is the security boundary.

## Read in this order

| Document | Purpose |
| --- | --- |
| [SPEC.md](SPEC.md) | Product behavior, scope, defaults, and acceptance criteria |
| [AGENTS.md](AGENTS.md) | Working instructions for coding agents and human contributors |
| [Architecture](docs/ARCHITECTURE.md) | Components, data access, environments, and service boundaries |
| [Data model](docs/DATA_MODEL.md) | Fields, location semantics, workflow transitions, and invariants |
| [Security](docs/SECURITY.md) | Owner authorization, private photos, bootstrap, and threat boundaries |
| [Setup](docs/SETUP.md) | Repository/Firebase setup, Windows workflow, and deployment checklist |
| [Photo pipeline](docs/PHOTO_PIPELINE.md) | Conversion, upload acknowledgment, retries, and cleanup |
| [Export format](docs/EXPORT_FORMAT.md) | Portable backup contract and restore behavior |
| [Test plan](docs/TEST_PLAN.md) | Security, functional, failure, device, and recovery tests |
| [Roadmap](docs/ROADMAP.md) | Small implementation milestones and completion gates |
| [Decisions](docs/DECISIONS.md) | Agreed choices versus editable implementation defaults |
| [References](docs/REFERENCES.md) | Official technical sources, checked on 2026-10-10 |

`SPEC.md` owns product requirements. The data model and export documents own their respective schemas.
`SECURITY.md` owns authorization requirements. Update related documents together when changing a decision.

## Start here

1. Read the M0 evidence and [Setup](docs/SETUP.md), then run the foundation locally.
2. Use the owner's existing production cloud project for explicitly authorized device checks and releases.
   Normal development and automated tests use local emulators; no second cloud project is required.
3. Run capture locally using [Setup](docs/SETUP.md), then follow [M1 release steps](docs/M1_CAPTURE.md)
   to prove the real iPhone-to-Windows capture loop once deployment is explicitly authorized.

## Configuration and commands

[.env.example](.env.example) contains **emulator-only configuration**, not real credentials. Copy it to
ignored `.env.local`. The implementation validates all required settings before Firebase initialization
and connects Auth, Firestore, and Storage to their emulators before service calls.

Use `mise install`, then `mise exec -- npm ci`. In one terminal run `npm run emulators`; in a second
run `npm run seed:local`, then `npm run dev` (prefix with `mise exec --` unless mise is activated).
`npm run check` runs the complete M0 automated verification sequence. Commands do not deploy.

No cloud project ID, account UID, currency, move date, or repository URL has been invented. Runtime setup
supplies those values. The owner's existing MIT license is preserved.

## First real acceptance test

Create 20 items in two rooms, including photo-free entries on Windows that receive photos later on the
iPhone. Review and bulk-edit them on Windows. Pack some into a
numbered box without losing their original room. Find them through the gallery. Export all records and
photos, and restore them into an empty, isolated, administrator-authorized verification inventory.
Separately, prove that another account
cannot access either records or photos.
