# Member 1 integration and handoff

This branch adapts the original A01–A08 work to the shared application. It does not replace Member 2 publishing, Member 3 case logic, Member 4 pages, or the team's authentication. Original source project remains read-only. No production deployment is claimed.

## Architecture and migration

Express/CommonJS and Mongoose remain the backend. React uses the existing AuthProvider, Axios client and shared Input/Button/Alert components. Passwords remain bcrypt; cookies remain HttpOnly, SameSite=Strict, Secure in production. IDs and roles remain ADMIN, AUTHOR, REVIEWER and READER. There is no destructive migration and no account reseeding in this integration.

Only two User fields are added: activationPending (default false) and mfaEnabled (default false). Existing documents need no bulk update. Separate collections store hashed action tokens, encrypted MFA factors, revoked JWT digests, private evidence metadata, maintenance locks and job summaries. TTL indexes support expiration, but all token consumers also check expiry explicitly. Transactions require a replica set; no nontransactional fallback is used for account security.

JWTs now carry a random jti and, after MFA, an mfa=true claim. Existing valid JWTs continue working for unenrolled users. Ensure Mongoose unique/TTL index creation succeeds for the new collections. After enrollment, rolling back to a server that ignores MFA/revocation requires a coordinated security review; do not silently roll back the protection layer. Logout revokes that JWT until expiry and clears cookies; a different session is not revoked. Password recovery, MFA enrollment/recovery, suspension, role and department changes invalidate previous sessions through the existing tokenVersion. Recovery does not disable MFA.

Enrollment requires a password-authenticated session, current password, and an authenticator code. Once enrolled, login returns data.mfaRequired=true with a short-lived challenge cookie instead of an authenticated JWT. The updated login screen verifies a TOTP or one-use recovery code before navigation. TOTP steps and recovery codes cannot be reused; challenge attempts are atomically limited to five. Secret material never enters audit entries. Recovery codes appear once in the account security screen and must be stored privately.

## Setup

Use the root README's existing npm ci, MongoDB, seed and npm run dev commands. Do not seed over real users or replace existing JWT_SECRET. For new security functions:

1. Use a MongoDB replica set and an explicit application database in backend/.env. The team seed remains the source of synthetic role fixtures; this integration does not reset passwords.
2. Copy backend/.env.example only if no backend/.env exists. Preserve current private configuration.
3. Run: node backend/scripts/security-setup.js
4. Set ACCOUNT_DELIVERY=local for synthetic local development. Messages are written only to ignored backend/.local/messages. Open these files privately and paste the token into /account-recovery. No token is returned by the recovery request endpoint. Production delivery is disabled until an approved provider is integrated.
5. Enroll staff through /account-security and save recovery codes privately. REQUIRE_PRIVILEGED_MFA defaults to false for compatibility. Set it to true after coordinating rollout: staff role-authorized routes then deny unenrolled staff while allowing enrollment. Enrolled users always require MFA, regardless of this flag.
6. Run npm test and npm run build. The first Mongo test run downloads a binary; MONGOMS_SYSTEM_BINARY may point to an existing mongod executable. Test databases are disposable.

Environment names: MFA_ENCRYPTION_KEY and BACKUP_ENCRYPTION_KEY are independent 32-byte hexadecimal secrets; ACCOUNT_DELIVERY selects local delivery; REQUIRE_PRIVILEGED_MFA controls staff rollout; EVIDENCE_STORAGE_ROOT optionally changes the private root; EVIDENCE_MAX_BYTES defaults to 5 MiB and may only lower that cap; SECURITY_RETENTION_HOURS defaults to 168 (1–8760). Existing MongoDB/JWT/origin/storage variables retain their team meanings. Keep both encryption keys outside Git and separate from backups.

## Added API contract

All routes use existing data/error envelopes. JSON bodies reject unknown fields. New security and private-evidence mutations check the browser Origin against CLIENT_ORIGIN (same-port loopback aliases only in development); requests without Origin remain available to non-browser API clients. Security routes use no-store and a local per-process/IP limiter of 30 requests per 15 minutes. Existing auth limits remain.

| Method and path | Body / authorization | Result |
|---|---|---|
| PATCH /api/security/profile | name; signed-in user | Existing auth user view; only own name changes |
| POST /api/security/invitations | name, email, optional department; ADMIN | Invited READER; private activation message, no token in response |
| POST /api/security/activation/complete | token, password | completed=true; 24-hour single-use invitation |
| POST /api/security/recovery/request | email | Generic accepted=true for known/unknown eligible accounts |
| POST /api/security/recovery/complete | token, password | completed=true; 30-minute single-use reset, revokes old sessions |
| GET /api/security/mfa | Signed-in user | enabled boolean |
| POST /api/security/mfa/enroll | password; signed-in user | Private enrollment secret/URI, expires in 10 minutes |
| POST /api/security/mfa/confirm | code; signed-in user | One-time display of eight recovery codes, rotated JWT |
| POST /api/security/mfa/verify | code; challenge cookie | Existing auth user view and authenticated JWT |
| PATCH /api/users/:id/department | department code or null; ADMIN, not self | Existing user view; validates department and revokes sessions |
| GET /api/operations/status | ADMIN | Safe readiness flags and recent job states |
| POST /api/private-evidence/:caseId | One multipart file; authenticated and C authorization | Private file ID; never a public URL |
| GET /api/private-evidence/:caseId/:fileId | Authenticated and C authorization | Private attachment download |
| DELETE /api/private-evidence/:caseId/:fileId | Authenticated and C authorization | Logical deletion, immediate read denial |

