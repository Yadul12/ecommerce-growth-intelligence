import "server-only";

import type { Filters } from "@/lib/filters";

/**
 * Positional-parameter collector. Every user-supplied value goes through `add()`
 * and is referenced as `$n` in SQL — values are never interpolated into SQL text.
 */
export class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/**
 * Session-grain predicate. Port of `build_where_clause()` in python/app/streamlit_app.py,
 * including its index-friendly half-open date range:
 *   s.session_start_ts >= :start_ts AND s.session_start_ts < :end_ts (= end_date + 1 day)
 * which lets PostgreSQL use idx_sessions_start_ts instead of wrapping the column in DATE().
 */
export function sessionWhere(f: Filters, p: Params, alias = "s"): string {
  const clauses: string[] = [];
  if (f.from) clauses.push(`${alias}.session_start_ts >= ${p.add(f.from)}::date`);
  if (f.to) clauses.push(`${alias}.session_start_ts < (${p.add(f.to)}::date + 1)`);
  if (f.devices.length) clauses.push(`${alias}.device_type = ANY(${p.add(f.devices)}::text[])`);
  if (f.channels.length) clauses.push(`${alias}.acquisition_channel = ANY(${p.add(f.channels)}::text[])`);
  if (f.cities.length) clauses.push(`${alias}.city = ANY(${p.add(f.cities)}::text[])`);
  if (f.tiers.length) clauses.push(`${alias}.city_tier = ANY(${p.add(f.tiers)}::text[])`);
  if (f.categories.length) clauses.push(`${alias}.primary_category = ANY(${p.add(f.categories)}::text[])`);
  return clauses.length ? clauses.join("\n      AND ") : "TRUE";
}

/**
 * User-grain predicate for cohort / acquisition queries (sql/05, sql/07).
 * The date range applies to the signup timestamp (the cohort definition) and the
 * dimensions map to the user's acquisition attributes. Users have no product
 * category, so the category filter is reported as "not applicable" in the UI.
 */
export function userWhere(f: Filters, p: Params, alias = "u"): string {
  const clauses: string[] = [];
  if (f.from) clauses.push(`${alias}.signup_ts >= ${p.add(f.from)}::date`);
  if (f.to) clauses.push(`${alias}.signup_ts < (${p.add(f.to)}::date + 1)`);
  if (f.devices.length) clauses.push(`${alias}.signup_device = ANY(${p.add(f.devices)}::text[])`);
  if (f.channels.length) clauses.push(`${alias}.acquisition_channel = ANY(${p.add(f.channels)}::text[])`);
  if (f.cities.length) clauses.push(`${alias}.city = ANY(${p.add(f.cities)}::text[])`);
  if (f.tiers.length) clauses.push(`${alias}.city_tier = ANY(${p.add(f.tiers)}::text[])`);
  return clauses.length ? clauses.join("\n      AND ") : "TRUE";
}

export function clampPage(page: unknown, pageSize: unknown, maxSize = 100) {
  const size = Math.min(Math.max(Number.parseInt(String(pageSize ?? ""), 10) || 10, 5), maxSize);
  const pg = Math.max(Number.parseInt(String(page ?? ""), 10) || 1, 1);
  return { page: pg, pageSize: size, offset: (pg - 1) * size };
}

export interface Paginated<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}
