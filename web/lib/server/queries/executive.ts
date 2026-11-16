import "server-only";

import type { Filters } from "@/lib/filters";
import { query, queryOne } from "@/lib/server/db";
import { Params, sessionWhere } from "@/lib/server/sql";

/**
 * PAGE 1 — Executive Overview & Revenue Intelligence
 *
 * Sources preserved:
 *  - KPI CTE: python/app/streamlit_app.py (Page 1 `kpi_sql`) — filter-aware version of
 *    sql/01_executive_kpis_and_reconciliation.sql. Extra ratios (discount, cancellation,
 *    refund rates, ARPPU) come verbatim from sql/01.
 *  - Trend: Streamlit `trend_sql` (weekly), generalised to week|month and extended with
 *    realized revenue (same definition as KPI) and LAG() period-over-period growth.
 */

export interface ExecutiveKpis {
  active_users: number;
  total_sessions: number;
  total_orders: number;
  purchasing_users: number;
  session_cvr_pct: number | null;
  gmv_inr: number;
  discounts_inr: number;
  tax_and_shipping_inr: number;
  booked_net_inr: number;
  cancelled_inr: number;
  refunded_inr: number;
  realized_net_inr: number;
  aov_inr: number;
  net_arpu_inr: number;
  net_arppu_inr: number;
  discount_rate_pct: number | null;
  cancellation_rate_pct: number | null;
  refund_or_return_rate_pct: number | null;
  /** booked_net − (cancelled + processed refunds + realized). Must be ≈ 0 (accounting identity tested in python/tests). */
  reconciliation_gap_inr: number;
}

export async function getExecutiveKpis(f: Filters): Promise<ExecutiveKpis> {
  const p = new Params();
  const sql = `
    WITH filtered_sessions AS (
      SELECT s.session_id, s.user_id
      FROM sessions s
      WHERE ${sessionWhere(f, p)}
    ),
    session_stats AS (
      SELECT COUNT(*) AS total_sessions, COUNT(DISTINCT user_id) AS active_users
      FROM filtered_sessions
    ),
    order_stats AS (
      SELECT
        COUNT(o.order_id) AS total_orders,
        COUNT(DISTINCT o.user_id) AS purchasing_users,
        COALESCE(ROUND(SUM(o.gross_amount_inr), 2), 0) AS gmv_inr,
        COALESCE(ROUND(SUM(o.discount_amount_inr), 2), 0) AS discounts_inr,
        COALESCE(ROUND(SUM(o.shipping_fee_inr + o.tax_amount_inr), 2), 0) AS tax_and_shipping_inr,
        COALESCE(ROUND(SUM(o.net_amount_inr), 2), 0) AS booked_net_inr,
        COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'cancelled'), 2), 0) AS cancelled_inr,
        COALESCE(ROUND(SUM(COALESCE(r.refund_amount_inr, 0)) FILTER (WHERE r.refund_status = 'processed'), 2), 0) AS refunded_inr,
        COALESCE(ROUND(
          COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0)
          + COALESCE(SUM(o.net_amount_inr - COALESCE(r.refund_amount_inr, 0))
              FILTER (WHERE o.order_status IN ('returned', 'refunded')), 0),
          2
        ), 0) AS realized_net_inr,
        COALESCE(ROUND(AVG(o.net_amount_inr), 2), 0) AS aov_inr,
        COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 2), 0) AS completed_net_inr,
        ROUND(SUM(o.discount_amount_inr) / NULLIF(SUM(o.gross_amount_inr), 0) * 100, 2) AS discount_rate_pct,
        ROUND(COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::NUMERIC / NULLIF(COUNT(o.order_id), 0) * 100, 2)
          AS cancellation_rate_pct,
        ROUND(COUNT(*) FILTER (WHERE o.order_status IN ('refunded', 'returned'))::NUMERIC / NULLIF(COUNT(o.order_id), 0) * 100, 2)
          AS refund_or_return_rate_pct
      FROM orders o
      JOIN filtered_sessions fs ON o.session_id = fs.session_id
      LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
    )
    SELECT
      ss.active_users,
      ss.total_sessions,
      os.total_orders,
      os.purchasing_users,
      ROUND(os.total_orders::NUMERIC / NULLIF(ss.total_sessions, 0) * 100, 2) AS session_cvr_pct,
      os.gmv_inr,
      os.discounts_inr,
      os.tax_and_shipping_inr,
      os.booked_net_inr,
      os.cancelled_inr,
      os.refunded_inr,
      os.realized_net_inr,
      os.aov_inr,
      COALESCE(ROUND(os.completed_net_inr / NULLIF(ss.active_users, 0), 2), 0) AS net_arpu_inr,
      COALESCE(ROUND(os.completed_net_inr / NULLIF(os.purchasing_users, 0), 2), 0) AS net_arppu_inr,
      os.discount_rate_pct,
      os.cancellation_rate_pct,
      os.refund_or_return_rate_pct,
      ROUND(os.booked_net_inr - (os.cancelled_inr + os.refunded_inr + os.realized_net_inr), 2) AS reconciliation_gap_inr
    FROM session_stats ss
    CROSS JOIN order_stats os;
  `;
  return queryOne<ExecutiveKpis>(sql, p.values);
}

