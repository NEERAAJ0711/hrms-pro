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

**Do NOT edit deployment files.** The user has explicitly forbidden any changes to
`.github/workflows/deploy-hostinger.yml` (and other deployment files) — "deployment
is working fine." A prior attempt to symlink uploads to `$HOME/hrms-uploads` in that
workflow was reverted at the user's request. If uploads persistence needs fixing,
the user must handle it on the VPS themselves, or explicitly ask for a deploy change.

**Conceptual fix (for reference only, not applied):** uploads would need to live in a
persistent dir OUTSIDE the app dir and be symlinked in after extraction (like the
`node_modules` rescue), because files written at runtime must not sit inside a dir
the deploy move-and-replaces. Already-lost files cannot be recovered — they must be
re-uploaded.

# AI document extraction needs a key the VPS does not have

KYC AI extraction (`extractKycDocument`) and the HR assistant only work when an
OpenAI/Gemini key is present. Keys resolve from env (`OPENAI_API_KEY` /
`GOOGLE_GEMINI_API_KEY`) OR from the `settings` table where `company_id IS NULL`
(keys `openai_api_key` / `gemini_api_key`, loaded by `loadAllApiKeysFromDB`, set via
Settings → API Keys). The deploy `.env` writes only DATABASE_URL/SESSION_SECRET/
JWT_SECRET — no AI key — so unless one is set in Settings, extraction returns nothing
and the assistant falls back to rule-based replies.
