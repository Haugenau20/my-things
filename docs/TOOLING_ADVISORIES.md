# Development-tooling advisory assessment

Date: 2026-10-11. Scope: TODO-004, the committed npm lockfile and the repository's actual emulator,
cloud-policy evaluation and release commands. This is a dependency triage, not a complete security audit.

The refreshed full audit reports **11 affected packages: seven high and four moderate**. These are
four underlying advisories plus propagated dependency findings, all under development-only
`firebase-tools`. `npm audit --omit=dev --json` reports **zero production findings**. Tooling is not
vulnerability-free: development and CI processes still execute these installed dependencies.

Keep `firebase-tools` 15.33.0, the lockfile, and the pinned Node 24.21.0/npm 11.19.0 toolchain unchanged.
The npm registry's latest Firebase CLI is still 15.33.0. The available upstream fixes below do not fit
the affected consumers' supported dependency ranges. No forced audit fix, downgrade, new override,
advisory suppression, or vendored patch is applied. The existing Firestore/gRPC override is unchanged.

## Four underlying findings

Every path below starts at `firebase-tools@15.33.0`. Versions and call sites were inspected after a
clean `mise exec -- npm ci`; reachability conclusions are specific to this repository and version.

### OpenTelemetry baggage parsing — moderate

Path: `@google-cloud/pubsub@5.3.1` → `@opentelemetry/core@1.30.1`.
[GHSA-8988-4f7v-96qf](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf)
affects inbound W3C baggage parsing; upstream identifies 2.8.0 as patched.

The CLI imports Pub/Sub in `lib/emulator/pubsubEmulator.js`. Our emulator wrapper explicitly starts
only Auth, Firestore and Storage, and the production workflow releases only Firestore rules/indexes,
Storage rules and Hosting. It does not run Pub/Sub or Functions. Additionally, the installed Pub/Sub
`build/src/telemetry-tracing.js` uses `W3CTraceContextPropagator`, not the affected
`W3CBaggagePropagator`. No reachable inbound baggage parser was identified in the reviewed commands.
This does not establish safety for other Firebase CLI commands.

Pub/Sub 5.3.1 requires core `^1.30.1`; overriding it to core 2 crosses a major boundary. The registry
has Pub/Sub 6.2.0 using core `^2.8.0`, but the CLI requires Pub/Sub `^5.2.0`. Prefer a supported CLI
update rather than independently replacing its telemetry/client stack.

**Revisit:** on the next CLI update, a compatible patched Pub/Sub/core release, or before enabling
Pub/Sub, Functions, baggage propagation, or any new CLI command that consumes untrusted messages.

### FTP directory-listing parser — high

Path: `proxy-agent@6.5.0` → `pac-proxy-agent@7.2.0` → `get-uri@6.0.5` → `basic-ftp@5.3.1`.
[GHSA-c475-qrg2-pj4r](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-c475-qrg2-pj4r)
affects `Client.list()` on a malicious FTP directory listing; upstream identifies 6.2.1 as patched.

The installed `get-uri/dist/ftp.js` can reach `Client.list()` while fetching an FTP URI when its
modification-time request does not supply a timestamp. That chain could be relevant to an FTP-hosted
proxy auto-configuration file. However, the installed CLI `lib/apiv2.js` uses Undici's `ProxyAgent`,
and a search of its compiled `lib` files found no import of the separate `proxy-agent` package. The
repository does not configure FTP/PAC fetching or expose a URL input to this chain. The reviewed
cloud evaluator uses the CLI's `apiv2` client. No reachable FTP listing was identified here; the
installed vulnerable parser remains and should not be reused by new tooling.

`get-uri` requires basic-ftp `^5.0.2`, which excludes the fixed 6.x version. Even the registry's latest
get-uri 8.0.1 still declares basic-ftp `^5.3.1`. A forced major override would create an unsupported
combination for an unused path. It is not warranted solely to reduce audit totals.

**Revisit:** on the next CLI/proxy dependency update, a compatible fixed release, any direct use of
get-uri/basic-ftp, or before introducing PAC/FTP proxy configuration. Reinspect actual imports;
package presence alone is not proof that a future CLI continues to leave this path unused.

### Brace-pattern recursion — high

