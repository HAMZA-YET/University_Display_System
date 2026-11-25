# Forgot Password and Vercel configuration — 2026-11-25

## Changes and preserved protections

The login link is now **Forgot Password?**. `/account-recovery` requests the registered email, then accepts the email verification code, new password and confirmation. It displays a generic acknowledgement for unknown/ineligible accounts, and returns to login after success. Existing-code completion remains available when sending is unavailable. The screen uses the team's shared components and login-width layout.

The code remains the existing cryptographically random 64-character hexadecimal token, not a new short numeric PIN. Users copy/paste it from the email. Keeping the existing format avoids weakening entropy or rewriting the proven token service. It is hashed in MongoDB, expires after 30 minutes, works once, preserves MFA and revokes old sessions on success. Existing IP limits, database recipient cooldown, bcrypt rules and transactional consumption remain. Password confirmation is checked in the UI and, when supplied, by the server. Legacy API clients without confirmation remain compatible; server password validation always applies.

Activation is separate at `/account-activation`; activation messages now point there. Only an authorized administrator can issue invitations. The invited user proves access using the private, single-use activation token; activation completion cannot require an existing login because invited accounts are not yet active. Previously issued activation tokens remain valid until their original expiry; administrators can direct recipients of older combined-page emails to /account-activation. Existing suspension and account-management routes are unchanged. No activation selector is shown in Forgot Password.

## Exact causes of the reported errors

The initial local branch contained the old local-only delivery adapter, which deliberately rejected production. Latest main (`a6aee17`) already includes a Resend HTTPS adapter. This branch reuses that implementation; it does not add a second provider or SMTP library.

On latest main, account messages are unavailable if ACCOUNT_DELIVERY is not correctly selected, required Resend configuration is missing/invalid, or CLIENT_ORIGIN is insecure in production. A standalone MongoDB also blocks account-security transactions. Provider rejection, authorization failure, network timeout or an invalid provider response fails closed and removes the failed-send token. The public capability flags describe configuration/transaction availability, not proof of successful inbox delivery.

`MFA encryption is not configured.` is raised when MFA_ENCRYPTION_KEY is absent or fails `/^[a-f0-9]{64}$/i`: exactly 64 hexadecimal characters encoding 32 random bytes. Spaces, line breaks, quote characters in the deployed value, base64, a normal password or an arbitrary 32-character string do not satisfy this requirement. No fallback or bypass is introduced.

These are source-confirmed error conditions with automated tests. The live Vercel project's private environment values and deployment version were not inspected, so no particular missing live value is claimed as independently verified.

## Rahul's production setup

1. Confirm the deployed branch contains the existing Resend adapter and, after review, this new recovery UI. Do not deploy as part of this local task.
2. In Resend, add a sending domain the team controls and complete the DNS records specified by its domain-verification screen. Wait until verified. A borrowed `vercel.app` domain is not your sender domain. Use an actual address on your verified domain; don't use the example address in source.
3. Create a Resend API key with sending access, preferably restricted to that domain. Store it privately. No SMTP host/port/password variables are used by this adapter.
4. In the Vercel project that runs the Express API, configure these **server-side** Environment Variables for **Production**. Configure Preview separately only if testing there is intended. Never use `VITE_` prefixes for secrets.

| Name | Exact requirement |
|---|---|
| ACCOUNT_DELIVERY | `resend` (lowercase). `local` is deliberately unavailable in production. |
| RESEND_API_KEY | The real private sending API key from Resend. No extra quotes/newlines/spaces. |
| ACCOUNT_MESSAGE_FROM | Bare sender email on the verified domain, for example `accounts@YOUR-OWN-DOMAIN`. This adapter does not accept `Name <email>` syntax. |
| CLIENT_ORIGIN | Exact public HTTPS website origin, such as `https://YOUR-PROJECT.vercel.app`, without a route/query/fragment. Used for token-free message links and browser-origin checks. |
| MFA_ENCRYPTION_KEY | Stable secret of 64 hex characters / 32 random bytes. Use the key that encrypted existing factors for this database. |
| MONGODB_URI | Existing Atlas/replica-set URI, kept private and unchanged. Legacy MONGO_URI is accepted and takes precedence if both are set. |
| JWT_SECRET | Preserve the existing server signing secret; do not reset it for this UI fix. |
| BCRYPT_ROUNDS | Keep the existing production value, at least 12. |

Production must run with NODE_ENV=production. REQUIRE_PRIVILEGED_MFA remains the team's coordinated rollout decision; do not disable it to work around missing encryption configuration. BACKUP_ENCRYPTION_KEY is separate and is not a replacement for MFA_ENCRYPTION_KEY.

For a brand-new environment with no MFA-enrolled users, generate cryptographic keys privately using the existing helper after preparing a private backend/.env from the example (only if that file does not already exist):

```powershell
node backend/scripts/security-setup.js
```

The helper generates missing keys in that ignored file without printing them and preserves existing nonempty values. Transfer the MFA value privately to Vercel and store a protected backup. Never paste it into chat, screenshots, Git or the frontend. Do not blindly generate a new production key when existing MFA factors exist: replacing the key cannot decrypt those factors. Recover the original key or arrange a reviewed migration. All deployments using the same user/factor database must use the same corresponding key.

5. Environment changes apply to a subsequent deployment. After Rahul approves publishing these changes, create a new deployment using the correct environment scope. No deployment, push or merge was performed by this task.
6. Check `/api/security/capabilities`: accountMessagesAvailable and accountCompletionAvailable should be true; deliveryChannel should be email. mfaEnrollmentAvailable additionally requires a valid MFA key. These checks must never return secret values.
7. With a synthetic registered active account and a controlled inbox, request a code. Check the Resend delivery status and the inbox/spam folder. Enter the complete code and matching passwords, reset, then verify new-password login, rejection of the old password, and rejection of code reuse. Verify existing MFA still applies. Unknown email requests must keep the same generic acknowledgement. Never attach the email/code to public evidence.
8. Test an administrator invitation independently: its link must open `/account-activation`, while Forgot Password must not offer activation. Verify a suspended account remains denied.

## Verification limits

Automated tests cover the UI journey, password confirmation, expiry/replay/suspension/session revocation through existing security suites, separate activation links, provider failure sanitization and MFA key requirements. Resend HTTP is mocked in provider tests; no real email was sent and no verified domain/API credential was provisioned. Real inbox delivery and deployed MFA configuration remain Rahul's acceptance checks. No manual browser verification is claimed.

Provider references checked on 2026-11-25:
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction)
- [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction)
- [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
