# Approved backlog implementation plan — 2026-10-11

The owner approved four independent PRs after reviewing the proposed scope. Develop them in isolated
worktrees, with the coordinator handling TODO-005 and three parallel subagents handling TODO-002,
TODO-013 and TODO-004. Each PR targets main; none requires a shared error framework or schema change.

| Item     | Scope                                                                                                                   | Verification                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| TODO-005 | Correct current v2 restore steps, consolidate acceptance/release guidance and preserve historical evidence              | Contract/link review, formatting and full repository check                        |
| TODO-002 | Explicit copyable diagnostics with typed failure phase, allowlisted SDK code and deployed version                       | Phase failures, sanitization, copy/retry and emulator/browser coverage            |
| TODO-013 | Narrow typed export errors and fixed safe messages instead of message-pattern classification                            | Cancellation, conflicts, incomplete backups, limits and unknown failures          |
| TODO-004 | Refresh advisory exposure assessment; apply supported safe fixes or document unresolved findings and revisit conditions | Reproducible install, audits, emulator/check/build and release-tool compatibility |

Photo and export errors use domain-specific categories with safe display mappings. Personal fields,
paths, SDK messages and token URLs are excluded. Dependencies remain pinned; no forced audit fix.
Full emulator runs are serialized to avoid shared-port collisions. Each final PR runs
`mise exec -- npm run check`; record exact results and any limitations in its evidence document.
The coordinator reconciles shared documentation/backlog entries. Preserve the originally untracked
TODO.md and include it with the operating-instructions PR.

Suggested review order is docs, export errors, photo diagnostics, tooling. Open PRs for review; this
approval does not authorize merging, production maintenance, new cloud permissions or device claims.
Real-cloud recovery and actual iPhone acceptance remain separate owner-assisted work. Performance
items need a coordinated measurement pass; broad component rewrites are excluded.
