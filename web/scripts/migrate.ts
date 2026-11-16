/**
 * Database Migration and Deterministic Seeding Script.
 *
 * Runs schema creation, synthetic data seeding (SEED=42), and analytical indexing
 * directly against any PostgreSQL instance (Neon, Supabase, or local Docker).
 *
 * Usage:
 *   npx tsx scripts/migrate.ts [--reset] [--verify-only]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const SQL_DIR = fs.existsSync(path.join(WEB_ROOT, "sql"))
  ? path.join(WEB_ROOT, "sql")
  : path.join(REPO_ROOT, "sql");

dotenv.config({ path: path.join(WEB_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, ".env") });

function resolveDbUrl(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return url;
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5433";
  const db = process.env.POSTGRES_DB || "ecommerce_growth";
  const user = process.env.POSTGRES_USER || "analyst";
  const pass = process.env.POSTGRES_PASSWORD || "analyst_dev_pass";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;
}

const REQUIRED_MINIMUMS: Record<string, number> = {
  users: 50_000,
  products: 10_000,
  sessions: 100_000,
  events: 150_000,
  orders: 25_000,
  order_items: 25_000,
  refunds: 1_000,
};

async function main() {
  const isReset = process.argv.includes("--reset");
  const isVerifyOnly = process.argv.includes("--verify-only");

  const connectionString = resolveDbUrl();
  const isLocal = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(connectionString);

  console.log("===============================================================================");
  console.log("  E-COMMERCE GROWTH INTELLIGENCE — POSTGRESQL MIGRATION & SEED RUNNER");
  console.log("===============================================================================");
  console.log(`Connecting to: ${connectionString.replace(/:[^:@]+@/, ":****@")}`);

  const client = new Client({
    connectionString,
    ...(isLocal || /sslmode=/.test(connectionString) ? {} : { ssl: { rejectUnauthorized: true } }),
  });

  await client.connect();
  console.log("✓ Connected to PostgreSQL successfully.\n");

  if (!isVerifyOnly) {
    if (isReset) {
      console.log("[1/3] Applying relational schema (sql/00_schema.sql)...");
      const schemaSql = fs.readFileSync(path.join(SQL_DIR, "00_schema.sql"), "utf-8");
      await client.query(schemaSql);
      console.log("      ✓ Schema and tables created.\n");

      console.log("[2/3] Generating deterministic synthetic dataset (sql/seed_data.sql, SEED=42)...");
      const seedSql = fs.readFileSync(path.join(SQL_DIR, "seed_data.sql"), "utf-8");
      const t0 = Date.now();
      await client.query(seedSql);
      console.log(`      ✓ Seed data generated in ${((Date.now() - t0) / 1000).toFixed(2)}s.\n`);
    } else {
      console.log("[Info] Skipping schema reset and seed generation (pass --reset to rebuild from scratch).");
    }

    console.log("[3/3] Building composite & covering indexes (sql/10_indexes_and_explain_analyze.sql)...");
    const indexSql = fs.readFileSync(path.join(SQL_DIR, "10_indexes_and_explain_analyze.sql"), "utf-8");
    await client.query(indexSql);
    console.log("      ✓ Indexes and table statistics updated.\n");
  }

  console.log("--- Validating Table Row Volumes ---");
  const countsRes = await client.query(`
    SELECT 'users' AS table_name, COUNT(*)::BIGINT AS row_count FROM users
    UNION ALL SELECT 'products', COUNT(*)::BIGINT FROM products
    UNION ALL SELECT 'sessions', COUNT(*)::BIGINT FROM sessions
    UNION ALL SELECT 'events', COUNT(*)::BIGINT FROM events
    UNION ALL SELECT 'orders', COUNT(*)::BIGINT FROM orders
    UNION ALL SELECT 'order_items', COUNT(*)::BIGINT FROM order_items
    UNION ALL SELECT 'refunds', COUNT(*)::BIGINT FROM refunds;
  `);

  let allPassed = true;
  for (const row of countsRes.rows) {
    const table = row.table_name;
    const actual = parseInt(row.row_count, 10);
    const min = REQUIRED_MINIMUMS[table] || 0;
    const ok = actual >= min;
    if (!ok) allPassed = false;
    const status = ok ? "OK" : "BELOW_MINIMUM";
    console.log(`  - ${table.padEnd(14)}: ${actual.toLocaleString().padStart(10)} rows (required >= ${min.toLocaleString().padStart(8)}) [${status}]`);
  }

  await client.end();

  if (!allPassed) {
    console.error("\n[Error] One or more tables are below the required analytical row minimums.");
    process.exit(1);
  }

  console.log("\n✓ Database verification complete: all tables ready for high-performance analytics.");
}

main().catch((err) => {
  console.error("\n[Fatal] Migration failed:", err.message);
  process.exit(1);
});
