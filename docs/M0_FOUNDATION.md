# M0 foundation evidence

Date: 2026-10-10. Status: M0 complete locally. No cloud deployment or real inventory use.

This records the original M0 checkpoint. Subsequent owner setup decisions, the production-only build
guard update, and read-only checks are recorded in [M1 setup](M1_SETUP.md).

## Implemented acceptance criteria

- React/TypeScript/Vite application with strict TypeScript and a focused authenticated shell.
- Exact mise Node LTS/Temurin Java pins, matching npm engines, supported pinned application/test
  dependencies, a lockfile, and project-local Firebase CLI. Windows-compatible npm scripts implement
  the setup command contract.
- Configuration validation before SDK initialization. Local mode requires `demo-inventory` and all
  three loopback emulator settings. Startup probes all three services and has no live fallback.
  Cloud builds require separate explicit destinations; local/cloud configuration files are isolated.
- Trusted, deterministic synthetic users and an inventory-root seed. Seeding is idempotent, rejects
  cloud destinations and missing emulators, and refuses a different existing owner binding.
- Owner-only policy and child reads, validated root settings patches, denied root enumeration and
  client ownership claiming. Child record writes remain denied until their schemas/workflows exist.
- Storage ownership via Firestore policy, validated JPEG paths/types/limits, authenticated bytes and
  metadata access, scoped listings, separate deletion handling, and denied object updates.
- Session-scoped browser authentication, in-memory Firestore data, explicit denied/failure states,
  cross-tab sign-out, and protection against stale access reads restoring signed-out content.
- Firebase rules/index/Hosting configuration, cloud environment examples, a validation-only deployment
  preflight, and an unapplied CORS template. Existing product/schema/backup contracts and MIT license
  are preserved; starter license/status statements are reconciled.

## Exact checks actually run

The final complete command was `mise exec -- npm run check`, exit 0. It ran these commands sequentially:

| Command | Final result |
| --- | --- |
| `npm run lint` | ESLint and Prettier passed |
| `npm run typecheck` | Strict TypeScript passed |
| `npm run test` | 57 unit tests passed |
| `npm run test:rules` | 42 Firestore/Storage authorization tests passed |
| `npm run test:integration` | 5 real SDK/seed integration tests passed |
| `npm run test:e2e` | 5 Chromium browser tests passed |
| `npm run build` | Local validation build passed |

Additional commands actually run:

- `mise trust` and `mise install`: project pins installed; verified Node `24.21.0`, npm `11.19.0`,
  and Temurin Java `21.0.12`.
- `mise exec -- npm ci --no-audit --no-fund`: reproducible lockfile installation succeeded.
- `mise exec -- node node_modules/@playwright/test/cli.js install chromium`: browser binaries installed.
- `mise exec -- npm run format`: source/configuration formatting completed. Starter prose was excluded
  from wholesale formatting.
- `mise exec -- npm run build:dev` and `mise exec -- npm run build:prod`: deliberately rejected absent
  dedicated cloud configuration files, exit 1. These are fail-closed checks, not successful cloud builds.
- `mise exec -- npm run deploy:check -- production synthetic-production main`: deliberately rejected
  the local demo build, exit 1. No deployment occurred.
- `git -c safe.directory=D:/GitHub/my-things diff --check`: passed. `git ... check-ignore` verified that
  local configuration, logs, emulator binaries, generated test configuration, and build output stay ignored.
- Desktop and 390-pixel-wide screenshots from browser tests were visually inspected. No horizontal
  overflow was detected; controls and foundation status are visible. Screenshots contain synthetic/static
  content and live in ignored test output.

Configuration, service-health, seeding, repository, rules, and shell tests were exercised against failing
baselines before implementation. Intermediate failures were repaired; only the final gate above is
reported as passed. All tests used `demo-inventory`; none establishes a real backup/restore proof.

## Limits and remaining setup

- M1-M3 are unimplemented: no capture, photo conversion/gallery, inventory edits, rooms/boxes UI,
  moving workflow, trash recovery, export, or restore. Do not rely on this shell as an inventory.
- Cloud Google sign-in and SDK initialization are intentionally unavailable in M0. The owner's real
  Firebase project was not inspected, configured, seeded, provisioned, or deployed. Its intended
  development/production role, IDs/configuration, billing alert, regions, owner UID, OAuth domains,
  IAM integration, CORS, and Hosting headers must be reviewed during authorized M1 setup.
- Hosting CSP currently allows the local emulator endpoints only. The CORS template contains an origin
  placeholder and has not been applied. Neither production headers nor cloud photo access was tested.
- Actual iPhone Safari/camera/HEIC/Home Screen behavior and manual Edge/Chrome cloud tests were not run.
  Supported currency selection and money parsing belong to M2; M0 validates root currency-code shape
  and seeds a null default. Full nested item-schema and workflow-rule validation are still closed/deferred.
- Storage's reserved `firebaseStorageDownloadTokens` metadata is handled separately by the installed
  emulator and cannot be shown to be blocked by an ordinary custom-metadata allowlist. M0 exposes no
  token URLs and uses authenticated bytes in tests. Cloud token behavior/revocation must be reviewed
  before M1 photos. JPEG metadata validation does not prove image bytes are a decodable/safe image.
- Storage objects are immutable in M0. M1 must deliberately implement verified retries/metadata cleanup
  without permitting silent replacement of ready photos.
- An unrelated suite already occupies the normal development ports on this machine. It was not stopped.
  Automated suites use their separate ports/cache and shut down afterward. Stop or reconfigure the other
  suite before starting normal local development; do not seed it accidentally.
- Vite reports a 527.56 kB shared SDK/schema chunk warning (158.31 kB gzip). Phone/startup profiling and
  the synthetic scale gate remain later work. `npm ci` reports upstream transitive deprecations from
  CLI dependencies; no dependency audit was run or claimed. Unused dependency install hooks are
  explicitly denied, including automatic Firebase configuration injection.
- Git reported a repository ownership mismatch. Git commands use a per-command safe-directory
  exception; no global Git configuration was changed. The milestone includes the owner's previously
  untracked documentation pack alongside the implementation for review.

Next milestone: M1 capture and real cloud/device proof, only after explicit deployment
authorization. The operating instructions are in [Setup](SETUP.md), and full release gates remain in
[Test plan](TEST_PLAN.md).
