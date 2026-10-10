# Security design and operating boundaries

Status: M1 owner-policy rules are emulator-tested and deployed; this is not a complete production audit.
Validated capture drafts/finalization/discard and room creation are allowed for the bound owner. M2
metadata editing, workflow/trash transitions, rooms, and boxes now have constrained, emulator-tested owner
rules. Storage replacements remain closed. Required IAM/CORS and signed-out OAuth startup
are verified; owner login and separate-account rejection are owner-verified. Device capture and actual
photo-token behavior remain pending. See
[deployment evidence](M1_RELEASE.md). IAP, YubiKey integration, and custom WebAuthn are explicitly excluded.

Optional-photo capture also permits acknowledged ready records with no photos and tightly constrained
first-photo registration/completion/cancellation patches on photo-free saved items. Storage still checks
the inventory owner and exact pending photo metadata on the item. Ready-photo replacement remains
closed. See [optional-photo evidence](M1_OPTIONAL_PHOTOS.md). M2 partial metadata edits cannot modify
photo paths or state. Capture/move/owned-restore writes must increment an active destination's revision
in the same transaction. The application checks all current contents before archive and compares that
revision; rules cannot query collection-wide emptiness. Owner-only rules still deny foreign identities
regardless of whether their request otherwise has valid fields. See [M2 evidence](M2_ORGANIZE.md).

## 1. What is protected

Protect item/room/box metadata, estimated values, serial numbers, photo bytes and object listings, exports,
and the ability to change/delete them. A public static application shell, generic login page, project
identifier, and frontend code are acceptable. Never embed real inventory records in a static build.

Threats in scope: unauthenticated access, unrelated Google accounts, tampered client requests, public
photo links, accidental broad rules, cross-environment mistakes, malicious imports, XSS through notes,
and accidental/destructive edits. The design does not protect against a compromised owner Google account,
compromised device/browser, malicious project administrator, or copies already downloaded by the owner.
No end-to-end encryption is claimed. Protect devices and independent backups separately.

## 2. Authentication and owner bootstrap