export type TrendGrain = "week" | "month";

export interface RevenueTrendRow {
  period_start: string;
  active_days: number;
  sessions: number;
  orders: number;
  gmv_inr: number;
  completed_net_inr: number;
  realized_net_inr: number;
  growth_pct: number | null;
}

export async function getRevenueTrend(f: Filters, grain: TrendGrain): Promise<RevenueTrendRow[]> {
  const p = new Params();
  const g = p.add(grain === "week" ? "week" : "month");
  const sql = `
    WITH periodic AS (
      SELECT
        DATE_TRUNC(${g}, s.session_start_ts)::DATE AS period_start,
        COUNT(DISTINCT s.session_start_ts::DATE) AS active_days,
        COUNT(DISTINCT s.session_id) AS sessions,
        COUNT(DISTINCT o.order_id) AS orders,
        COALESCE(ROUND(SUM(o.gross_amount_inr), 2), 0) AS gmv_inr,
        COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 2), 0) AS completed_net_inr,
        COALESCE(ROUND(
          COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0)
          + COALESCE(SUM(o.net_amount_inr - COALESCE(r.refund_amount_inr, 0))
              FILTER (WHERE o.order_status IN ('returned', 'refunded')), 0),
          2
        ), 0) AS realized_net_inr
      FROM sessions s
      LEFT JOIN orders o ON s.session_id = o.session_id
      LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
      WHERE ${sessionWhere(f, p)}
      GROUP BY 1
    )
    SELECT
      *,
      ROUND(
        (realized_net_inr - LAG(realized_net_inr) OVER w) / NULLIF(LAG(realized_net_inr) OVER w, 0) * 100,
        2
      ) AS growth_pct
    FROM periodic
    WINDOW w AS (ORDER BY period_start)
    ORDER BY period_start;
  `;
  return query<RevenueTrendRow>(sql, p.values);
}

export interface CategoryContributionRow {
  category: string;
  orders: number;
  gmv_inr: number;
  realized_net_inr: number;
  gmv_share_pct: number;
  realized_share_pct: number;
  aov_inr: number;
}

/** Category contribution using the session's primary category — the same dimension sql/08 and the category filter use. */
export async function getCategoryContribution(f: Filters): Promise<CategoryContributionRow[]> {
  const p = new Params();
  const sql = `
    WITH cat AS (
      SELECT
        s.primary_category AS category,
        COUNT(o.order_id) AS orders,
        ROUND(SUM(o.gross_amount_inr), 2) AS gmv_inr,
        ROUND(
          COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0)
          + COALESCE(SUM(o.net_amount_inr - COALESCE(r.refund_amount_inr, 0))
              FILTER (WHERE o.order_status IN ('returned', 'refunded')), 0),
          2
        ) AS realized_net_inr,
        ROUND(AVG(o.net_amount_inr), 2) AS aov_inr
      FROM orders o
      JOIN sessions s ON o.session_id = s.session_id
      LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
      WHERE ${sessionWhere(f, p)}
      GROUP BY s.primary_category
    )
    SELECT
      category, orders, gmv_inr, realized_net_inr, aov_inr,
      ROUND(gmv_inr / NULLIF(SUM(gmv_inr) OVER (), 0) * 100, 2) AS gmv_share_pct,
      ROUND(realized_net_inr / NULLIF(SUM(realized_net_inr) OVER (), 0) * 100, 2) AS realized_share_pct
    FROM cat
    ORDER BY gmv_inr DESC;
  `;
  return query<CategoryContributionRow>(sql, p.values);
}
