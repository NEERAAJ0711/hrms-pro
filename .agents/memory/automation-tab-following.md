---
name: EPFO/ESIC portal new-tab following & captcha restart
description: Two portal-automation gotchas — ESIC features opening in new browser tabs, and EPFO captcha invalidation forcing a fresh-restart login
---

# Portal automation: new tabs + captcha freshness

## ESIC menu features open in a NEW browser tab
Some ESIC menu items (e.g. "List of Employees") open via `target="_blank"` / `window.open`, so the automation's original `page` keeps showing the stale dashboard while the real feature is in a new tab. Functions that navigate with `gotoWithRetry` (most ESIC ops) stay on the same page and are unaffected — only menu-click features open tabs.

**Fix pattern:** attach a `page.context().on("page", …)` listener BEFORE the menu click, capture the first new page, then `await newTab.waitForLoadState(...)`, reassign the local `page` param to the new tab, call `ctx.setActivePage(newTab)`, and close the stale tab. The hoisted scrape helper reads the reassigned `page` binding correctly (JS closures capture the variable, not its value).

**`ctx.setActivePage(page)`** (AutomationContext) must update three things or the live view / kill break: the `currentPage` used by screenshots+snapshots, the `activePages` map (live-view API), and `runningSessions[jobId].page` (abortJob target).

**Why the listener MUST be in try/finally:** the ESIC browser context is REUSED across jobs (idle-session reuse). A listener left attached after a throw leaks onto the reused context and can capture the wrong tab on a later job.

## EPFO captcha invalidates after every submit → restart fresh, don't retry in-place
EPFO regenerates the captcha image on every login submit, so re-solving against the same page after a wrong captcha is rejected every time ("wrong captcha every time"). On rejection (captcha still visible after submit), reload the whole login page (`gotoWithRetry` to the login URL), re-dismiss popups, re-fill credentials, and solve the brand-new captcha. Loop up to 3 full attempts.

**Edge case (pre-existing, accepted):** a wrong PASSWORD also leaves the captcha visible, so it loops 3× and throws "captcha incorrect" rather than a credential error. Matches prior behavior; not worth special-casing.

**How to apply:** keep the captcha/OTP pause on the SAME jobId (resume resolver + live view follow it) — a fresh reload on the same `page` object keeps the live view valid; do NOT open a new page for the EPFO login retry.
