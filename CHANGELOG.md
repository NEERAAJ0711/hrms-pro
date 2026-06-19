# Changelog

## Phase-1 Critical Fixes (Security Hardening + DB Indexes)

Backward compatible. No UI changes, no business-logic changes, no table/column
structure changes, no `routes.ts` refactor. App continues to run via `tsx`.

### Summary

| Area | Change | Risk |
| --- | --- | --- |
| Secrets | Removed hardcoded JWT/Session secret fallbacks; fail-fast on missing env | App will refuse to start if `JWT_SECRET` / `SESSION_SECRET` are unset |
| AuthZ | Removed duplicate, weakly-protected automation resume route | None (secure route already handled the path) |
| Uploads | Added extension allow-list / dangerous-extension blocklist to file uploads | Low (existing valid file types remain accepted) |
| Performance | Added 19 recommended indexes on high-traffic columns | Low (indexes only, idempotent migration) |

---

### 1. Secrets — removed insecure hardcoded fallbacks (fail-fast)

**Files modified:**
- `server/jwt-auth.ts` — `JWT_SECRET` no longer falls back to the hardcoded
  `"hrms-jwt-secret-key-2026"`. The server now throws on startup if `JWT_SECRET`
  is not set.
- `server/index.ts` — session `secret` no longer falls back to the hardcoded
  `"hrms-dev-secret-key-2026"`. The server now throws on startup if
  `SESSION_SECRET` is not set.

**Why:** Hardcoded secret fallbacks meant tokens/sessions could be forged by
anyone who read the source. Failing fast guarantees the deployment uses a real
secret.

**Action required before deploy:** Ensure both environment variables are set in
**every** environment (local, VPS/production):
- `JWT_SECRET` — long random string (e.g. `openssl rand -hex 32`)
- `SESSION_SECRET` — long random string

> Note: changing these values invalidates existing JWTs (mobile clients must
> re-login) and existing web sessions (users must re-login). Keeping the same
> values as before preserves active sessions.

---

### 2. AuthZ — removed duplicate insecure automation resume route

**Files modified:**
- `server/routes.ts` — removed the duplicate
  `POST /api/automation/jobs/:id/resume` handler that was protected by
  `requireAuth` only (no admin role / no company-isolation check).

**Authoritative route retained:** the secure handler in
`server/epfo-esic-routes.ts` (registered earlier in `routes.ts`) enforces
`requireAuth` + admin roles + company isolation. Because it is registered
first, it always handled the request; the removed duplicate was dead/unsafe code.

**Why:** Two handlers for the same path is confusing and the weaker one could be
accidentally promoted. Resume still works through the secure route.

---

### 3. Uploads — secure Multer validation

**Files added:**
- `server/upload-security.ts` — central upload validation:
  - `DANGEROUS_EXTENSIONS` blocklist (executables/scripts: `.exe`, `.sh`,
    `.bat`, `.js`, `.php`, `.svg`, `.html`, `.dll`, `.apk`-adjacent script types,
    etc.) — rejected regardless of allow-list.
  - `makeFileFilter(allowList)` — accepts only allowed extensions
    (case-insensitive); rejections surface as HTTP `400` with a clear message.
  - Curated allow-lists: `DOCUMENT_EXTENSIONS`, `IMAGE_EXTENSIONS`,
    `DATA_EXTENSIONS`, `APK_EXTENSIONS`.

**Files modified:**
- `server/routes.ts`
  - `docUpload` → `DOCUMENT_EXTENSIONS` (`.pdf .jpg .jpeg .png .doc .docx`)
  - `upload` (memory, bulk/biometric imports) → `DATA_EXTENSIONS`
    (`.xlsx .xls .csv .txt .dat .tsv`)
  - `apkUpload` → `APK_EXTENSIONS` (`.apk`)
- `server/mobile-routes.ts`
  - `faceUpload` → `IMAGE_EXTENSIONS` (`.jpg .jpeg .png .webp`)

**Left unchanged (already filtered):** `companyAssetUpload` (logos/signatures)
and the ai-hr `kycUpload` already had their own filters.

**Why:** Previously uploads accepted any file type, allowing executables/scripts
to be stored on the server. Allow-lists were chosen to preserve every existing
valid upload flow (documents, Excel/CSV bulk imports, biometric ATTLOG/USERINFO
`.dat` files, APKs, face images) while rejecting dangerous types.

---

### 4. Database — recommended performance indexes

**Files modified:**
- `shared/schema.ts` — added `index(...)` definitions (no column or table
  structure changes) to high-traffic tables.

**Files added:**
- `migrations/008_add_recommended_indexes.sql` — idempotent
  `CREATE INDEX IF NOT EXISTS` statements mirroring the schema. Safe to run
  repeatedly and against the existing production database.

**Indexes added (19):**
- `employees`: `(company_id)`, `(company_id, status)`, `(user_id)`
- `attendance`: `(employee_id, date)`, `(company_id, date)`
- `leave_requests`: `(company_id)`, `(employee_id)`, `(status)`
- `salary_structures`: `(employee_id)`, `(company_id)`
- `payroll`: `(company_id, month, year)`, `(employee_id)`
- `biometric_punch_logs`: `(company_id, punch_date)`, `(employee_id)`
- `notifications`: `(user_id, is_read)`
- `automation_jobs`: `(company_id, job_type, status)`, `(job_type, status, completed_at)`
- `automation_logs`: `(job_id)`
- `esic_fetched_employees`: `(company_id)`

**How to apply (NOT applied to production automatically):**
- Manual SQL: `psql "$DATABASE_URL" -f migrations/008_add_recommended_indexes.sql`
- Or via schema sync: `npm run db:push`

> Applied and verified against the development database during this change.

---

### TypeScript validation

`tsc --noEmit` was run. The changes above introduce **no new** type errors.
Pre-existing errors unrelated to this work remain (e.g. `req.user` augmentation
in `server/ai-hr-routes.ts`, `server/kra-routes.ts`, the
`jwt.sign` `expiresIn` overload typing, and items in
`epfo-service.ts` / `esic-service.ts` / `storage.ts`). These predate Phase-1 and
were intentionally left untouched to keep the change scoped and backward
compatible. The app runs via `tsx`, which does not block on these.

---

### Risks & Rollback

**Risks:**
- The server now **refuses to start** without `JWT_SECRET` and `SESSION_SECRET`.
  Confirm both are set in production before deploying.
- File uploads now reject unknown/dangerous extensions with HTTP `400`. If a
  legitimate, previously-used extension is missing from an allow-list, add it to
  the relevant list in `server/upload-security.ts`.

**Rollback:**
- **Secrets:** revert `server/jwt-auth.ts` and `server/index.ts`
  (restores the previous fallback behavior — not recommended).
- **Resume route:** restore the removed handler in `server/routes.ts`.
- **Uploads:** remove the `fileFilter` options in `server/routes.ts` /
  `server/mobile-routes.ts` and delete `server/upload-security.ts`.
- **Indexes:** indexes are additive and safe to keep. To remove:
  `DROP INDEX IF EXISTS <index_name>;` for any of the names listed above, and
  revert the `index(...)` additions in `shared/schema.ts`.
