import "server-only";

import { Pool, types, type PoolConfig, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

/**
 * PostgreSQL access layer (replaces `python/src/db.py`).
 *
 * - One pool per server instance (Fluid Compute reuses instances across requests).
 * - `attachDatabasePool` lets Vercel close idle clients before an instance is suspended.
 * - Credentials are read only from server-side env vars and never serialised.
 * - All queries go through `query()` with positional parameters ($1, $2, ...).
 */

// --- Type parsing -----------------------------------------------------------
// NUMERIC and BIGINT arrive as strings by default. Every value in this dataset is
// far below 2^53 (largest is GMV in the low hundreds of millions INR), so
// converting to JS numbers is lossless.
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));
// Keep DATE / TIMESTAMP as ISO-like strings. The schema uses TIMESTAMP WITHOUT TIME ZONE,
// and converting to JS Date would apply the server's local timezone.
types.setTypeParser(types.builtins.DATE, (v) => v);
types.setTypeParser(types.builtins.TIMESTAMP, (v) => v);

// --- Errors -----------------------------------------------------------------
export class DatabaseUnavailableError extends Error {
  readonly status = 503;
  constructor(public readonly reason: "not_configured" | "unreachable" | "timeout" | "query_failed") {
    super(
      reason === "not_configured"
        ? "The analytics database is not configured."
        : reason === "timeout"
          ? "The analytics query timed out."
          : reason === "query_failed"
            ? "The analytics query failed."
            : "The analytics database is unreachable.",
    );
    this.name = "DatabaseUnavailableError";
  }
}

// --- Connection -------------------------------------------------------------
function resolveConnectionString(): string | null {
  // Vercel Marketplace Postgres (Neon) injects DATABASE_URL / POSTGRES_URL.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (url) return url;

  // Local fallback: same variables the Python toolkit and docker-compose use.
  const { POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD } = process.env;
  if (POSTGRES_HOST && POSTGRES_DB && POSTGRES_USER) {
    const auth = `${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD ?? "")}`;
    return `postgresql://${auth}@${POSTGRES_HOST}:${POSTGRES_PORT ?? "5432"}/${POSTGRES_DB}`;
  }
  return null;
}

function createPool(): Pool | null {
  const connectionString = resolveConnectionString();
  if (!connectionString) return null;

  const isLocal = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(connectionString);
  const config: PoolConfig = {
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 25_000),
    query_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 25_000) + 2_000,
    application_name: "egi-dashboard",
    // Hosted providers (Neon, Supabase) require TLS; their URLs carry sslmode=require.
    ...(isLocal || /sslmode=/.test(connectionString) ? {} : { ssl: { rejectUnauthorized: true } }),
  };

  const pool = new Pool(config);
  // An idle client erroring (e.g. provider restart) must not crash the process.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  attachDatabasePool(pool);
  return pool;
}

const globalForPool = globalThis as unknown as { __egiPool?: Pool | null };

function getPool(): Pool {
  if (globalForPool.__egiPool === undefined) globalForPool.__egiPool = createPool();
  const pool = globalForPool.__egiPool;
  if (!pool) throw new DatabaseUnavailableError("not_configured");
  return pool;
}

export function isDatabaseConfigured(): boolean {
  return resolveConnectionString() !== null;
}

// --- Query helpers ----------------------------------------------------------
export interface TimedResult<T> {
  rows: T[];
  durationMs: number;
}

function classify(err: unknown): DatabaseUnavailableError {
  if (err instanceof DatabaseUnavailableError) return err;
  const e = err as { code?: string; message?: string };
  // 57014 = query_canceled (statement_timeout)
  if (e?.code === "57014" || /timeout/i.test(e?.message ?? "")) return new DatabaseUnavailableError("timeout");
  if (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "28P01", "3D000", "57P01", "57P03"].includes(
      e?.code ?? "",
    )
  )
    return new DatabaseUnavailableError("unreachable");
  return new DatabaseUnavailableError("query_failed");
}

export async function timedQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<TimedResult<T>> {
  const pool = getPool();
  const start = performance.now();
  try {
    const res = await pool.query<T>(text, params);
    return { rows: res.rows, durationMs: Math.round((performance.now() - start) * 10) / 10 };
  } catch (err) {
    // Log full detail server-side only; the client receives a generic message.
    const e = err as { code?: string; message?: string };
    console.error(`[db] query failed (${e?.code ?? "unknown"}): ${e?.message ?? String(err)}`);
    throw classify(err);
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await timedQuery<T>(text, params)).rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await query<T>(text, params);
  if (!rows[0]) throw new DatabaseUnavailableError("query_failed");
  return rows[0];
}