Enable Google sign-in only initially. The Google/Firebase user UID is the identity key, not an email
string. The owner now requires rejection during authentication as well as inventory authorization.
After verified owner bootstrap, keep only the owner in the production Auth user set and set
`client.permissions.disabledUserSignup` and `disabledUserDeletion` to true. New Google users then
cannot create an account; the existing owner can still sign in. Administrative account creation remains
a trusted operation: do not add another active account without an owner-approved policy change.
[Firebase user restrictions](https://firebase.google.com/docs/auth/users),
[managed permission fields](https://cloud.google.com/identity-platform/docs/reference/rest/v2/Config#Permissions).
The current project accepts these settings without an Identity Platform upgrade or blocking function.
Verify owner reauthentication and an unrelated Google account on the actual deployed site.

Backend rules must independently deny any unrelated authenticated UID, including administrator-created
or synthetic test users. Disabling public signup does not replace owner-based Firestore/Storage rules.

Bootstrap sequence:

1. Deploy default-deny rules and a minimal sign-in shell to the owner's cloud project only when authorized.
2. Sign in as the intended owner. No inventory access is granted yet. Obtain the exact Firebase UID from
   the project's Authentication user list; do not infer it from a Google account ID.
3. As project administrator, create `/inventories/main` in the Firebase console using the documented
   inventory-root fields and that UID. This is a trusted administrative action.
4. Close end-user signup/deletion once the verified owner account exists. Verify it is the only active
   production Auth user; verify subsequent owner login and rejection of an unrelated Google account.
5. Deploy the reviewed owner-based rules and verify both positive and negative access tests. A missing
   root, missing owner field, or incorrect UID must deny access, not trigger automatic ownership claiming.
6. Verify the production project and UID explicitly. If another project is ever authorized, bootstrap
   it independently; do not assume the same UID or reuse authorization from an export.

Client creation/deletion of inventory roots is denied. Root updates are limited to display name,
default currency, and update timestamp. `ownerUid` is immutable to clients. A future account change is
an administrative recovery operation, not a public signup feature.

## 3. Firestore authorization contract

Only the owner of the inventory root can read its settings or read/write the allowed child collections.
Deny unrelated paths and root-collection enumeration. Never use an unrestricted recursive wildcard that
accidentally permits ownership changes. Test direct `get`, `list`, create, update, and delete separately.

Allow only known fields and supported schemas. Validate lengths, types, enums, location shape, revision
progression, immutable creation metadata, and permitted deletion/state transitions where feasible. For
rooms/boxes, ordinary client deletion is unnecessary; archive them. Unknown accounts may not create an
inventory or plant an owner document.

Rules can check identity and other documents, and constrain allowed updates. Lists/maps need deliberate
validation; a list type alone does not validate every element. Keep runtime schema checks as well and do
not claim complete nested validation from a superficial rules check.
[References S04](REFERENCES.md#s04), [S15](REFERENCES.md#s15).

## 4. Storage authorization contract

Permit only the documented inventory photo namespace. Check `request.auth.uid` against the owner UID in
the inventory root, using Firestore access from Storage rules. Deny missing inventory policies. Apply
owner checks to reads, metadata reads, writes, deletion, and path-scoped listings; listing permissions
must not expose other inventory namespaces.

Constrain uploaded file names, JPEG content type, and size according to the photo specification. Treat
an absent custom-metadata map as equivalent to an empty map; cloud requests may omit it. Unexpected
custom metadata remains denied. See [photo upload investigation](PHOTO_UPLOAD_FIX.md) for cloud
Rules API regression evidence and the separate provider-generated token audit limitation.
Handle object deletion in its own rule branch: a delete has no incoming file whose size/content type can be
validated. Wrong paths, unexpected variants, HTML/SVG uploads, and oversized files must fail.

Firestore-dependent Storage rules require cross-service permission setup. Confirm the documented service
integration when deploying, and test it in the owner's cloud project when authorized. Emulator success alone does
not verify that IAM integration. Monitor both services' usage after deploying the integration.
[References S05](REFERENCES.md#s05).

The inventory policy is the security authority. Item/filename guessing is not a defense. Rules should
reject foreign inventory paths even when their IDs are known.

## 5. Private photo delivery

Store object paths, not permanent download URLs. Use authenticated SDK blob downloads and temporary local
object URLs for display. Firebase documents direct downloads with Security Rules control and the need
for CORS configuration. [References S06](REFERENCES.md#s06).

Configure exact development/production origins and required methods, not a reflexive wildcard. CORS is
browser interoperability, not authorization. A non-browser request must still need authorized identity.
Do not add `allUsers`/public bucket permissions. Do not expose download tokens in records, exports, logs,
or links. If token-bearing URLs are ever created/exposed, review and revoke their tokens as appropriate;
simply putting a login screen in front of the gallery does not revoke an already shared capability.

Use private/no-store cache metadata for photo delivery where supported. Keep app-managed photo caches in
memory, bounded in size, and keyed by account/environment. Revoke object URLs on eviction, item removal,
and sign-out. Clear metadata, selections, forms, and image caches on sign-out; communicate sign-out to
other open same-origin app tabs. Do not promise to erase screenshots, downloaded backups, or all possible
browser/OS remnants.

## 6. Frontend, configuration, and credentials

Render user text as text. No raw HTML rendering of notes, names, or imports. Build a Content Security
Policy for the actual Firebase/OAuth endpoints, allow required auth frames, and test before enforcement.
Set an anti-framing policy for the app, `X-Content-Type-Options: nosniff`, and a restrictive referrer policy.
Do not weaken OAuth or CSP wholesale to fix one browser issue.

Do not add analytics, third-party error capture, or session replay by default. Sanitize errors; never log
access tokens, item photos, or full exports. Test reports and screenshots use synthetic data only.

Firebase web API keys identify projects rather than grant admin access; Security Rules remain essential.
Service-account credentials are different and must never be shipped. All `VITE_` configuration is
browser-visible. [References S10](REFERENCES.md#s10), [S17](REFERENCES.md#s17).

## 7. Operational safety and recovery

The [GitHub pipeline](GITHUB_ACTIONS.md) obtains short-lived deployment credentials only in its
post-test production job on `main`. One-time cloud federation setup requires explicit approval;
its trust binds immutable repository/owner IDs, branch, workflow and production environment. Tests
receive no cloud credentials. The deployment account has product-specific release roles and no
inventory document/photo-object permissions; it can publish rules, so merged changes remain trusted
administrative actions. Never place its credentials in `VITE_` settings or build/test artifacts.

Use `demo-inventory` emulators for normal development and every automated test, with fail-closed local
configuration. The owner chose one production cloud project; device smoke tests there require explicit
authorization and disposable samples. Review a production diff,
including rules/indexes/Hosting settings, before explicit deployment. Keep tests and migrations away
from real data. Exports are private files; keep an independent copy outside the Firebase project and
outside this repository. Do not rely on that same application as the only source of account recovery.

If exposure is suspected, first restrict the affected backend access and inspect IAM/rules/token links;
do not merely hide a frontend route. Rotate actual leaked credentials when applicable, assess which
records/photos were accessible, and restore only after the cause is understood. An API key appearing in
a frontend bundle is not by itself evidence of an admin credential leak.

Required security evidence is enumerated in [Test plan](TEST_PLAN.md). App Check may be evaluated later
as abuse protection; it is not an initial dependency or a substitute for these controls.

Permanent deletion remains owner-only. Rules permit the narrow ready-trash-to-deleting patch and final
marker deletion, retain immutable photo metadata, and reject a marker with pending photos. They cannot
prove cross-service file cleanup; the application deletes recognized exact-prefix objects, verifies the
prefix is empty, and removes the record last. Unknown paths block cleanup. A direct owner bypassing the
application can still delete valid Storage objects or a marked record; this is an integrity boundary,
not authorization for unrelated accounts.

Orphan inspection is an explicit read-only owner preview. All item states supply references; recent
unreferenced files are skipped, unknown paths/metadata are flagged, and changed item IDs/revisions
invalidate the result. Listing is bounded and canceled/failed scans do not report completeness. There
is no automatic orphan cleanup or deletion action. A preview is not a backup or an atomic snapshot.

Restore retains the destination's administratively seeded owner binding. Reports/claims inherit that
same check; anonymous and unrelated users cannot read/write them. Historical creation requires an
active owner report and paired absent-target claim. Ordinary creation times remain immutable.
Unfinished reports freeze ordinary Firestore mutations; only pending claimed items may attach fully
validated photos and finalize cover/trash history. Report identity/counts and claim source hashes are
immutable during recovery. No new cloud service or imported authorization authority is introduced.

Transactions use projected `getAfter`/`existsAfter` state to pair counters, claims and records;
see [Firestore Rules reference](https://firebase.google.com/docs/reference/rules/rules.firestore).
Rules cannot prove collection-wide emptiness, all claim counts, archive SHA-256 or Storage existence.
The application inspects emptiness before locking, reinspects after locking, compares every existing
record with this operation's claims and verifies all private files before completion. An authorized
owner bypassing the app can violate bookkeeping or delete valid files; this is an integrity boundary,
never access for others. Unexpected or changed data blocks recovery without overwrites/deletion.
Refresh old app tabs before import: rules block their writes, but older export clients do not understand
restore reports. Deploying the report collection does not migrate or rewrite existing records.
