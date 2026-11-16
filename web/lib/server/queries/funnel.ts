import "server-only";

import type { Filters } from "@/lib/filters";
import { query } from "@/lib/server/db";
import { Params, sessionWhere, type Paginated } from "@/lib/server/sql";

/**
 * PAGE 2 — Funnel & Friction Analysis
 *
 * Strict funnel definition (unchanged): a session reaches a stage only if every
 * earlier stage happened first: t_view < t_cart < t_checkout < t_purchase.
 *
 * Sources preserved:
 *  - getStrictFunnel      ← sql/02_strict_session_funnel.sql (+ session filters)
 *  - getFunnelBreakdown   ← same stage logic grouped by device / channel / tier / category
 *  - getFrictionMatrix    ← python/app/streamlit_app.py Page 2 `funnel_sql` (device build × city tier)
 *  - getWorstSegments     ← sql/03_funnel_segmentation_matrix.sql (+ filters, server-side pagination)
 *  - getAppVersionCartToCheckout ← python/src/run_pipeline.py `seg_sql` (Android legacy vs stable)
 */

const STAGE_TS = `
  MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
  MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
  MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
  MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy`;

const STRICT_VIEW = `t_view IS NOT NULL`;
const STRICT_CART = `t_view IS NOT NULL AND t_cart > t_view`;
const STRICT_CHK = `t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart`;
const STRICT_BUY = `t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk`;

export interface FunnelStageRow {
  stage_order: number;
  stage_name: string;
  strict_sessions: number;
  naive_sessions: number;
  out_of_order_or_unattributed_sessions: number;
  pct_of_total_sessions: number | null;
  stage_to_stage_conversion_pct: number | null;
  stage_drop_off_pct: number | null;
  sessions_lost_at_stage: number | null;
}

export async function getStrictFunnel(f: Filters): Promise<FunnelStageRow[]> {
  const p = new Params();
  const sql = `
    WITH session_stage_timestamps AS (
      SELECT
        s.session_id,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS first_view_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS first_cart_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS first_checkout_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS first_purchase_ts
      FROM sessions s
      LEFT JOIN events e ON s.session_id = e.session_id
      WHERE ${sessionWhere(f, p)}
      GROUP BY s.session_id
    ),
    strict_vs_naive_flags AS (
      SELECT
        session_id,
        (first_view_ts IS NOT NULL)::INT AS naive_view,
        (first_cart_ts IS NOT NULL)::INT AS naive_cart,
        (first_checkout_ts IS NOT NULL)::INT AS naive_checkout,
        (first_purchase_ts IS NOT NULL)::INT AS naive_purchase,
        (first_view_ts IS NOT NULL)::INT AS strict_view,
        (first_view_ts IS NOT NULL AND first_cart_ts IS NOT NULL AND first_cart_ts > first_view_ts)::INT AS strict_cart,
        (first_view_ts IS NOT NULL AND first_cart_ts IS NOT NULL AND first_checkout_ts IS NOT NULL
          AND first_cart_ts > first_view_ts AND first_checkout_ts > first_cart_ts)::INT AS strict_checkout,
        (first_view_ts IS NOT NULL AND first_cart_ts IS NOT NULL AND first_checkout_ts IS NOT NULL
          AND first_purchase_ts IS NOT NULL AND first_cart_ts > first_view_ts
          AND first_checkout_ts > first_cart_ts AND first_purchase_ts > first_checkout_ts)::INT AS strict_purchase
      FROM session_stage_timestamps
    ),
    funnel_stages AS (
      SELECT 1 AS stage_order, '1. Total Sessions' AS stage_name,
             COUNT(*)::BIGINT AS strict_sessions, COUNT(*)::BIGINT AS naive_sessions
      FROM strict_vs_naive_flags
      UNION ALL
      SELECT 2, '2. Product View', COALESCE(SUM(strict_view), 0), COALESCE(SUM(naive_view), 0) FROM strict_vs_naive_flags
      UNION ALL
      SELECT 3, '3. Add to Cart', COALESCE(SUM(strict_cart), 0), COALESCE(SUM(naive_cart), 0) FROM strict_vs_naive_flags
      UNION ALL
      SELECT 4, '4. Checkout Start', COALESCE(SUM(strict_checkout), 0), COALESCE(SUM(naive_checkout), 0) FROM strict_vs_naive_flags
      UNION ALL
      SELECT 5, '5. Purchase Completed', COALESCE(SUM(strict_purchase), 0), COALESCE(SUM(naive_purchase), 0) FROM strict_vs_naive_flags
    )
    SELECT
      stage_order,
      stage_name,
      strict_sessions,
      naive_sessions,
      (naive_sessions - strict_sessions) AS out_of_order_or_unattributed_sessions,
      ROUND(strict_sessions::NUMERIC / NULLIF(FIRST_VALUE(strict_sessions) OVER (ORDER BY stage_order), 0) * 100, 2)
        AS pct_of_total_sessions,
      ROUND(strict_sessions::NUMERIC / NULLIF(LAG(strict_sessions) OVER (ORDER BY stage_order), 0) * 100, 2)
        AS stage_to_stage_conversion_pct,
      ROUND((1.0 - strict_sessions::NUMERIC / NULLIF(LAG(strict_sessions) OVER (ORDER BY stage_order), 0)) * 100, 2)
        AS stage_drop_off_pct,
      LAG(strict_sessions) OVER (ORDER BY stage_order) - strict_sessions AS sessions_lost_at_stage
    FROM funnel_stages
    ORDER BY stage_order;
  `;
  return query<FunnelStageRow>(sql, p.values);
}

