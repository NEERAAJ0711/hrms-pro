#!/usr/bin/env node
/**
 * Lightweight migration runner.
 * - Reads .sql files from ./migrations in alphabetical order
 * - Tracks which have run in a `_migrations` table
 * - Idempotent: skips already-applied files
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const MIG_DIR = path.join(__dirname, "..", "migrations");

(async () => {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await client.connect();
    console.log("▶ Connected to database");

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name      VARCHAR PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    if (!fs.existsSync(MIG_DIR)) {
      console.log("⏭  No migrations directory found, skipping");
      return;
    }

    const files = fs
      .readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows: applied } = await client.query(
      "SELECT name FROM _migrations"
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`⏭  ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
      console.log(`▶ Applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`✅ ${file} applied`);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`❌ ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log(
      appliedCount > 0
        ? `\n✅ ${appliedCount} migration(s) applied`
        : "\n✅ All migrations up to date"
    );
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error("❌ Migration error:", err.message);
  process.exit(1);
});
