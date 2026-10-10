# Technical references

Checked against official documentation on 2026-10-10. These sources support platform facts, not the
project-specific defaults invented by this pack. Recheck pricing, SDK/CLI compatibility, and console setup
at implementation time. No vendor code samples are copied into this pack as production-ready rules.

<a id="s01"></a>
## S01 - Storage billing, bucket naming, and US allowances

[Firebase: default bucket and billing changes](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

Supports the Blaze requirement, current default-bucket naming, and eligible US locations. Do not treat
storage capacity allowances as a guarantee that every operation/download is free.

<a id="s02"></a>
## S02 - Billing alerts and spending controls

[Firebase: avoid surprise bills](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills)

Supports the distinction between alerts and supported service-specific spending caps.

<a id="s03"></a>
## S03 - Static Hosting and deployment

[Firebase Hosting: get started](https://firebase.google.com/docs/hosting/quickstart)

Supports the static build/SPA approach, provided hosting domains, and explicit deployment components.

<a id="s04"></a>
## S04 - Firestore authorization

[Firestore: writing Security Rules conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)

Supports identity/document-based authorization and the need to align queries with rules.

<a id="s05"></a>
## S05 - Storage rules and Firestore integration

[Storage: Security Rules conditions](https://firebase.google.com/docs/storage/security/rules-conditions)

Supports private paths, metadata validation, and Firestore-dependent rules with cross-service permissions.

<a id="s06"></a>
## S06 - Authenticated photo download and CORS

[Storage: download files on the web](https://firebase.google.com/docs/storage/web/download-files)

Supports direct SDK blob downloads and the bucket CORS requirement.

<a id="s07"></a>
## S07 - Emulator isolation and runtime

[Firebase: connect to the Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore)

Supports demo-project isolation, the risk of live resources with real project IDs, and emulator runtime
notes. Pin compatible tooling during scaffolding.

<a id="s08"></a>
## S08 - Google sign-in and browser redirects

[Firebase: Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)

[Firebase: redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices)

Supports provider setup and supported redirect approaches on browsers that restrict third-party storage.

<a id="s09"></a>
## S09 - Authentication persistence

[Firebase: authentication state persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence)

Supports explicit session/local persistence and its distinction from Firestore offline data caching.

<a id="s10"></a>
## S10 - Firebase API keys

[Firebase: understand and manage API keys](https://firebase.google.com/docs/projects/api-keys)

Supports the distinction between web project configuration and authorization/admin credentials.

<a id="s11"></a>
## S11 - Firestore transactions

[Firestore: transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions)

Supports atomic record updates within Firestore, not a transaction spanning photo storage.

<a id="s12"></a>
## S12 - Database locations

[Firestore: locations](https://firebase.google.com/docs/firestore/locations)

Supports choosing a database location deliberately before creation.

<a id="s13"></a>
## S13 - Photo uploads

[Storage: upload files on the web](https://firebase.google.com/docs/storage/web/upload-files)

Supports resumable upload/progress/error APIs; browser lifecycle recovery still needs application design.

<a id="s14"></a>
## S14 - Security Rules testing

[Firebase: build rules unit tests](https://firebase.google.com/docs/rules/unit-tests)

Supports emulator-based positive and negative authorization tests.

<a id="s15"></a>
## S15 - Field validation in rules

[Firestore: control access to fields](https://firebase.google.com/docs/firestore/security/rules-fields)

Supports field allowlists/immutability checks and explains limitations of container-type validation.

<a id="s16"></a>
## S16 - Browser camera input

[MDN: HTML capture attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)

Supports treating camera selection as browser/device-dependent behavior.

<a id="s17"></a>
## S17 - Frontend environment values

[Vite: environment variables and modes](https://vite.dev/guide/env-and-mode)

Supports treating exposed Vite variables as browser-visible configuration rather than secret storage.

<a id="s18"></a>
## S18 - Cloud Storage deletion semantics

[Google Cloud Storage: soft delete](https://docs.cloud.google.com/storage/docs/soft-delete)

Supports checking retention and storage charges separately from application-level live-object deletion.