export interface FunnelBreakdownRow {
  dimension: "device" | "channel" | "city_tier" | "category";
  segment: string;
  sessions: number;
  views: number;
  carts: number;
  checkouts: number;
  purchases: number;
  view_to_cart_pct: number | null;
  cart_to_checkout_pct: number | null;
  checkout_to_purchase_pct: number | null;
  overall_cvr_pct: number | null;
}

/** One scan over sessions × events, aggregated four ways with GROUPING SETS. */
export async function getFunnelBreakdown(f: Filters): Promise<FunnelBreakdownRow[]> {
  const p = new Params();
  const sql = `
    WITH stage_ts AS (
      SELECT s.session_id, s.device_type, s.acquisition_channel, s.city_tier, s.primary_category, ${STAGE_TS}
      FROM sessions s
      LEFT JOIN events e ON s.session_id = e.session_id
      WHERE ${sessionWhere(f, p)}
      GROUP BY s.session_id
    ),
    agg AS (
      SELECT
        CASE
          WHEN GROUPING(device_type) = 0 THEN 'device'
          WHEN GROUPING(acquisition_channel) = 0 THEN 'channel'
          WHEN GROUPING(city_tier) = 0 THEN 'city_tier'
          ELSE 'category'
        END AS dimension,
        COALESCE(device_type, acquisition_channel, city_tier, primary_category) AS segment,
        COUNT(*) AS sessions,
        COUNT(*) FILTER (WHERE ${STRICT_VIEW}) AS views,
        COUNT(*) FILTER (WHERE ${STRICT_CART}) AS carts,
        COUNT(*) FILTER (WHERE ${STRICT_CHK}) AS checkouts,
        COUNT(*) FILTER (WHERE ${STRICT_BUY}) AS purchases
      FROM stage_ts
      GROUP BY GROUPING SETS ((device_type), (acquisition_channel), (city_tier), (primary_category))
    )
    SELECT
      *,
      ROUND(carts::NUMERIC / NULLIF(views, 0) * 100, 2) AS view_to_cart_pct,
      ROUND(checkouts::NUMERIC / NULLIF(carts, 0) * 100, 2) AS cart_to_checkout_pct,
      ROUND(purchases::NUMERIC / NULLIF(checkouts, 0) * 100, 2) AS checkout_to_purchase_pct,
      ROUND(purchases::NUMERIC / NULLIF(sessions, 0) * 100, 2) AS overall_cvr_pct
    FROM agg
    ORDER BY dimension, overall_cvr_pct DESC NULLS LAST;
  `;
  return query<FunnelBreakdownRow>(sql, p.values);
}

export interface FrictionRow {
  device_build: string;
  city_tier: string;
  sessions: number;
  views: number;
  carts: number;
  checkouts: number;
  purchases: number;
  cart_to_checkout_pct: number | null;
  overall_session_cvr_pct: number | null;
}

export async function getFrictionMatrix(f: Filters): Promise<FrictionRow[]> {
  const p = new Params();
  const sql = `
    WITH stage_ts AS (
      SELECT
        s.session_id,
        s.device_type || ' (' || s.app_version || ')' AS device_build,
        s.city_tier,
        ${STAGE_TS}
      FROM sessions s
      LEFT JOIN events e ON s.session_id = e.session_id
      WHERE ${sessionWhere(f, p)}
      GROUP BY 1, 2, 3
    )
    SELECT
      device_build,
      city_tier,
      COUNT(*) AS sessions,
      COUNT(*) FILTER (WHERE ${STRICT_VIEW}) AS views,
      COUNT(*) FILTER (WHERE ${STRICT_CART}) AS carts,
      COUNT(*) FILTER (WHERE ${STRICT_CHK}) AS checkouts,
      COUNT(*) FILTER (WHERE ${STRICT_BUY}) AS purchases,
      ROUND(
        COUNT(*) FILTER (WHERE ${STRICT_CHK})::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE ${STRICT_CART}), 0) * 100, 2
      ) AS cart_to_checkout_pct,
      ROUND(COUNT(*) FILTER (WHERE ${STRICT_BUY})::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS overall_session_cvr_pct
    FROM stage_ts
    GROUP BY 1, 2
    ORDER BY cart_to_checkout_pct ASC NULLS LAST;
  `;
  return query<FrictionRow>(sql, p.values);
}

