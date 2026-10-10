# M1 setup checkpoint

Date: 2026-10-10. M1 capture, cloud SDK initialization, and Google redirect sign-in are now implemented
and deployed after owner authorization. Owner/device acceptance remains pending; see
[deployment evidence](M1_RELEASE.md) and [M1 evidence and release steps](M1_CAPTURE.md).
Hosting/rules/indexes are deployed, required IAM/CORS are applied, and the trusted inventory root is
bound to the owner-supplied verified Auth UID. End-user signup/deletion are disabled with only the owner
Auth account present. No production items/photos, billing change, or additional cloud service was created.

## Owner decisions and supplied settings

- Use the existing Firebase project as the single production cloud project. Do not require a second
  cloud project. Local development and every automated test use synthetic `demo-inventory` emulators.
- The owner supplied the Web configuration. It is saved in ignored `.env.production.local` with an
  explicit matching production destination. `.env.development.local` has blank optional settings.
- Blaze, Google sign-in, and Storage are enabled according to the owner. These statements are not a
  completed billing, OAuth, IAM, rules, or CORS audit.
- App Check was considered and explicitly deferred. The generated Analytics snippet is not included
  in the application; Analytics is not initialized.

## Read-only cloud checks actually run

- `firebase apps:list WEB --project <owner-project> --json`: no Web app existed at the initial check;
  the owner subsequently registered one and supplied its configuration.
- `firebase hosting:sites:list --project <owner-project> --json`: a default Hosting site exists.
  This does not establish that any application release is deployed.
- `firebase firestore:databases:list --project <owner-project> --json`: the latest check confirmed
  Standard edition, Native mode, database `(default)`, and European multi-region `eur3`.
- `gcloud storage buckets describe gs://<owner-bucket> --project=<owner-project>` with selected JSON
  fields: the existing bucket is in `US-EAST1`. It is retained; no region migration is requested.
- Subsequent read-only project IAM and bucket policy checks found the Storage-to-Firestore rules
  service-agent grant absent, no configured CORS entry, seven-day soft-delete retention, inherited
  public access prevention, and uniform bucket-level access disabled. No bucket IAM binding included
  `allUsers` or `allAuthenticatedUsers`; object ACLs and token capabilities were not audited.

Production project IDs, bucket names, and Web configuration are deliberately absent from this tracked
checkpoint. CLI output/logs and local environment files remain ignored.

## Historical M0 production-only build guard check

The owner decision supersedes the initial two-cloud-project default. A production build needs its
explicit matching production destination without a development ID. A configured development ID must
still be valid and different, and development builds cannot implicitly use the production destination.
Demo-only privileged local tooling and exact deployment destination checks are unchanged.

The two new production-only positive regression cases failed against the original guard and passed
after the update. All 23 safety unit tests passed. Final checks actually run for this setup adjustment:

- `mise exec -- npm run lint`: ESLint and Prettier passed.
- `mise exec -- npm run typecheck`: strict TypeScript passed.
- `mise exec -- npm run test`: all 63 unit tests passed, using synthetic fixtures only.
- `mise exec -- npm run build:prod`: the production static shell build passed without connecting the
  browser SDK to cloud services. It is not an operational M1 app.
- `mise exec -- npm run deploy:check -- production <owner-project> main`: matched the production build;
  validation only, no deployment.
- `mise exec -- npm run build`: the local emulator shell build passed.
- The same production deployment preflight then rejected the local build, as required (exit 1).
- `git diff --check` passed; `git check-ignore` confirmed both real/local cloud environment files are ignored.

The existing Vite 527.56 kB chunk warning remains. Rules, SDK integration, and browser suites were not
rerun for this build-guard-only change; their original M0 evidence remains in
[M0 foundation](M0_FOUNDATION.md). No cloud rule, OAuth, CORS, IAM, camera, or backup/restore test is claimed.

## Remaining manual and implementation work

- Capture/gallery/recovery and feature-specific owner rules are deployed; complete the actual device gate.
- Google provider and canonical authorized domain are verified. Signed-out Google redirect reaches
  Google's account page without observed browser errors; completed sign-in still requires the owner.
- Exact-origin CORS and `roles/firebaserules.firestoreServiceAgent` for the existing Firebase Storage
  service agent are applied and verified. Anonymous cloud read/list probes returned 403. Owner and
  unrelated signed-in account checks remain pending. See [deployment evidence](M1_RELEASE.md).
- Trusted owner bootstrap completed after first sign-in and owner-supplied verified UID. Auth lookup
  and root read-back verified the binding. Browser clients remain unable to create or claim a root.
- End-user signup/deletion restrictions are applied without changing the provider or upgrading Auth.
  The owner verified reauthentication reaches Capture and a separate Google account is rejected.
  A subsequent Auth user-list read confirmed only the owner account exists.
- Verify the actual cloud rules, bucket policies, billing alerts, and device behavior. The differently
  located services require real cloud access/latency checks; emulator results do not establish those.
- Obtain the actual iPhone/iOS and Windows browser details, then run camera/library, readability, reload,
  and interrupted-save checks using disposable samples.
- Preserve M3's backup gate: an empty isolated, administrator-authorized verification inventory is the
  destination for real cloud restore proof. This is a temporary recovery test destination in the same
  cloud project, not a second cloud project or public sharing feature. Its creation requires explicit
  authorization, and no restore may overwrite the main inventory. Do not rely on the app as the main
  inventory before M3 recovery and export/restore gates pass.
