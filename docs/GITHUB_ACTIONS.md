# GitHub tests and production deployment

The owner requires pipeline-only production releases. Merge reviewed changes into `main`; successful
verification then deploys all tracked release components automatically. Never publish Hosting assets,
Firestore/Storage rules or indexes from a local CLI, console or agent session. Every new or changed
feature needs relevant demo-emulator coverage before merge. A failed check/deployment is fixed through
a PR; a rollback is a reviewed revert PR released by this same pipeline. Retrying the existing workflow
on `main` is permitted. Add any future deployable component to the reviewed workflow and its checks.
This release policy does not authorize IAM/billing/Auth/CORS changes, owner seeding, migrations or
destructive maintenance; those retain their separate explicit-authorization requirements.

The `Test and deploy` workflow runs on pull requests targeting `main`, pushes to `main`, and manual
dispatch. `Verify` installs the pinned mise toolchain and npm lockfile, installs Chromium, and runs
`npm run check`: lint, formatting, typechecking, unit, rules, SDK integration, browser tests and a local
build. Tests use only the isolated `demo-inventory` emulators and receive no Google credentials.

After successful verification of `main`, `Deploy production` builds for the explicit existing
`my-things-c7305` project / `main` inventory, checks the destination and configuration fingerprint,
prepares the production CSP, obtains Google credentials, evaluates synthetic cloud Storage policy
cases, then deploys Firestore rules/indexes, Storage rules and Hosting. PRs and other branches cannot
deploy. Production releases serialize and are not canceled partway through by a new commit.
Use **Actions → Test and deploy → Run workflow**, choosing `main`, to rerun after fixing configuration.

## GitHub configuration the owner adds

