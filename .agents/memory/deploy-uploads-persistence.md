---
name: Deploy wipes user uploads
description: Why uploaded files 404 on the VPS after a deploy, and how uploads are kept persistent
---

# VPS deploy used to destroy all user-uploaded files

The Hostinger deploy (`.github/workflows/deploy-hostinger.yml`) replaces the whole
app dir: it `mv`s `$HOME/hrms-app` to a timestamped backup, extracts a fresh build
(tarball contains only `dist/`, `package.json`, `migrations/`, `scripts/`), then
purges old backups. `uploads/` is gitignored and NOT in the tarball.

**Result (the bug):** every deploy permanently deleted everything under `uploads/`
— KYC docs, `company-assets/`, `employee-docs/`, `automation-screenshots/`. DB rows
still referenced the files, so the web served the SPA 404 (express.static fell
through to the catch-all) → "documents not showing" / broken `<img>` previews.

**Fix:** uploads now live in a persistent dir OUTSIDE the app dir
(`$HOME/hrms-uploads`) and are symlinked in as `$APP_DIR/uploads` after extraction
(mirrors the existing `node_modules` rescue). First deploy folds any pre-existing
real `uploads/` into the persistent store with `cp -an` (no-clobber).

**Why:** files written at runtime must never sit inside a dir the deploy
move-and-replaces. express.static follows the symlink fine.

**How to apply:** any new runtime-written directory (reports, exports, caches that
must survive) needs the same persist-outside-app + symlink-in treatment, or it will
vanish on the next deploy. Already-lost files cannot be recovered — they must be
re-uploaded.

# AI document extraction needs a key the VPS does not have

KYC AI extraction (`extractKycDocument`) and the HR assistant only work when an
OpenAI/Gemini key is present. Keys resolve from env (`OPENAI_API_KEY` /
`GOOGLE_GEMINI_API_KEY`) OR from the `settings` table where `company_id IS NULL`
(keys `openai_api_key` / `gemini_api_key`, loaded by `loadAllApiKeysFromDB`, set via
Settings → API Keys). The deploy `.env` writes only DATABASE_URL/SESSION_SECRET/
JWT_SECRET — no AI key — so unless one is set in Settings, extraction returns nothing
and the assistant falls back to rule-based replies.
