# Typed export failures

TODO-013 implementation evidence, 2026-10-11.

Export failures now use a small export-specific `ExportError` category and fixed display messages.
The panel no longer recognizes failures by matching their message text, and it never displays raw
external error messages. Authentication, unfinished restores/captures/photo operations/deletions,
missing references, duplicate records, supported limits, unverified photo reads and changed inventory
have explicit categories. Unexpected failures retain the safe retry message.

The photo category identifies the failed read/verification boundary; it does not claim whether a
network failure, unavailable object, changed metadata or checksum caused that failure. Original SDK
messages, object paths, tokens and item fields are not included. AbortSignal cancellation takes
precedence, including a rejected in-flight photo read. Saved multipart photo ZIPs still cannot produce
a complete backup claim when verification or the final revision/settings check fails.

The archive format, authenticated photo-byte verification, owner authorization and memory limits are
unchanged. No shared error framework, external reporting service or production operation was added.

## Verification

- Producer regression tests first failed because plain errors had no category. Focused unit tests
  then passed after the implementation. Presentation tests cover changed messages for each category,
  unknown failures with familiar-looking text and sensitive synthetic content, and cancellation.
- Export tests cover unfinished operations, missing relationships, record/photo limits, failed or
  changed photo bytes, cancellation during a failed read, inventory changes and incomplete multipart
  output. Existing archive/checksum and synthetic scale checks remain in place.
- SDK integration asserts the missing-photo category and retains positive-owner and foreign-account
  rejection coverage. Browser regressions exercise safe unknown-error display, failed photo reads,
  retry and cancellation against `demo-inventory`.
- `mise exec -- npm run check` passed lint/format, strict typecheck, 199 unit tests (including the
  synthetic 2 GiB split exercise), 117 rules tests and 30 SDK integration tests. It then stopped before
  browser tests because this new worktree lacked `.env.local`. The tracked emulator-only `.env.example`
  was copied to the ignored `.env.local`; no production configuration was used.
- `mise exec -- npm run test:e2e` initially passed 21 cases, then Chromium failed to fetch a Vite runtime
  script with `net::ERR_NO_BUFFER_SPACE`, leaving the next test's page blank before login. A full
  unchanged retry passed all 60 browser tests, including both new error/retry regressions. Tests and
  timeouts were not weakened.
- `mise exec -- npm run build` passed with the existing large-chunk warning. All required local check
  stages passed; the original `check` wrapper did not exit successfully because of the setup failure.

Real-cloud backup/restore, actual iPhone compatibility and filesystem persistence of downloads remain
separate acceptance checks. Emulator results do not establish those outcomes.
