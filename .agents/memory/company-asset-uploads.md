---
name: Company asset uploads (logo/signature)
description: Why company logo/signature uploads appeared "not saved" and the persistence/display contract
---
# Company asset uploads (logo & signature)

Endpoint: `POST/DELETE /api/companies/:id/assets/:type` in `server/routes.ts`. Files go to
`uploads/company-assets/`, served statically at `/uploads`. DB columns `companies.logo` /
`companies.signature` store the URL path.

## Gotcha: deterministic filenames made replacements look unsaved
Originally the multer filename was `{companyId}-{type}{ext}` (deterministic). Replacing an asset
produced the SAME URL string, so the DB value never changed AND the browser/proxy served the cached
old image — users perceived "signature not saved".
**Fix:** make the filename unique per upload (`{companyId}-{type}-{Date.now()}{ext}`) and delete the
previous file on replace. Unique URL => DB changes => React Query re-render => fresh image.

## Stale-state-after-upload contract
The upload response returns `{ success, url, company }`. The frontend MUST use the returned
`company` to update dialog state. Reading from the TanStack Query `companies` list right after
`invalidateQueries` returns the PRE-refetch (stale) record and can blank the just-uploaded asset.

## Safety: never unlink a raw DB-stored path
Old-file cleanup must be constrained to `COMPANY_ASSETS_DIR` (resolve + prefix check) before
`fs.unlinkSync` — a DB-stored path could otherwise be crafted to delete arbitrary files. See
`safeUnlinkCompanyAsset` in `server/routes.ts`.
