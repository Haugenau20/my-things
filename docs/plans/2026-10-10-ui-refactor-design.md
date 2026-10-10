# Approved workspace refactor

The owner approved `docs/UI_refactor/README.md`, PR-01 through PR-10 and screens A–F on
2026-10-10. Those decisions supersede the previous location, archive and capture presentation
contracts. Referenced archived rooms remain visible in browse filters, grouping and overview,
with an `(archived)` label; they remain unavailable for new assignments and capture.

## Implementation sequence

1. Schema v2: independent nullable room and box IDs, derived Gone state, v2-only export/restore,
   constrained rules, fixtures and documented reset. Preserve owner policy; production reset needs
   separate explicit confirmation. No migration or v1 compatibility.
2. Navigation shell and dedicated settings, location management and trash views.
3. Shared Room × Box filtering, cross-filtered counts, grouping and session context.
4. Cards, grouped grid and table, including group selection and packing.
5. Contextual bulk actions, range selection and per-item outcomes.
6. Acknowledged inspector edits with revision conflicts and the complete item view retained.
7. Persistent-in-session desktop capture panel and recent saves.
8. Responsive phone navigation, browse filters and full item view.
9. Phone shoot/name/save loop, bounded sequential in-memory uploads, retry and recoverable Undo.
10. Overview based on the same domain filters and counts.

Each slice updates its domain/repository/UI boundaries and relevant unit, rules, SDK integration
and browser coverage. Run the complete `npm run check` before proposing merge. Production releases
remain pipeline-only; no merge or destructive production maintenance is authorized by implementation.

## Reliability boundaries

Retain owner-only authenticated blob delivery, stable upload identities, server-acknowledged success,
partial revision-checked patches, explicit destructive confirmations, per-item bulk failures and
restore/export mutation barriers across all views. Capture queues are bounded and memory-only:
closing the browser does not promise to preserve unsubmitted source files. Pending attempts remain
visible and never count as saved items. Real iPhone camera/keyboard/Home Screen checks remain manual.

## Schema cutover

Schema v2 includes the trusted inventory root, location records and operational restore records as
well as items and archive manifests. A trusted, separately confirmed administrative reset must preserve
the existing owner UID and authorization root while updating its schema version. New rules and clients
reject v1. Update synthetic production policy evaluation alongside the rules so the reviewed release
pipeline verifies v2, without accessing real inventory content.
