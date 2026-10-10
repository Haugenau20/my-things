# Working instructions for coding agents

## Read first

Read `README.md`, `SPEC.md`, and `docs/ROADMAP.md` before changing code. Then read the relevant schema,
security, photo, and export documents. This is a personal, single-owner inventory, not a platform.

This initial repository contains documents and configuration examples only. Do not claim existing code,
tests, npm scripts, Firebase rules, or cloud resources. Implement the requested milestone, not the entire
roadmap at once. Preserve these files when scaffolding; scaffold in a temporary directory and merge if a
generator would overwrite them.

## Product boundaries

Use React, TypeScript, Vite, Firebase Hosting, Firebase Authentication, Firestore, and Cloud Storage.
Use managed services. IAP and YubiKey integration are explicitly out of scope. Do not add a native app,
offline synchronization, public sharing, custom authentication, server-side rendering, Cloud Functions,
Cloud Run, a second cloud provider, a custom field engine, or AI services without a documented need and
owner approval.

Blaze and US photo storage are accepted. The owner chose one production cloud project with existing
Storage in `us-east1` and Firestore in `eur3`; local work/tests remain on `demo-inventory`. Runtime project
IDs and Web configuration stay in ignored environment files. These choices do not authorize autonomous
provisioning or deployment. App Check is deferred. No owner UID or currency has been provided.

## Non-negotiable safety rules

- Default-deny both Firestore and Storage. Google sign-in alone is not authorization. Never broaden rules
  to `request.auth != null`, public read, or public write to make the application or tests work.
- The inventory owner is seeded through a trusted administrative action. Never make the first visitor,
  first authenticated user, email address in a form, or local environment variable the security authority.
- Local development/tests use `demo-inventory` and all required emulators. Validate configuration before
  SDK initialization. Missing emulator configuration must fail, not fall back to a live service.
- Never deploy, run destructive maintenance, seed production, change billing/IAM, or migrate real data
  unless explicitly instructed. An implementation request is not a deployment request.
- Never commit inventory records/photos, exports, authentication tokens, service-account keys, or logs
  containing personal data. Never paste real inventory data into external tools. Use synthetic fixtures.
- Firebase web configuration is not an admin credential; nevertheless keep environment choices explicit.
  Any `VITE_` value is browser-visible. No Admin SDK or private credential in frontend code.
- Do not use `getDownloadURL()` for gallery photos. Use authenticated blob retrieval and object paths.
  Do not substitute a public URL because CORS or rules are misconfigured.
- Never claim success while a required upload/write is pending. Do not catch errors and silently discard
  them, auto-delete failed records, or turn a partial export into a successful full backup.

## Implementation conventions

Use strict TypeScript. Validate external data, configuration, and imported archives at runtime. Model
current location as a discriminated union; do not replace it with ambiguous free text. Keep value/currency
semantics, original-room preservation, archive rules, and soft deletion exactly as documented.

Keep React components focused on rendering and interaction. Put domain transitions in testable functions,
Firebase operations in small repository modules, and photo/export work in dedicated modules. Do not build
an elaborate provider abstraction, generic workflow engine, or speculative extension system.

Choose supported stable dependencies when scaffolding, pin the toolchain, and commit the package lockfile.
Use npm as the default package manager and cross-platform scripts that work from Windows PowerShell.
Do not assume Bash, WSL, macOS, or a globally installed CLI. Implement the command contract in
`docs/SETUP.md` and document any deviations.

Use transactions/revision checks for contested item edits. Apply partial field patches, not stale entire
form snapshots. Bulk actions must report per-item outcomes. Use bounded upload/download concurrency and
release temporary image/object-URL memory.

Keep code comments focused on intent and non-obvious failure handling. Do not leave disabled security,
skipped critical tests, broad `any`, placeholder success responses, or TODO-backed claims of functionality.

## Verification and reporting

After scaffolding, run the relevant formatting/lint, typecheck, unit, rules, integration, browser, and
build checks defined in the repository. Before that point, do not pretend those commands exist.

Negative authorization tests are required alongside positive tests. Emulator checks do not establish
that production IAM, CORS, OAuth domains, or browser camera behavior are correct; document manual tests
separately. Use `docs/TEST_PLAN.md` as the release checklist.

After each milestone, report:

1. What changed and which acceptance criteria are satisfied.
2. Exact checks actually run and their results.
3. Anything not tested, remaining manual setup, or known limitations.

Never describe an unrun test as passed. Never describe emulated data as a real backup/restore proof.

## Change control

Treat `SPEC.md` as product authority, `docs/DATA_MODEL.md` as data authority, `docs/EXPORT_FORMAT.md` as
backup-format authority, and `docs/SECURITY.md` as authorization authority. If documents conflict, surface
the conflict and propose the smallest consistent change; do not silently weaken the stricter protection.

Editable implementation defaults are listed in `docs/DECISIONS.md`. A dependency or numeric limit may
change with a documented rationale and tests. Scope, privacy, owner authorization, and data-loss behavior
require an explicit owner decision. Before schema changes affecting real data, export, test a migration
in development, version it, and document recovery. Update documentation in the same commit as the change.
