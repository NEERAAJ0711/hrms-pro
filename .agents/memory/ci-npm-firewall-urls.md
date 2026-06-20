---
name: CI npm install fails on package-firewall.replit.local URLs
description: Why external CI (GitHub Actions) npm ci fails with EAI_AGAIN and how to fix the lockfile
---

# package-lock.json bakes in Replit's internal npm proxy URLs

Replit's npm is configured to fetch packages through an internal proxy host
`package-firewall.replit.local`. When a package is (re)resolved in this
environment, its `resolved` URL in `package-lock.json` gets written as
`http://package-firewall.replit.local/npm/<pkg>/-/<pkg>-<ver>.tgz`.

**Symptom:** external CI (GitHub Actions `.github/workflows/ci.yml` runs
`npm ci`) fails with:
`npm error code EAI_AGAIN ... getaddrinfo EAI_AGAIN package-firewall.replit.local`
because that host only resolves inside Replit.

**Fix:** rewrite every such URL back to the public registry:
`sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`
Then validate JSON with `node -e "JSON.parse(require('fs').readFileSync('package-lock.json','utf8'))"`.
The `integrity` (sha512) fields are content-based, NOT url-based, so they stay
valid — no need to touch them. Do NOT edit package.json (forbidden + unaffected;
these are transitive deps like standardwebhooks/resend/postal-mime/@tanstack/*).

**Why it recurs:** any future `npm install` run inside Replit can re-bake the
firewall host into newly-resolved entries. After installing/updating packages,
re-grep `package-lock.json` for `package-firewall.replit.local` before pushing,
and re-run the sed if any reappear.