export interface WorstSegmentRow {
  device_type: string;
  app_version: string;
  city_tier: string;
  primary_category: string;
  total_sessions: number;
  cart_sessions: number;
  checkout_sessions: number;
  purchase_sessions: number;
  avg_latency_ms: number | null;
  view_to_cart_pct: number | null;
  cart_to_checkout_pct: number | null;
  checkout_to_purchase_pct: number | null;
  overall_cvr_pct: number | null;
  platform_baseline_cvr_pct: number | null;
  cvr_gap_vs_platform_pp: number | null;
  worst_cvr_rank: number;
}

export async function getWorstSegments(
  f: Filters,
  opts: { page: number; pageSize: number; offset: number; minSessions?: number },
): Promise<Paginated<WorstSegmentRow>> {
  const p = new Params();
  const where = sessionWhere(f, p);
  const minSessions = p.add(opts.minSessions ?? 200);
  const limit = p.add(opts.pageSize);
  const offset = p.add(opts.offset);
  const sql = `
    WITH session_strict AS (
      SELECT
        s.session_id, s.device_type, s.app_version, s.city_tier, s.acquisition_channel, s.primary_category,
        AVG(e.page_load_ms) AS avg_session_latency_ms,
        ${STAGE_TS}
      FROM sessions s
      LEFT JOIN events e ON s.session_id = e.session_id
      WHERE ${where}
      GROUP BY s.session_id
    ),
    segment_agg AS (
      SELECT
        device_type, app_version, city_tier, primary_category,
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE ${STRICT_VIEW}) AS view_sessions,
        COUNT(*) FILTER (WHERE ${STRICT_CART}) AS cart_sessions,
        COUNT(*) FILTER (WHERE ${STRICT_CHK}) AS checkout_sessions,
        COUNT(*) FILTER (WHERE ${STRICT_BUY}) AS purchase_sessions,
        ROUND(AVG(avg_session_latency_ms), 0) AS avg_latency_ms
      FROM session_strict
      GROUP BY device_type, app_version, city_tier, primary_category
    ),
    ranked AS (
      SELECT
        device_type, app_version, city_tier, primary_category,
        total_sessions, cart_sessions, checkout_sessions, purchase_sessions, avg_latency_ms,
        ROUND(cart_sessions::NUMERIC / NULLIF(view_sessions, 0) * 100, 2) AS view_to_cart_pct,
        ROUND(checkout_sessions::NUMERIC / NULLIF(cart_sessions, 0) * 100, 2) AS cart_to_checkout_pct,
        ROUND(purchase_sessions::NUMERIC / NULLIF(checkout_sessions, 0) * 100, 2) AS checkout_to_purchase_pct,
        ROUND(purchase_sessions::NUMERIC / NULLIF(total_sessions, 0) * 100, 2) AS overall_cvr_pct,
        ROUND(SUM(purchase_sessions) OVER ()::NUMERIC / NULLIF(SUM(total_sessions) OVER (), 0) * 100, 2)
          AS platform_baseline_cvr_pct,
        ROUND(
          (purchase_sessions::NUMERIC / NULLIF(total_sessions, 0) * 100)
          - (SUM(purchase_sessions) OVER ()::NUMERIC / NULLIF(SUM(total_sessions) OVER (), 0) * 100),
          2
        ) AS cvr_gap_vs_platform_pp,
        RANK() OVER (ORDER BY (purchase_sessions::NUMERIC / NULLIF(total_sessions, 0)) ASC) AS worst_cvr_rank
      FROM segment_agg
      WHERE total_sessions >= ${minSessions}
    )
    SELECT *, COUNT(*) OVER () AS __total
    FROM ranked
    ORDER BY worst_cvr_rank ASC, device_type, app_version, city_tier, primary_category
    LIMIT ${limit} OFFSET ${offset};
  `;
  const rows = await query<WorstSegmentRow & { __total: number }>(sql, p.values);
  let total = rows[0]?.__total ?? 0;
  if (!rows.length && opts.offset > 0) {
    // Page beyond the end: report the true total so the UI can recover.
    const first = await getWorstSegments(f, { ...opts, page: 1, offset: 0 });
    total = first.total;
  }
  return {
    rows: rows.map(({ __total: _t, ...r }) => r),
    page: opts.page,
    pageSize: opts.pageSize,
    total,
  };
}

export interface AppVersionRow {
  app_version: string;
  cart_sessions: number;
  checkout_sessions: number;
}

/** run_pipeline.py: Android cart→checkout by app build, used for the two-proportion z-test. */
export async function getAppVersionCartToCheckout(f: Filters): Promise<AppVersionRow[]> {
  const p = new Params();
  const sql = `
    WITH session_strict AS (
      SELECT s.session_id, s.app_version,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk
      FROM sessions s
      LEFT JOIN events e ON s.session_id = e.session_id
      WHERE s.device_type = 'Android' AND ${sessionWhere(f, p)}
      GROUP BY s.session_id, s.app_version
    )
    SELECT
      app_version,
      COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view) AS cart_sessions,
      COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart) AS checkout_sessions
    FROM session_strict
    GROUP BY app_version
    ORDER BY app_version;
  `;
  return query<AppVersionRow>(sql, p.values);
}
