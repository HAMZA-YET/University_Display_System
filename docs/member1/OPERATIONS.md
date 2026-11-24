# Local operations and recovery

These commands are for small local development databases and private local files. Stop ALL API processes, scheduled jobs, seed commands and teammate writers first. Leave MongoDB running. `--confirm-stopped` is an operator assertion, not proof that external writers stopped. The maintenance lock rejects new API requests but does not drain an already-running request or control unrelated tools.

From the repository root:

```powershell
npm run security:ops -w backend -- cleanup --confirm-stopped
npm run security:ops -w backend -- cleanup --apply --confirm-stopped
npm run security:ops -w backend -- backup --confirm-stopped
```

Cleanup defaults to dry-run. It reports expired action tokens, abandoned quarantine, missing/corrupt private evidence and orphan filenames. Apply removes expired tokens and marks old quarantined metadata DELETED. It never deletes accepted evidence, notices, users, audit logs or physical files. C must approve physical retention and orphan removal. Missing/corrupt evidence already fails protected downloads. Local message-file expiry cleanup is deferred: messages contain private codes, so keep the ignored directory private and remove expired messages through a reviewed local procedure.

Backup creates a new encrypted `.uids-backup` in `backend/.local/backups`, without overwriting an existing file. It bundles BSON documents/indexes, valid private evidence and valid local notice attachments. Action tokens, JWT revocations and maintenance/job metadata are omitted. MFA factors stay encrypted inside the encrypted backup. Keep MFA_ENCRYPTION_KEY and BACKUP_ENCRYPTION_KEY separately and privately; neither is added to the bundle. Files are immutable during this offline process. A successful backup reports restoreVerified=false until a restore actually occurs.

Limits: 64 MiB of document/file payload, memory-buffered archive, local storage only. Vercel Blob notice attachments or claim evidence cause backup to refuse: a provider-coordinated export/restore is not implemented. This prevents a misleading archive whose restored metadata would still point at an old private cloud store. This is not a live/distributed production backup tool. Never run it while other writers are active.

## Nondestructive restore

Use a DIFFERENT database name and a NEW EMPTY file directory, separate from source storage. Never restore over existing users or files. The source DB remains connected only to validate separation; it is not replaced.

```powershell
npm run security:ops -w backend -- restore --file "C:\PRIVATE\YOUR-FILE.uids-backup" --target-uri "mongodb://127.0.0.1:27017/uids_restore_review?replicaSet=rs0" --target-files "C:\PRIVATE\uids-restore-review" --confirm-stopped --confirm-empty-restore
```

Restore authenticates the encrypted archive before writing. It restores BSON/indexes and files, compares documents and file hashes, increments every user's tokenVersion, leaves action tokens absent and demotes pending quarantined evidence. Invalid keys/corruption refuse restoration. Nonempty target DB/files refuse restoration. Failure leaves a locked incomplete target; retain it for diagnosis and use a different new target. There is no overwrite or automatic delete mode.

Even a verified restore remains locked with RESTORE_REVIEW_REQUIRED. This prevents restored content becoming available before domain review. B/C must inspect withdrawn/deleted notices and case lifecycle at the backup point and reconcile later deletions; an older backup cannot know future deletions. Do not start the server or status-sync job against an unreviewed target.

After a successful independent review, deliberately configure a separate restored checkout:

- MONGO_URI points to the restored database.
- UPLOAD_DIR points to the restore directory's `notices` subdirectory.
- EVIDENCE_STORAGE_ROOT points to its `evidence` subdirectory.
- The original MFA key and backup key are supplied privately.
- C's authorization callback must still be configured; restoring bytes never grants access.

Then, with ALL writers still stopped, run from that restored checkout:

```powershell
npm run security:ops -w backend -- release-reviewed-restore --confirm-stopped --confirm-domain-review
```

This only releases a successfully verified, nonfailed restore. It is not a command for bypassing a failed restore. Crash-stale source maintenance locks do not expire automatically: inspect all writers and job state before a separately reviewed operator repair; no unsafe automatic unlock is provided.

## Diagnostics and acceptance

GET /api/operations/status is ADMIN-only and returns database-ready/configured booleans and recent job state, without keys, URIs, paths or message bodies. Existing audit viewing remains ADMIN-only. Resend delivery can run in production after private provider/sender setup; local file delivery remains development-only. Private evidence can run on Vercel through the existing private Blob connection. Cloud backup/export remains unsupported, and the diagnostics explicitly report this limitation. Configured booleans do not imply a successful provider delivery or restore rehearsal.

Automated tests exercise a real service-level encrypted restore into a disposable MongoDB database and temporary file directory. They do not establish independent B T15 approval, a production rehearsal, host ACL/cloud-sync privacy, or a live backup guarantee. The CLI confirmation guards and setup utility have separate tests; do not confuse a syntax check with an operational restore.

Review sign-off: B T15 __pending__; C private lifecycle/retention __pending__; Rahul/L integration __pending__.
