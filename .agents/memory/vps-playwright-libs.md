---
name: VPS Playwright system libs
description: Ubuntu 24.04 package names required for Playwright Chromium headless on the Hostinger VPS
---

The Hostinger VPS (srv916325) runs Ubuntu 24.04. Playwright's downloaded Chromium binary requires system libraries that must be installed as root. On Ubuntu 24.04 many packages were renamed with a `t64` suffix.

**Install command (run as root):**
```bash
apt-get install -y libglib2.0-0t64 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2t64
```

**Why:** Playwright downloads its own Chromium binary (~150 MB) but does NOT bundle system `.so` libs. Without these, the binary crashes on startup with `error while loading shared libraries: libatk-1.0.so.0`.

**Key Ubuntu 24.04 renames (vs 22.04):**
- `libglib2.0-0` → `libglib2.0-0t64`
- `libatk1.0-0` → `libatk1.0-0t64`
- `libatk-bridge2.0-0` → `libatk-bridge2.0-0t64`
- `libcups2` → `libcups2t64`
- `libasound2` → `libasound2t64`

**Confirmed missing library from self-test:** `libatk-1.0.so.0` (part of `libatk1.0-0t64`)

**How to apply:** After any VPS re-provision or OS upgrade, run the install command above as root. Libraries persist across Node/PM2 restarts and app deploys — this is a one-time server setup step.

**VPS deploy user:** `workeazy-hrms` — no passwordless sudo, so `playwright install --with-deps` fails in the CD pipeline. System libs must be pre-installed by root.