Path: `chokidar@3.6.0` → `braces@3.0.3`.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports stack exhaustion
from deeply nested input patterns. There is no published patched version; the registry still lists
3.0.3 as latest. The [upstream report and maintainer discussion](https://github.com/micromatch/braces/issues/70)
disagree about the advisory's practical significance. Keep the finding visible rather than treating
that disagreement as a fix.

This is the advisory with a dependency actively used by our emulators. Firestore's
`lib/emulator/firestoreEmulator.js` and Storage's `lib/emulator/storage/rules/manager.js` watch the
repository-controlled rules paths. `firebase.json` supplies the fixed `firestore.rules` and
`storage.rules` names. Inventory names, imported archive paths and HTTP request fields are not
passed as watch patterns. The local/test emulators bind to loopback. A contributor who changes
repository configuration can already execute project code in verification; PR verification receives
no cloud credentials. Review changes to rule paths and do not turn owner data or external input into
glob/watch patterns.

There is no patch to select. Overriding chokidar across a major version would change watcher/glob
behavior outside the CLI's declared `^3.6.0` contract.

**Revisit:** when braces publishes a fix or Firebase adopts a supported watcher update, and before
accepting external watch/glob patterns or expanding the emulator service set.

### UUID output-buffer validation — moderate

Path: `gaxios@6.7.1` → `uuid@9.0.1`; the same gaxios instance also serves the CLI's
`google-auth-library@9.15.1`, `gcp-metadata@6.1.1` and `gtoken@7.1.0` paths.
[GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)
affects v3/v5/v6 calls with a caller-provided output buffer or offset. The upstream fix includes
11.1.1; the v4 API is not affected.

The installed `gaxios/build/src/gaxios.js` has one UUID call: `v4()` without arguments, used for a
multipart boundary. It does not call v3/v5/v6 or supply an output buffer. The affected operation was
not identified on this dependency path. The separate analytics dependency resolves uuid 14.0.3 and
is not the flagged 9.0.1 instance.

gaxios 6.7.1 requires uuid `^9.0.1`; no patched 9.x release was found. Replacing it with 11.1.1 crosses
two major versions to address an operation the consumer does not use. Retain the supported tree
rather than adding a security override without a reachable risk or upstream compatibility basis.

**Revisit:** when the CLI adopts a newer gaxios/auth stack, a compatible fix appears, or a dependency
starts calling UUID v3/v5/v6 with externally influenced buffers/offsets.

## Audit interpretation and maintenance

The high entries are `basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent`, `braces`, `chokidar`,
and `firebase-tools`. Moderate entries are `@opentelemetry/core`, `@google-cloud/pubsub`, `uuid` and
`gaxios`. Their parent entries are propagated findings, not seven additional independent advisories.

npm suggests firebase-tools 14.23.0 as a major change, while also reporting the CLI affected range as
`>=6.9.0`. That suggestion is not evidence that the downgrade resolves these findings. It would
regress the currently pinned CLI and requires its own dependency/release compatibility assessment.
Do not run `npm audit fix --force` to apply it.

Re-run both audits and this call-path review with every tooling dependency update. If any trigger
above changes, reassess before enabling the new path. Prefer supported upstream updates; use an
exact, consumer-scoped override only with a compatibility rationale and relevant tests. Preserve
loopback demo emulators, credential-free PR verification, reviewed main-only deployment and the
existing script allowlist. Audit results alone do not prove that the frontend bundle or CI is secure.

## Verification on 2026-10-11

- `mise exec -- npm ci`: passed from an empty worktree dependency directory; installed 847 packages.
  Reported the same 11 findings. No package or lockfile changes.
- `mise exec -- npm audit --json`: exit 1, as expected with 11 unresolved findings (7 high, 4 moderate).
- `mise exec -- npm audit --omit=dev --json`: exit 0, zero findings.
- `mise exec -- npm ls @opentelemetry/core @google-cloud/pubsub basic-ftp get-uri braces chokidar uuid gaxios proxy-agent pac-proxy-agent`:
  passed; confirmed the versions and dependency paths above.
- Registry `npm view` queries: confirmed latest Firebase CLI 15.33.0, braces 3.0.3,
  Pub/Sub 6.2.0 with core `^2.8.0`, get-uri 8.0.1 with basic-ftp `^5.3.1`, and the installed consumer
  major-version constraints. Upstream advisories and issue links above were inspected on this date.

- `mise exec -- npm run test -- tests/unit/ci-environment.test.ts tests/unit/release-preparation.test.ts tests/unit/release.test.ts tests/unit/safety.test.ts`:
  passed all 35 existing synthetic configuration, destination, CSP and real-CLI release preparation cases.
- `mise exec -- npm run test:rules:cloud -- --project my-things-c7305`: passed all 30 synthetic
  cloud Rules API cases using existing CLI authentication. No inventory data, objects or deployed
  rules were read or changed. This checks evaluator/CLI compatibility, not production IAM or OIDC.
- `mise exec -- node scripts/prepare-ci.mjs production`, `mise exec -- npm run build:prod`,
  `mise exec -- npm run deploy:check -- production synthetic-production main`, and
  `mise exec -- npm run release:prepare`: passed using the existing `ci-environment.test.ts`
  synthetic Web configuration. The initial lower-level release fixture's invalid CI app ID was
  correctly rejected before any build; the valid CI fixture above then passed. Generated files
  remain ignored. The existing large-bundle warning remains.

Actual-production-configuration build/preflight was not rerun. Automatic approval review rejected
copying the production environment file into this worktree because duplicating potentially sensitive
configuration was not explicitly authorized for the dependency audit. Synthetic fixtures provided
the safe compatibility check; production remains the reviewed GitHub pipeline's responsibility.

`mise exec -- npm run check` passed formatting/lint, TypeScript, 180 unit, 117 rules, 30 SDK
integration and 58 Chromium browser tests (**385 tests**), then the local build. Auth, Firestore
and Storage emulators started and shut down successfully in the isolated `demo-inventory` environment.
This full run includes the 35 focused release/configuration cases above; they are not additional
unique tests. The 30 synthetic cloud-policy cases are separate. `git diff --cached --check` passed.
Package/toolchain/lockfile contents remained unchanged after installation and verification.

No production deployment, real-data backup/restore or actual-device acceptance was performed.
