---
name: EPFO/ESIC automation CAPTCHA & paused-job UI
description: Why the CAPTCHA/OTP entry field must be driven by paused-job state, not by login-test polling
---

# CAPTCHA/OTP entry must follow the paused job, not the login test

The EPFO/ESIC automation pages have a "live browser" panel. When a browser job
pauses for a human (CAPTCHA or OTP), the page must render an input bound to that
paused job and resume it via `/api/automation/jobs/{id}/resume`.

**Rule:** the CAPTCHA/OTP panel's visibility, the live-screen job, and the resume
target must all derive from the SAME job id. Prefer a `status === "paused"` job
over any running job when choosing what to display.

**Why:** paused jobs release a concurrency slot, so a *different* job can be
running at the same time. If the live view shows the running job's id but resume
targets the paused job (or vice-versa), the user types the CAPTCHA they see into
the wrong job. Original bug: the panel only rendered when the login-test poll
(`testPhase`) said captcha/otp, so real action jobs that paused never showed any
input at all.

**How to apply:** compute `pausedActionJob = runningJobs.find(paused)` first, then
make the displayed/live job prefer `pausedActionJob` before `runningJobs[0]`.
Login-test flow keeps priority only when a `testJobId` exists.

# Bulk fan-out jobs must not "fake complete"

Fan-out job types (`epfo_bulk_register`, `epfo_bulk_ecr`, `esic_bulk_register`)
enqueue child jobs and return. If they enqueue 0 children they used to report
**Completed** instantly (looked like success while doing nothing). They must
`throw` when the eligible set is empty so the job is marked failed with a clear
message.
