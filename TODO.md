# Improvement backlog

This backlog records findings from the UI refactor and photo-upload investigation, reviewed on
2026-10-11. It supplements [the roadmap](docs/ROADMAP.md); it does not change product scope or authorize
production maintenance, provisioning, IAM changes, or access to other projects.

The owner confirmed that adding and deleting photos works in production after PR #25. That closes the
reported upload/delete smoke check. Actual iPhone compatibility and isolated cloud backup/restore
acceptance remain separate checks. No critical defect was confirmed by this review; this is not a
complete security audit.

## Conventions and entry template

- Assign the next unused `TODO-NNN` ID. Keep IDs stable; do not renumber completed entries.
- Status: `Open`, `In progress`, `Blocked`, `Deferred`, or `Done`.
- Priority: `Critical`, `High`, `Medium`, or `Low`. Priority expresses urgency and impact, not certainty.
- Evidence: `Confirmed gap`, `Observed debt`, or `Investigation candidate`. Do not describe an
  investigation candidate as a proven defect.
- Effort: `Small`, `Medium`, or `Large`; use a range when uncertain. These are relative estimates,
  not calendar commitments.
- For completion, record the date, PR/commit, checks actually run, and any remaining manual limitations
  in the entry. A passing emulator test does not establish production or device acceptance.

Copy this template for each new entry:

```markdown
## TODO-NNN — Short action-oriented title

- Status: Open
- Priority: High / Medium / Low / Critical
- Effort: Small / Medium / Large
- Evidence: Confirmed gap / Observed debt / Investigation candidate
- Added: YYYY-MM-DD

**Problem and evidence:** Describe the concrete trigger, consequence, and source references. Separate
observations from hypotheses.

**Proposed work:** Describe the smallest useful change or investigation.

**Done when:** List observable acceptance criteria and relevant automated/manual verification.

**Dependencies and authorization:** Record prerequisites, decisions, and any separately required
authorization. Use "None beyond normal change review" when applicable.

**Completion record:** Pending. Replace with date, PR/commit, checks/results, and remaining limitations.
```

## Approved implementation batch

On 2026-10-11 the owner approved independent PRs for TODO-005, TODO-002, TODO-013 and TODO-004,
with parallel subagents in isolated worktrees. See the [approved plan](docs/plans/2026-10-11-backlog-design.md).
Implementation approval does not authorize merging or executing production maintenance.

## Lessons to apply while working this backlog

- Isolate one rule condition at a time and turn confirmed findings into regression cases. The
  upload investigation spent too long exploring IAM, bucket, and token hypotheses before isolating
  null metadata.
- Keep emulator results, synthetic cloud evaluation, actual production operations, and device checks
  distinct. Each supplies different evidence.
- Keep privacy decisions separate from incident diagnosis. Token-bearing URLs were explicitly approved,
  but that delivery change did not resolve the upload denial; null metadata handling did.

## TODO-001 — Prove real-cloud backup recovery

- Status: Open
- Priority: High
- Effort: Medium
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** Export/restore has automated coverage, but the real-cloud recovery gate in
[the export contract](docs/EXPORT_FORMAT.md) and [restore evidence](docs/M3_RESTORE.md) remains open.
Successful photo uploads/deletions do not prove that a saved archive can recover the inventory.

**Proposed work:** Export a representative inventory with photos and restore into a separate, empty,
trusted-owner verification inventory in the existing project. Keep every multipart archive together.

**Done when:** Saved archives are reopened, restored records and room/box relationships match, photo
hashes match, representative photos are readable, and recovery evidence is recorded without committing
personal records/photos. The main inventory is preserved.

**Dependencies and authorization:** Correct TODO-005 first. Provisioning the verification root and
operations on real data require separate explicit owner authorization. Follow the current schema v2
and export contracts; do not restore authorization from an archive.

**Completion record:** Pending.

## TODO-002 — Add safe photo-operation diagnostics

- Status: In progress
- Priority: High
- Effort: Small–Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** The production 403 investigation required repeated manual DevTools captures.
[Current error handling](src/media/capture-errors.ts) safely exposes fixed SDK codes, but does not supply
a compact diagnostic report distinguishing registration, upload, verification, and finalization.

**Proposed work:** Provide an explicit Copy diagnostics action with the failed phase, an allowlisted
error code, and deployed version. Include only environment identifiers needed to distinguish targets.

**Done when:** Synthetic failures in each phase produce useful, deterministic reports. Reports exclude
authentication/download tokens, token URLs, personal record fields, and inventory object paths. Unknown
errors remain visible and retryable without exposing raw SDK messages.

**Dependencies and authorization:** None beyond normal change review. External telemetry or error-reporting
services would require a separate privacy/scope decision.

