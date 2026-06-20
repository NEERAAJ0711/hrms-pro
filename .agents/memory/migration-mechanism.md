---
name: Dual migration mechanism (dev vs prod)
description: How schema changes reach dev vs prod, and the naming rule that keeps them in sync
---

# Dual migration mechanism

This repo applies schema changes two different ways depending on environment:

- **Dev / Replit**: `scripts/post-merge.sh` runs `npm run db:push` (drizzle-kit),
  which diffs `shared/schema.ts` against the DB and applies changes directly.
- **Prod / VPS**: `scripts/run-migrations.cjs` applies numbered `migrations/NNN_*.sql`
  in a transaction, tracked in the `_migrations` table. Plus
  `server/routes/startup-migrations.ts` runs idempotent DDL at boot (and creates
  several tables that are NOT defined in `shared/schema.ts`).

**Why it matters / how to apply:** any schema change must be expressed in BOTH
places — a `.references()`/column in `shared/schema.ts` (so db:push is correct on
dev) AND a numbered SQL migration (so prod gets it). They can drift silently.

**Critical naming rule:** when adding constraints/indexes via raw SQL that also
have a Drizzle definition, name them with Drizzle's convention
(`{table}_{col}_{parentTable}_id_fk` for FKs) so `db:push` treats them as
already-present and stays a no-op. A mismatched name makes db:push try to
re-create/drop them.

**Do not run `run-migrations.cjs` on the dev DB:** dev's `_migrations` table does
not record the earlier numbered files (dev was built by db:push), so the runner
would try to re-apply 001..NNN against an already-migrated DB and likely fail.
To test a single new migration on dev, apply just that file's SQL directly.

**Some FKs are SQL-only:** child tables created by `startup-migrations.ts`
(e.g. compliance_employee_setup, compliance_clients, compliance_carry_forward,
compliance_client_employees, placeholder_backfill_heals, employee_documents)
are not in `shared/schema.ts`, so their constraints live only in the numbered
SQL migration, not as `.references()`.

**FK/hardening migrations must guard every table with to_regclass:** the VPS prod
DB was bootstrapped by a one-time db:push and thereafter only gets numbered SQL
migrations — so any table added to schema.ts AFTER that bootstrap (e.g. `expenses`)
exists on dev but NOT on prod, and has no CREATE migration. A migration that does
bare `UPDATE <t> ...` or `ALTER TABLE <t> ADD CONSTRAINT ... REFERENCES <parent>`
on such a table fails on prod with `relation "<t>" does not exist` and rolls back
the whole deploy. Fix pattern (applied to 020_foreign_keys.sql): wrap every
statement in `DO $$ BEGIN IF to_regclass('public.<t>') IS NOT NULL AND
to_regclass('public.<parent>') IS NOT NULL [AND NOT EXISTS pg_constraint...] THEN
... END IF; END $$;` so it self-adapts to whichever tables exist. Validate by
running the whole file via executeSql on dev (idempotent no-op).
**Why:** can't query the self-hosted VPS DB from Replit, so the migration itself
must tolerate an unknown subset of missing tables.

**Add prod FKs as NOT VALID when legacy orphan data may exist:** the VPS prod DB
has years of data that predate these FKs, so a plain `ADD CONSTRAINT ... FOREIGN
KEY` fails with "insert or update on table ... violates foreign key constraint"
whenever any row references a missing parent. NOT NULL FK columns (e.g.
`statutory_settings.company_id`) can't be orphan-nulled, and fixing one table
just exposes the next (93 NOT NULL CASCADE FKs in 020). Fix pattern: append
`NOT VALID` to every FK `ADD CONSTRAINT` — it enforces the FK on all new
inserts/updates immediately but does NOT validate (or delete) pre-existing rows.
Non-destructive, idempotent (the pg_constraint NOT EXISTS guard skips already-
present constraints rather than downgrading them), and avoids whack-a-mole.
**Why:** can't clean unknown prod orphan data from Replit; NOT VALID unblocks the
deploy without data loss. Orphans can be cleaned + `VALIDATE CONSTRAINT` later.

**connect-pg-simple `session` table must be in schema.ts:** the web session
store table is created at runtime by connect-pg-simple, not the app. If it is
NOT declared in `shared/schema.ts`, `db:push` sees an unknown table and proposes
dropping it → an interactive "data-loss" prompt. In post-merge (stdin closed)
that prompt either aborts the whole push or hangs until the timeout (this caused
post-merge timeouts). Fix: declare `sessions = pgTable("session", {...})`
mirroring connect-pg-simple exactly (sid varchar PK, sess json, expire
timestamp(6), index "IDX_session_expire" on expire) so push is a clean no-op.
Post-merge timeout was also raised to 120000ms for headroom.
