# First pipeline release: Storage discovery failure

> Historical evidence: behavior, authorization and pending checks below describe their recorded
> milestone. For current schema, photo policy, release procedure and acceptance status, start with
> [current operations](OPERATIONS.md). Earlier permissions do not authorize new maintenance or merges.

The first main deployment [run 38083084954](https://github.com/Haugenau20/my-things/actions/runs/38083084954)
for commit `b44c0ca` passed the complete emulator verification suite, production configuration/build,
destination preflight, release preparation, GitHub OIDC authentication and nine synthetic Storage policy
cases. Firebase CLI 15.33.0 then stopped during Storage preparation with "Firebase Storage has not been
set up". No rules or Hosting release succeeded in that run; the existing earlier release remains the
last confirmed deployment.

## Diagnosis

The generated production Firebase configuration specified only a Storage rules file. For this object
format, the pinned CLI calls `GET /v1alpha/projects/PROJECT/defaultBucket`; its 404 branch produces the
misleading setup instruction. Read-only administrative requests returned HTTP 200 for both the default
association and Firebase bucket metadata, confirming the existing `my-things-c7305.firebasestorage.app`
bucket. This does not mean the bucket is absent or should be recreated.

The failed workflow establishes a 404 during the deploy identity's discovery call. Administrative
reads succeed; the underlying reason for that identity-dependent API response is not established.
No matching Firebase Storage audit entries were available, and read-only service-account impersonation
was unavailable. No extra IAM grants or private keys were introduced to investigate it.

## Change and verification

Release preparation writes a Storage bucket array containing the exact validated
`config.firebase.storageBucket` and the reviewed rules path. The pinned CLI supports this explicit
format and skips automatic default discovery. Build fingerprints, destination checks, rule compilation,
default-deny authorization and the pipeline-only release path remain required. No Firebase resources,
inventory data, application behavior, role grants or security rules change.

The new regression executes the real release-preparation script in an isolated directory with synthetic
configuration and uses the pinned CLI's Storage preparation code. Only network operations are replaced:
default discovery rejects with a synthetic 404 and cloud compilation is isolated. Both modern
`.firebasestorage.app` and legacy `.appspot.com` bucket cases failed at discovery before the fix and
passed after explicit targeting. The tests verify the selected rules file and bucket, including a bucket
name different from the project name. Existing release tests retain rejection of local builds,
mismatched destinations and changed fingerprints.

Actual deployment of this change remains pending its reviewed merge to `main` and a successful GitHub
production job. Do not run a local deployment or recreate Storage to work around this error.
