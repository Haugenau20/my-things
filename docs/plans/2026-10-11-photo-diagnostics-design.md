# Safe photo-operation diagnostics

Owner-approved TODO-002 scope, 2026-10-11. This is an explicit copy action for troubleshooting;
there is no telemetry, logging service, or new cloud resource.

## Report and boundaries

Desktop capture, the phone queue, first-photo attachment, and reload recovery offer **Copy diagnostics**
after a tracked photo-operation failure. The five-line report contains a fixed format version,
the failing phase, an allowlisted code (or `unknown`), the pipeline commit, and the environment name.
Only `local`, `development`, and `production` are valid environment labels. The single production
project makes project/bucket/inventory identifiers unnecessary.

Registration means the recoverable Firestore record/photo metadata write. Verification includes
inspection of existing metadata/bytes, checking reselected source bytes, and verification after upload.
Upload means the SDK file transfer. Finalization means the acknowledged metadata transition to ready.
Each concurrent derivative carries its own failure boundary; a shared progress string is not used to
infer a failure phase. The innermost failure boundary is preserved.

The existing fixed SDK-code messages remain available. Missing/mismatched original bytes use fixed
`photo/source-missing` and `photo/source-mismatch` codes and retain reselection advice. Other unrecognized
codes become `unknown`. Wrapped errors retain no original SDK message/cause, custom data, object path,
record fields, authentication token or download URL. Reports contain no timestamps or user identifiers.
An untracked validation/preparation error does not invent a photo-operation phase.

The reviewed GitHub production build embeds `GITHUB_SHA`; emulator builds say `local`. A build outside
the pipeline without that variable says `unknown`. Report formatting accepts only a full lowercase
40-character commit hash or `local`; other version input becomes `unknown`. This identifier is diagnostic
context only and does not change configuration validation, authorization, or release policy.

## Interaction and recovery

Copying is a user action through the browser clipboard API. If clipboard access is denied or unavailable,
a visible, selectable readonly report and status message let the owner copy it manually. Clipboard error
text is never shown. Retry remains available, clears the prior diagnostics, and reuses the original
capture identity/source bytes. No selected photo is dropped and success still requires acknowledgment.
An acknowledged save/attachment/recovery followed by a failed inventory refresh retains its completed
status and uses fixed reload guidance. It never displays the raw refresh error or relabels the operation
as unfinished. A refresh failure does not invent a photo-operation diagnostic phase.
Sign-out unmounts the private workspace and diagnostics; a late clipboard completion cannot restore it.
A report already copied by the owner remains in their clipboard, like any other explicitly copied text.

## Verification

Unit coverage exercises all four phases, nested failures, safe code/version/environment formatting,
source recovery guidance, retry identity, and UI availability. SDK integration covers real emulator
owner success, denied unrelated registration, and an injected finalization failure followed by recovery
using verified emulator bytes. Browser coverage exercises upload-denial reports, clipboard success and
failure, retained source/retry behavior, diagnostics in attachment/phone/recovery, and sign-out during a
pending clipboard request. Separate browser component regressions use real demo SDK saves and inject
a rejecting post-acknowledgment refresh callback in capture, attachment and recovery.

Commands actually run on 2026-10-11:

- Test-first focused unit runs demonstrated missing phase/report/UI behavior, then passed after implementation.
- `mise exec -- npm run test:e2e -- tests/browser/photo-diagnostics.spec.ts` initially failed as intended: an acknowledged capture displayed the injected raw refresh error. The three catch branches were then corrected.
- `mise exec -- npm run check` passed lint/format, typecheck, 197 unit tests, 117 rules tests and 31 SDK integration tests. Its browser stage passed 60 cases (including all three refresh regressions), then failed the new clipboard assertion because Windows returns CRLF text; the final browser case and build did not run in that invocation.
- The test now normalizes only CRLF before checking the exact report fields. `mise exec -- npm run lint` passed again, followed by `mise exec -- npm run test:e2e` (all 62 browser tests passed) and `mise exec -- npm run build` (passed).
- `git diff --check` passed. The existing bundle-size warning remains; this slice makes no startup-performance claim.

All backend/browser checks used the complete `demo-inventory` emulator stack. These synthetic checks
do not establish actual Safari clipboard permissions, iPhone camera behavior, production IAM/CORS, or
a real backup/restore. No cloud data or policy changes are required for this slice.
