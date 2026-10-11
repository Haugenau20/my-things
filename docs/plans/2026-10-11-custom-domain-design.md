# Custom domain: things.muninn.quest

The owner selected `things.muninn.quest` on 2026-10-11. Porkbun manages the domain and DNS.
Work proceeds one verified chunk at a time. This document records the design and later setup gates;
it does not claim that DNS, HTTPS, OAuth, CORS or production activation are complete.

## Design and first chunk

Attach the chosen hostname to the existing Firebase Hosting site in the existing production project.
Keep Firestore, Storage, the trusted inventory root and the Auth account in place. The main
`muninn.quest` website continues with its existing host and routing records.

The first chunk prepares a PR that accepts only the selected hostname or the configured project's
`firebaseapp.com` hostname. CI still checks the explicit production destination; release preparation
still checks the built configuration fingerprint and target. The current production configuration
continues to select the Firebase hostname until the separate activation chunk.

Use the selected app hostname as `authDomain` so Google redirect sign-in and its helper share an
origin. Preserve the existing app-origin check and same-origin auth-frame CSP. Generate exact-origin
GET/HEAD CORS for the selected hostname; preparation never applies bucket settings. The workflow's
environment link follows the configured hostname. Add `noindex` to the public shell; this requests
search exclusion and does not provide authorization or hide certificate-transparency records.

## Later chunks, completed separately with the owner

1. After reviewing/merging the preparation PR, connect only `things.muninn.quest` to the existing
   Firebase Hosting site. Copy the exact DNS records from its domain wizard into Porkbun and verify
   HTTPS. Add an ownership TXT record if requested, without replacing unrelated TXT records.
   Preserve the apex/`www` routing, email records and nameservers. Do not deploy through the console.
2. Authorize the hostname in Firebase Authentication and register
   `https://things.muninn.quest/__/auth/handler` in the existing Google OAuth client. Inspect any
   existing Web API-key referrer restrictions for the new origin. Keep owner-only signup/access policy.
3. Review and apply the existing bucket's exact-origin CORS for the new HTTPS origin, retaining the
   old origin during the transition if needed. No wildcard, IAM, billing or data changes are required.
4. Finish pending saves/exports and close old app tabs before switching origins; drafts and queued
   source files are memory-only. Change only `authDomain` in the production `FIREBASE_WEB_CONFIG`
   variable and any ignored production environment file. Release through GitHub Actions on `main`.
   The new origin requires a fresh owner sign-in. The old address's sign-in action directs the owner
   to the configured hostname; there is no automatic redirect or cross-origin session sharing.
5. Record the deployed commit/workflow, verify the root website still works, then check owner login,
   unrelated-account rejection, photo upload/gallery, interrupted-upload recovery and checksum-verified
   photo export on actual Windows/iPhone browsers using separately authorized disposable samples.

Provisioning/Auth/CORS changes and merge remain separate owner actions/authorizations. A rollback
selects the former auth domain, retains its OAuth/CORS prerequisites and reruns the reviewed pipeline;
code rollback uses a reviewed revert PR. Neither path changes inventory data or ownership.

## Verification

Tests exercise accepted/rejected CI domains, production target/fingerprint guards and generated
Hosting/Storage/CORS settings with synthetic configuration only. The browser shell check uses the
complete `demo-inventory` emulator stack; the complete `npm run check` remains the pre-merge gate.
Emulators cannot establish Porkbun DNS, certificate issuance, real Google OAuth or production CORS.

Preparation evidence on 2026-10-11: `mise exec -- npm run lint`, `mise exec -- npm run typecheck`,
`mise exec -- npm run test` (213 unit tests), `mise exec -- npm run build`, actionlint 1.7.12 and
`git diff --check` passed. The 26 focused CI/release cases passed after reproducing rejection of the
selected hostname and the absent workflow-origin output before their changes. The build retains
the existing large-chunk warning. Local `npm run check` stopped at rules-emulator startup because
another project's session occupies the required ports; the focused shell browser run stopped for
the same reason. Rules, SDK and browser execution remain pending locally. The owner requested
waiting for that session rather than stopping it. No production configuration or cloud data changed.

Sources: [Firebase custom domains](https://firebase.google.com/docs/hosting/custom-domain),
[same-origin redirect sign-in](https://firebase.google.com/docs/auth/web/redirect-best-practices),
[search exclusion](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