No GitHub secret is required. Use OIDC Workload Identity Federation through a dedicated deployment
service account instead of exporting a long-lived service-account key or Firebase login token.
[Google's authentication action](https://github.com/google-github-actions/auth) supports this approach;
the pinned Firebase CLI uses Application Default Credentials through `google-auth-library`.

In **Settings → Environments**, create `production`. Under its **Environment variables**, add these
three entries. Repository Actions variables with the same names also work, but the workflow still
uses the `production` environment. No required-reviewer gate is configured by this change. Restrict the
environment's allowed deployment branches to `main` if desired; the workflow and Google trust already
enforce that branch. Make `Verify` a required branch check to prevent merging failing changes.

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/388283732267/locations/global/workloadIdentityPools/github-my-things/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `github-deploy@my-things-c7305.iam.gserviceaccount.com` |
| `FIREBASE_WEB_CONFIG` | Public Firebase Web SDK configuration as JSON, shown below |

Copy values from Firebase Console → Project settings → Your apps → Web app. Supply the JSON object,
not the `const firebaseConfig =` assignment or initialization code. Quote all keys and string values:

```json
{
  "apiKey": "PASTE_PUBLIC_WEB_API_KEY",
  "authDomain": "my-things-c7305.firebaseapp.com",
  "projectId": "my-things-c7305",
  "storageBucket": "my-things-c7305.firebasestorage.app",
  "appId": "PASTE_WEB_APP_ID"
}
```

The public SDK API key is browser-visible and does not authorize administrative access. Additional
SDK fields such as `measurementId` and `messagingSenderId` are ignored; this does not enable Analytics.
Missing values, another project, demo settings, wrong Auth domain, malformed JSON or environment-file
injection fail before build/authentication/deployment. Private/admin credentials must never be put in
this variable. Generated environment and Google credential files are ignored and are not uploaded as
artifacts. GitHub automatically supplies the limited `GITHUB_TOKEN`; do not create a PAT for this job.

## One-time Google setup, applied

The reviewable [PowerShell setup script](../scripts/setup-github-oidc.ps1) targets the existing project
only. It enables IAM / IAM Credentials / Security Token Service / Resource Manager APIs, creates the
dedicated `github-deploy` service account and `github-my-things` identity pool with provider `github`,
and grants these product-specific roles:

- Firebase Hosting Admin: publish static Hosting releases.
- Firebase Rules Admin: evaluate and publish rule sources.
- Cloud Storage for Firebase Viewer: discover the existing bucket, without object access.
- Cloud Datastore Index Admin: deploy index definitions, without inventory document access.
- Service Usage Consumer: inspect/use the already-enabled deployment APIs.

The repository principal receives `roles/iam.workloadIdentityUser` on that service account. Trust
requires immutable repository ID `1413109191`, owner ID `106525925`, `refs/heads/main`, this exact
workflow path, the `production` environment subject, and a push or manual-dispatch event. The subject is
`repo:Haugenau20@106525925/my-things@1413109191:environment:production`, matching the repository's
GitHub OIDC settings (`use_default: true`, `use_immutable_subject: true`). Forks, PRs,
other repositories, environments and branches are excluded. No private key is created. There is no
grant of project Owner/Editor, Auth administration, inventory document access, photo object access,
billing administration or IAM administration to the deployment account. Rules deployment itself is
privileged: merged workflow/code/rule changes control production authorization and must be reviewed.

The owner explicitly approved this setup and the script completed on 2026-10-10. Read-back checks
confirmed the provider is active with the exact trust condition above, the service-account policy
contains only the repository's Workload Identity User binding, and the account has exactly the five
reviewed project roles. All four setup APIs are enabled and no user-managed service-account keys exist.
An earlier automatic approval rejection was resolved by that explicit approval before execution.
The initial setup used the legacy name-only subject. A read of the repository's OIDC settings exposed
that mismatch, and the provider condition was corrected to the exact immutable subject above on the
same day. All other trust restrictions and role grants were retained; the legacy subject would have
rejected deployment, rather than admitting a different repository. GitHub documents this default for
[new repositories](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).
Do not rerun the create commands on the existing resources. For future setup changes, inspect the
resources and apply only approved missing steps. The workflow does not configure IAM, seed data, alter CORS/Auth/billing,
run restore/cleanup, or provision a database/bucket. The account has no database-creation permission.

The three production environment variables are configured; no environment secrets are stored. PRs #10
and #11 are merged. The first main run passed verification, OIDC and synthetic policy checks but stopped
during automatic Storage bucket discovery; see [diagnosis and fix](PIPELINE_STORAGE_FIX.md). Release
preparation now explicitly binds Storage rules to the configured bucket using the CLI's bucket-array
format; it does not infer a bucket name or need default-bucket discovery. A successful `Deploy production`
job establishes a release, rather than a passed PR check or merge alone. Record its workflow URL and
deployed commit.

## Verification evidence

Eight production-configuration cases failed before the helper existed and then passed. Lint/formatting,
typechecking, actionlint 1.7.12 workflow validation and PowerShell parsing passed. The actionlint Windows
release ZIP was checked against its upstream published SHA-256 before execution. The cloud policy
command passed all nine synthetic cases with existing local CLI authentication after ADC support was
added. This is not a GitHub OIDC or service-account deployment test. Actual GitHub production deployment
is recorded separately in [pipeline Storage diagnosis](PIPELINE_STORAGE_FIX.md).

The first full local run passed lint/typechecking, 148 unit, 100 rules and 27 SDK tests, then stopped
before browser tests because an emulator health probe exceeded its two-second startup deadline.
A warming-service regression reproduced rejection before the fix and passed afterward. Readiness
probes now retry at most three times, with the same demo-only endpoints, two-second per-request
deadline and a 250 ms wait; persistently unavailable services still deny seeding. Full verification
was rerun for this change. No cloud fallback or safety-guard bypass was added.

The rerun of `mise exec -- npm run check` passed formatting/lint, TypeScript, 149 unit tests, 100 rules
tests, 27 SDK integration tests, 26 Chromium browser tests and the local build: **302 tests**. The
production build, explicit project/inventory deployment preflight and production release preparation
also passed; no CLI deployment was performed for this pipeline change. The existing large Firebase
bundle warning remains. `git diff --check` passed. GitHub's hosted `Verify` job separately exercises
the same command on Ubuntu. [Run 38081407326](https://github.com/Haugenau20/my-things/actions/runs/38081407326)
passed for implementation commit `0e5ee74`; subsequent documentation commits run verification again.
Consult [PR #11 checks](https://github.com/Haugenau20/my-things/pull/11/checks) for the current head result.
Production deployment is intentionally skipped on this PR.

The following GitHub run, `38081626580`, passed lint, typechecking, unit, rules and SDK checks, then
hit the restore browser assertion's five-second default while the 18-record restore was still
verifying destination records/photos. That completion assertion now waits at most 15 seconds; the
required completion state, data/photo checks, negative authorization cases and test failure behavior
are unchanged. This is an assertion deadline adjustment, not a test retry or skipped check.
The local browser rerun also exposed a phone-save assertion matching both the saved status and a
temporary metadata-loading status. It now selects the expected saved status explicitly, as the
other capture tests already do.
After both test corrections, `mise exec -- npm run test:e2e` passed all 26 browser cases;
`mise exec -- npm run lint`, `mise exec -- npm run typecheck` and `git diff --check` also passed.