Existing /api/auth, /api/users, /api/audit-logs and notice attachment paths retain their contracts for users not enrolled in MFA. Failed credentials and inactive accounts create LOGIN_FAILED; validation/rate-limit rejections are not covered by that event. Audit delivery remains best-effort, not tamper-evident or a guaranteed transactional ledger.

## Attachment and teammate boundaries

The existing notice gateway and notice visibility service continue to decide approved notice delivery. Its PDF/DOCX/JPEG/PNG support is not narrowed. Its existing format-signature checks are not full document parsing or malware scanning; stronger validation for those legacy formats requires B review.

New private evidence is isolated in a separate collection and directory. JPEG/PNG only; extension, MIME, decoder content, single frame, 16 megapixels, 5 MiB default, two active validations, 20 uploads/IP/15 minutes. Files use random opaque names, quarantine metadata, checksum verification and protected downloads. No Express static mount exists. Logical deletion denies reads; physical retention awaits C. This is image validation, not antivirus.

The application composition contract is createApp({ authorizeEvidence }). The callback receives { actor, caseId, action, attachment }, where action is upload/download/delete and attachment is null before intake. C must load the real case and current participation/department/lifecycle from its database and return literal true only for that action. Missing, false, nonboolean or throwing callbacks deny access, including ADMIN. It must not trust client ownership or department values. matchesDepartment(actor, trustedTarget) is a fail-closed helper for domain owners; it does not rewrite existing B/C permissions.

The staged member3-lost-found photo code authorizes listed item photos and reporter/admin viewing. It is not automatically a private claim-evidence permission adapter. Its code is not mounted or modified here. Private evidence remains unavailable in the default running app until C supplies a reviewed adapter. No invented case screen or public evidence URL is added.

## A01–A08 checklist

| Package | Integrated delivery | Status / remaining work |
|---|---|---|
| A01 requirements | Team role mapping, data boundaries, migration and API decisions in this guide | Documented; L/B/C contract approval pending |
| A02 backend skeleton | Existing Express/Mongoose, health, JWT identity, synthetic team seed retained | Existing implementation preserved; no new clean-machine acceptance |
| A03 accounts and permissions | Existing admin UI/roles/status, own profile UI, department update, JWT revocation, scope helper | Implemented locally; domain department policies remain owned by B/C |
| A04 privileged protection | Invitations, activation/recovery expiry and single use, encrypted TOTP, challenge limits, recovery codes, optional staff enforcement | Implemented/tested locally; all-staff enrollment/rollout and production mail deferred |
| A05 attachments | Strict private image gateway and default-deny C callback; existing notice delivery preserved | Partial: real C callback, domain retention and deeper legacy document validation pending |
| A06 operations | Audit hooks, restricted status, local delivery, dry-run cleanup, encrypted DB/file backup and verified empty-target restore | Local workflow implemented/tested; Blob-provider backup and independent lifecycle review pending |
| A07 verification | Automated existing-team regression and new adverse security tests | Owner evidence only; C independent T01/T02/T10 and B T15 pending |
| A08 handoff | Setup, migration, demonstration, operational/recovery guide and review checklist | Prepared; independent B/C clean setup, D/L submission review and actual presentation pending |

Do not describe the complete A01–A08 assignment as accepted. Local passing tests do not replace teammate acceptance. No independent review, production readiness, deployed migration or production restore is claimed.

## Five-minute demonstration and review

Use synthetic accounts only. Log in normally, open Account security, change display name, enroll MFA, log out, and log in through the code challenge. Show ADMIN user management and suspension; a suspended account must be denied. Read existing audit logs as ADMIN, then show a READER is denied. Show default private evidence denial without presenting real files. Demonstrate backup/restore only in a new test database and empty directory following OPERATIONS.md.

Rahul: review the two compatible User fields, JWT jti/mfa claims, logout revocation and staged MFA rollout. B: confirm notice behavior unchanged and independently repeat T15 using permitted files. C: implement/review evidence authorization, department scope, logical deletion and retention; independently verify T01/T02/T10. D/L: check navigation/design, clean setup and submission content. Do not merge until these pending decisions are understood.
