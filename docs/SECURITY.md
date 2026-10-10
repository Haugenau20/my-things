# Security design and operating boundaries

Status: authorization requirements with initial M0 emulator-tested rules, not a production audit.
M0 allows owner reads, validated root settings updates, and constrained Storage operations. Child writes
and Storage updates remain closed until feature-specific validation is implemented. Cloud IAM, CORS,
OAuth, and token behavior have not been verified. IAP, YubiKey integration, and custom WebAuthn are
explicitly excluded. This design does not require those systems to protect inventory data.

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
string. An unrelated user may successfully authenticate but must receive no inventory authorization.

Bootstrap sequence:

1. Deploy default-deny rules and a minimal sign-in shell to the cloud development project.
2. Sign in as the intended owner. No inventory access is granted yet. Obtain the exact Firebase UID from
   the project's Authentication user list; do not infer it from a Google account ID.
3. As project administrator, create `/inventories/main` in the Firebase console using the documented
   inventory-root fields and that UID. This is a trusted administrative action.
4. Deploy the reviewed owner-based rules and verify both positive and negative access tests. A missing
   root, missing owner field, or incorrect UID must deny access, not trigger automatic ownership claiming.
5. Repeat independently for production; UIDs and configuration must be checked per project.

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

Constrain uploaded file names, JPEG content type, and size according to the photo specification. Handle
object deletion in its own rule branch: a delete has no incoming file whose size/content type can be
validated. Wrong paths, unexpected variants, HTML/SVG uploads, and oversized files must fail.

Firestore-dependent Storage rules require cross-service permission setup. Confirm the documented service
integration when deploying, and test it in the cloud development project. Emulator success alone does
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

Use a separate development project and fail-closed local configuration. Review a production diff,
including rules/indexes/Hosting settings, before explicit deployment. Keep tests and migrations away
from real data. Exports are private files; keep an independent copy outside the Firebase project and
outside this repository. Do not rely on that same application as the only source of account recovery.

If exposure is suspected, first restrict the affected backend access and inspect IAM/rules/token links;
do not merely hide a frontend route. Rotate actual leaked credentials when applicable, assess which
records/photos were accessible, and restore only after the cause is understood. An API key appearing in
a frontend bundle is not by itself evidence of an admin credential leak.

Required security evidence is enumerated in [Test plan](TEST_PLAN.md). App Check may be evaluated later
as abuse protection; it is not an initial dependency or a substitute for these controls.