**Completion record:** 2026-10-11 — implemented in [PR #29](https://github.com/Haugenau20/my-things/pull/29) (`11b6ab1`), pending review/merge. Capture, phone queue, attachment and recovery offer explicit copyable phase/code/build/environment diagnostics with fixed allowlists, selectable fallback and no raw SDK messages or private identifiers. Acknowledged saves retain truthful status if the subsequent inventory refresh fails. All required local stages passed: lint/typecheck, 197 unit, 117 rules, 31 SDK integration, 62 Chromium tests and build (407 tests). The initial full check exposed a Windows clipboard CRLF assertion; normalizing only CRLF corrected the test assumption, then lint, the full browser suite and build passed. Exact evidence is in the PR and its design record. Existing bundle warning and actual-device/cloud acceptance gates remain; no external telemetry or production operation was added.

## TODO-003 — Expand cloud rules regression coverage before merge

- Status: Open
- Priority: High
- Effort: Small–Medium
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** The emulator normalized metadata differently from production. PR #25 added
distinct omitted/null/empty cases to [the cloud evaluator](scripts/test-storage-policy-cloud.mjs), but
its document mocks still use a valid owner root and registered item. Cloud evaluation runs in the
deployment job; pre-merge cloud verification currently relies on a separate explicit command.

**Proposed work:** Add synthetic cases for missing/malformed policy and item data. Make cloud evaluation
a documented pre-merge gate for Storage rules changes, retaining the deployment gate. Choose an
authorized mechanism that does not expose cloud credentials to untrusted PRs.

**Done when:** Relevant positive and negative requests are covered, omitted/null/empty metadata stay
distinct, a deliberately broken rule fails the gate, and results are recorded before merge. Evaluation
uses only synthetic requests/mocks and changes neither inventory nor deployed rules.

**Dependencies and authorization:** Any new workflow cloud permissions require explicit owner approval.
Existing emulator authorization tests remain required.

**Completion record:** Pending.

## TODO-004 — Triage development-tooling dependency advisories

- Status: In progress
- Priority: High
- Effort: Medium
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** The 2026-10-11 `mise exec -- npm audit --json` result reports 11 findings:
seven high and four moderate, in the Firebase CLI dependency tree. `npm audit --omit=dev --json`
reports zero production findings. Advisory severity alone does not establish exploitability here.

**Proposed work:** Review affected versions, reachable tooling paths, and supported fixes. Use reviewed
dependency updates or narrowly justified overrides; do not blindly apply a forced audit fix.

**Done when:** Findings are resolved or have explicit exposure assessments and follow-up conditions.
The lockfile/toolchain remain reproducible, and emulator startup, repository checks, cloud evaluator,
production build, and release tooling still work. Record audit results without claiming tooling is
clean while findings remain.

**Dependencies and authorization:** None beyond normal change review; retain pinned supported tooling.

**Completion record:** 2026-10-11 — exposure assessment implemented in [PR #27](https://github.com/Haugenau20/my-things/pull/27) (`bcfb575`), pending review/merge. Four underlying advisories and their actual tooling paths have explicit assessments and revisit conditions. Pins/lockfile unchanged: full audit still reports 11 affected packages (7 high, 4 moderate); production audit reports zero. Clean `npm ci`, `mise exec -- npm run check` (180 unit, 117 rules, 30 SDK, 58 Chromium; lint/typecheck/build), 30 synthetic cloud-policy cases, and synthetic production build/preflight/release preparation passed. Actual-production-configuration preflight and deployment were not performed; see PR evidence for the safe synthetic alternative. This completes triage, not vulnerability elimination.

## TODO-005 — Correct and consolidate current operating instructions

- Status: Done
- Priority: High
- Effort: Small
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** At review, the operating steps in [M3_RESTORE.md](docs/M3_RESTORE.md) instructed
an administrator to seed schema version 1, while [the current data model](docs/DATA_MODEL.md) requires v2.
Milestone histories also contain older delivery policies and pending acceptance statements, making
current instructions harder to distinguish from historical evidence.

**Proposed work:** Correct current restore instructions and provide one current acceptance/operations
summary linking to historical evidence. Record the owner-confirmed PR #25 upload/delete check while
keeping unperformed device and recovery checks open.

**Done when:** Current instructions consistently use schema v2 and the approved token URL policy.
Historical results retain their dates/context, current acceptance statuses have evidence, and readers
can find authoritative restore/release steps without following obsolete instructions.

**Dependencies and authorization:** None beyond normal change review. Documentation changes do not
authorize executing the described cloud operations.

**Completion record:** 2026-10-11 — the original implementation merged in
[PR #26](https://github.com/Haugenau20/my-things/pull/26) (`e2b4b88`). It corrected restore schema and
reset status, added the current operations/acceptance guide and historical notices, and made the
verification destination explicit. Its local `mise exec -- npm run check` passed lint/format,
TypeScript, 180 unit, 117 rules, 30 SDK integration and 58 Chromium tests, plus build (385 tests).
Local documentation links and `git diff --check` passed.

[PR #31](https://github.com/Haugenau20/my-things/pull/31) retains that implementation and subsequent
main changes, corrects the remaining schema-v1 bootstrap table and SDK/bearer-link wording, and
consolidates restore instructions with explicit confirmation/resume controls. After resolving the
overlap with main, `mise exec -- npm run check` passed lint/format, TypeScript, 230 unit, 117 rules,
31 SDK integration and all 65 Chromium tests, plus build (443 tests). Local documentation links,
conflict-marker checks, TODO formatting and `git diff --check` passed. The follow-up remains subject
to normal PR review. The existing bundle warning, actual-device and isolated real-cloud recovery
gates remain; no production provisioning, maintenance or real-data operation was performed.

## TODO-006 — Reduce full-inventory refresh work

- Status: Open
- Priority: Medium
- Effort: Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** [Workspace reload](src/app/InventoryWorkspace.tsx) fetches all items, rooms,
boxes, settings, and restore state after many operations. [Item loading](src/data/capture-repository.ts)
uses pages but accumulates the entire collection. Latency and reads grow with inventory size.

**Proposed work:** Measure read counts and update acknowledged records in the local index where safe.
Retain explicit reconciliation for other tabs/devices and server revision checks.

**Done when:** Representative edits/captures avoid unnecessary collection-wide reads, counts/facets
remain consistent, and concurrent-edit, sign-out, failure, and reconciliation tests pass. Show measured
read/latency improvements; do not introduce offline synchronization.

**Dependencies and authorization:** None beyond normal change review. Preserve server acknowledgment,
conflict handling, and export consistency checks.

**Completion record:** Pending.

## TODO-007 — Measure browser behavior at the 5,000-item target

- Status: Open
- Priority: Medium
- Effort: Medium
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** Domain tests cover 5,000 synthetic records, but
[InventoryBrowser](src/app/InventoryBrowser.tsx) renders every filtered card/table row. Existing scale
coverage does not establish browser scrolling, interaction latency, or decoded-photo memory at that size.

**Proposed work:** Profile representative synthetic metadata/photos on desktop and phone-sized layouts.
Measure search/filter responsiveness, overview computation, DOM size, scrolling, and memory. Introduce
windowed rendering or calculation caching only where measurements justify it.

**Done when:** A reproducible baseline and agreed performance targets are recorded. Improvements meet
those targets without breaking grouping, selection/ranges, inspector navigation, counts, or accessibility.

**Dependencies and authorization:** Use synthetic fixtures. Coordinate measurements with TODO-006 and
TODO-008; device measurements remain distinct from desktop browser automation.

**Completion record:** Pending.

## TODO-008 — Reassess photo memory accounting for URL delivery

- Status: Open
- Priority: Medium
- Effort: Small–Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** [PhotoSession](src/media/photo-session.ts) retains URLs but still budgets
encoded file bytes against a 24 MiB limit. That sum does not measure decoded browser image memory.
The accounting originated under blob delivery and should be reassessed after the approved URL change.

**Proposed work:** Measure visible thumbnail/detail memory and request behavior. Evaluate bounds based
on active images and dimensions, alongside [visibility-based loading](src/app/PrivatePhoto.tsx).

**Done when:** The chosen limit has a documented rationale, representative measurements, and tests for
lease release, rapid scrolling, retry, cancellation, and sign-out. Avoid unnecessary load refusals and
do not claim an exact browser RAM guarantee from encoded-byte accounting.

**Dependencies and authorization:** Coordinate with TODO-007. Preserve owner-authorized URL issuance,
in-memory URL leases, and visible/retryable media errors.

**Completion record:** Pending.

## TODO-009 — Complete actual iPhone compatibility acceptance

- Status: Open
- Priority: Medium
- Effort: Small–Medium
- Evidence: Confirmed gap
- Added: 2026-10-11

**Problem and evidence:** Chromium viewport tests do not establish Safari camera, HEIC, keyboard,
safe-area, or backgrounding behavior. These remain explicit checks in [the test plan](docs/TEST_PLAN.md).
The owner-confirmed upload/delete result does not identify which additional device scenarios were run.

**Proposed work:** Exercise native camera/library input, HEIC/JPEG/PNG selection, rotation, keyboard
placement, backgrounding, interrupted uploads, and reload recovery on the owner's iPhone. Test Home
Screen presentation separately before advertising support.

**Done when:** Device/browser versions and actual scenarios/results are recorded, discovered failures
are fixed or documented, and no save is reported before acknowledgment. Queue loss on reload/sign-out
remains clear; no unsupported offline guarantee is introduced.

**Dependencies and authorization:** Requires owner device participation. Follow the existing capture
and privacy contracts.

**Completion record:** Pending.

## TODO-010 — Extract focused flows from large UI components

- Status: Open
- Priority: Medium
- Effort: Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** [ItemEditor](src/app/ItemEditor.tsx),
[InventoryBrowser](src/app/InventoryBrowser.tsx), and [PhoneCapture](src/app/PhoneCapture.tsx) are each
roughly 600 lines and combine several interaction flows. Size alone is not a defect, but intertwined
state and rendering increase the cost of future changes.

**Proposed work:** Extract focused sections/hooks when modifying these areas. Keep domain transitions
and Firebase operations in their existing dedicated modules; avoid a generic workflow framework.

**Done when:** Responsibilities and state ownership are clearer, behavior remains unchanged, and the
relevant conflict, recovery, focus, selection, and capture browser tests pass. Each extraction is small
enough to review independently.

**Dependencies and authorization:** None beyond normal change review. Prefer targeted refactoring
alongside related work over a broad rewrite.

**Completion record:** Pending.

## TODO-011 — Audit focus and keyboard shortcuts across overlays

- Status: Open
- Priority: Medium
- Effort: Small–Medium
- Evidence: Investigation candidate
- Added: 2026-10-11

**Problem and evidence:** Workspace and inspector navigation use global key listeners. Existing tests
cover several keyboard flows, but interaction with open sheets/popovers and assistive technology merits
review. Shortcut interference is not a confirmed defect from this review.

**Proposed work:** Check N, J/K, arrows, Escape, focus return, and focus containment with dialogs,
popovers, and editable controls. Perform keyboard-only and iPhone VoiceOver checks.

**Done when:** Shortcuts affect only the intended active context, closing overlays restores sensible
focus, controls are operable and announced correctly, and confirmed regressions gain automated coverage
where practical. Record manual assistive-technology evidence separately.

**Dependencies and authorization:** Coordinate with TODO-009. Preserve intended nonmodal inspector
behavior; do not impose a focus trap on the surrounding grid without a design reason.

**Completion record:** Pending.

## TODO-012 — Profile startup and defer optional screen code

- Status: Open
- Priority: Low
- Effort: Small–Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** Builds retain the large bundle warning. Backup and administrative UI are
imported by the workspace even though capture/browsing are the primary flows. The warning alone does
not establish a user-visible performance problem.

**Proposed work:** Measure initial transfer, parsing, and usable-screen timing. Consider loading
export/restore or other optional screens on demand where measurements show a useful improvement.

**Done when:** Before/after measurements show a benefit, loading/failure states are accessible and
retryable, and navigation, authentication, backup/recovery, production build, and CSP behavior remain
correct. Do not merely suppress the warning.

**Dependencies and authorization:** None beyond normal change review. Coordinate with TODO-007.

**Completion record:** Pending.

## TODO-013 — Replace message matching with typed operational errors

- Status: In progress
- Priority: Low
- Effort: Small–Medium
- Evidence: Observed debt
- Added: 2026-10-11

**Problem and evidence:** [ExportPanel](src/app/ExportPanel.tsx) recognizes controlled failures through
message-text patterns. Wording changes can alter handling, and recovery behavior becomes harder to
maintain when error categories are implicit.

**Proposed work:** Introduce narrowly scoped error categories for known operational failures and map
them to user-facing wording. Retain sanitized handling of unknown external errors.

**Done when:** Changing display wording cannot change error classification, cancellation/conflict/
incomplete-backup cases retain correct behavior, and targeted tests cover known and unknown failures.
Do not expose raw SDK messages, personal paths, or token URLs.

**Dependencies and authorization:** None beyond normal change review. Coordinate error categories with
TODO-002 without building an elaborate provider abstraction.

**Completion record:** 2026-10-11 — implemented in [PR #28](https://github.com/Haugenau20/my-things/pull/28) (`4133a51`), pending review/merge. Export producers now emit explicit categories and the panel uses fixed safe messages; display wording cannot change classification. Cancellation, incomplete backups, changed inventory and unknown failures retain safe recovery behavior. All required local stages passed: lint/typecheck, 199 unit, 117 rules, 30 SDK integration, 60 Chromium tests and build (406 tests). The initial check stopped at missing emulator configuration; after supplying the tracked demo example, the browser suite passed on an unchanged retry following a Chromium resource error. Exact evidence is in the PR and its `docs/EXPORT_ERRORS.md`. Existing bundle warning and real-cloud/device acceptance limitations remain; no production operation was performed.
