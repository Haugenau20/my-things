# GitHub tests and production deployment

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

## One-time Google setup, pending specific approval

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
workflow path, the `production` environment subject, and a push or manual-dispatch event. Forks, PRs,
other repositories, environments and branches are excluded. No private key is created. There is no
grant of project Owner/Editor, Auth administration, inventory document access, photo object access,
billing administration or IAM administration to the deployment account. Rules deployment itself is
privileged: merged workflow/code/rule changes control production authorization and must be reviewed.

Automatic approval review rejected execution because this specific persistent IAM setup was not
explicitly authorized. **None of these setup changes have been applied.** Obtain the owner's explicit
approval before running the setup script. It is a one-time script; if a command fails after partial
setup, inspect the resulting resources and resume the missing steps rather than blindly recreating
or deleting them. The workflow intentionally does not configure IAM, seed data, alter CORS/Auth/billing,
run restore/cleanup, or provision a database/bucket. The account has no database-creation permission.

Once Google setup is approved/applied and the three variables are added, merge the pipeline PR into
`main` to enable automatic deployment. This PR builds on the photo-upload fix PR; merge that PR first.

## Verification evidence

Eight production-configuration cases failed before the helper existed and then passed. Lint/formatting,
typechecking, actionlint 1.7.12 workflow validation and PowerShell parsing passed. The actionlint Windows
release ZIP was checked against its upstream published SHA-256 before execution. The cloud policy
command passed all nine synthetic cases with existing local CLI authentication after ADC support was
added. This is not a GitHub OIDC or service-account deployment test. Full repository and hosted runner
results will be recorded after completion. Actual GitHub production deployment remains pending Google
setup, GitHub variables and merge into `main`.
