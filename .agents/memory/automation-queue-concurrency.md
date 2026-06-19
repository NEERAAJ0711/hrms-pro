---
name: Automation queue worker concurrency
description: Invariants for the EPFO/ESIC queue worker's poll loop, slot accounting, and on-demand job kill — break these and you over-claim jobs or leak browsers.
---

# Queue worker concurrency invariants (server/automation/queue-worker.ts)

These are the non-obvious rules that keep the single-concurrency browser queue correct.

## One recurring timer chain only
There must be exactly ONE recurring `setTimeout(poll, ...)` chain. `poll()` is the
only function allowed to re-arm that timer. Any "drain immediately after a job
finishes" path must call the non-rearming claim helper (`tryClaimAndRun`), NOT
`poll`, via `setImmediate`. **Why:** if both `poll` and the post-job drain re-arm
timers, polling chains multiply with every completed job. **How to apply:** when
adding any immediate wake-up, route it through `tryClaimAndRun`.

## Reserve the slot synchronously before the async claim
`activeJobCount++` happens in `tryClaimAndRun` BEFORE `await claimNextJob()`, and
is released in a `finally` only if nothing was claimed; otherwise ownership passes
to `processJob`'s `finally` (which decrements once). `processJob` must NOT
increment the count itself. **Why:** the capacity check (`activeJobCount <
MAX_CONCURRENT`) and the claim are async-separated; without a synchronous reserve,
two concurrent callers (recurring poll + post-job drain) both pass the check and
each claim a different pending job (`FOR UPDATE SKIP LOCKED`), exceeding
MAX_CONCURRENT. **How to apply:** keep the reserve/handoff symmetry; pause path
does `--` on pause and `++` on resume to balance.

## On-demand kill (abortJob)
A job is killed via `abortJob(jobId)`: it adds the id to `cancelledJobIds`,
resolves a paused job's resume resolver with the sentinel `"__cancelled__"`, and
closes the live page (context/browser release is left to `processJob`'s finally to
avoid double-release). The `pause()` helper throws on the `"__cancelled__"`
sentinel so a killed paused job aborts before doing any more portal fills/clicks.
`processJob`'s catch short-circuits cancelled jobs to status `cancelled` (no
retry/backoff) and the finally fully tears down without reviving an idle session.
**Why:** previously only `pending` jobs could be cancelled; running/paused jobs
were unkillable until the 15-min recovery cron. **How to apply:** the DELETE
`/api/automation/jobs/:id` soft-cancel route allows pending/running/paused and
calls `abortJob` then `queueService.forceCancelJob`.
