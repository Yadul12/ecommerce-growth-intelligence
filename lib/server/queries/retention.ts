import "server-only";

import type { Filters } from "@/lib/filters";
import { query } from "@/lib/server/db";
import { Params, userWhere, sessionWhere } from "@/lib/server/sql";

/**
 * PAGE 3 — Retention & Cohort Analysis
 *
 * Sources preserved:
 *  - Channel Retention    ← sql/05_cohort_retention_d1_d7_d30.sql (D1, D7, D14, D30 exact day offset + rolling 7d/30d)
 *  - Cohort Heatmap       ← Weekly signup cohorts × retention horizons
 *  - DAU / WAU / MAU      ← sql/04_user_engagement_dau_wau_mau.sql (+ stickiness ratios)
 *  - Repeat Purchase & LTV← sql/06_repeat_purchase_and_ltv_windows.sql (window functions for inter-purchase days)
 *  - Customer Segments    ← Distribution of buyers by order count tiers (1 order, 2-3 orders, 4+ orders)
 */

export interface ChannelRetentionRow {
  acquisition_channel: string;
  eligible_cohort_users: number;
  d1_retained_users: number;
  d1_retention_pct: number;
  d7_retained_users: number;
  d7_retention_pct: number;
  d14_retained_users: number;
  d14_retention_pct: number;
  d30_retained_users: number;
  d30_retention_pct: number;
  rolling_7d_active_pct: number;
  rolling_30d_active_pct: number;
}

export async function getChannelRetention(f: Filters): Promise<ChannelRetentionRow[]> {
  const p = new Params();
  const sql = `
    WITH dataset_bounds AS (
      SELECT MAX(DATE(session_start_ts)) AS max_observed_date FROM sessions
    ),
    user_cohort_base AS (
      SELECT
        u.user_id,
        DATE(u.signup_ts) AS cohort_date,
        DATE_TRUNC('week', u.signup_ts)::DATE AS cohort_week,
        u.acquisition_channel,
        u.city_tier
      FROM users u
      CROSS JOIN dataset_bounds b
      WHERE DATE(u.signup_ts) <= (b.max_observed_date - INTERVAL '30 days')::DATE
        AND ${userWhere(f, p, "u")}
    ),
    user_activity_offsets AS (
      SELECT DISTINCT
        c.user_id,
        c.cohort_week,
        c.acquisition_channel,
        c.city_tier,
        (DATE(s.session_start_ts) - c.cohort_date) AS day_offset
      FROM user_cohort_base c
      LEFT JOIN sessions s
        ON c.user_id = s.user_id
       AND DATE(s.session_start_ts) > c.cohort_date
    ),
    user_retention_flags AS (
      SELECT
        user_id,
        cohort_week,
        acquisition_channel,
        city_tier,
        MAX(CASE WHEN day_offset = 1  THEN 1 ELSE 0 END) AS retained_exact_d1,
        MAX(CASE WHEN day_offset = 7  THEN 1 ELSE 0 END) AS retained_exact_d7,
        MAX(CASE WHEN day_offset = 14 THEN 1 ELSE 0 END) AS retained_exact_d14,
        MAX(CASE WHEN day_offset = 30 THEN 1 ELSE 0 END) AS retained_exact_d30,
        MAX(CASE WHEN day_offset BETWEEN 1 AND 7  THEN 1 ELSE 0 END) AS active_within_7d,
        MAX(CASE WHEN day_offset BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS active_within_30d
      FROM user_activity_offsets
      GROUP BY user_id, cohort_week, acquisition_channel, city_tier
    )
    SELECT
      COALESCE(acquisition_channel, 'ALL_CHANNELS_TOTAL') AS acquisition_channel,
      COUNT(*) AS eligible_cohort_users,
      SUM(retained_exact_d1) AS d1_retained_users,
      ROUND(AVG(retained_exact_d1) * 100, 2) AS d1_retention_pct,
      SUM(retained_exact_d7) AS d7_retained_users,
      ROUND(AVG(retained_exact_d7) * 100, 2) AS d7_retention_pct,
      SUM(retained_exact_d14) AS d14_retained_users,
      ROUND(AVG(retained_exact_d14) * 100, 2) AS d14_retention_pct,
      SUM(retained_exact_d30) AS d30_retained_users,
      ROUND(AVG(retained_exact_d30) * 100, 2) AS d30_retention_pct,
      ROUND(AVG(active_within_7d) * 100, 2) AS rolling_7d_active_pct,
      ROUND(AVG(active_within_30d) * 100, 2) AS rolling_30d_active_pct
    FROM user_retention_flags
    GROUP BY ROLLUP(acquisition_channel)
    ORDER BY
      CASE WHEN acquisition_channel IS NULL THEN 1 ELSE 0 END,
      d30_retention_pct DESC NULLS LAST;
  `;
  return query<ChannelRetentionRow>(sql, p.values);
}

export interface CohortHeatmapRow {
  cohort_week: string;
  cohort_size: number;
  d1_pct: number;
  d7_pct: number;
  d14_pct: number;
  d30_pct: number;
}

export async function getCohortHeatmap(f: Filters): Promise<CohortHeatmapRow[]> {
  const p = new Params();
  const sql = `
    WITH dataset_bounds AS (
      SELECT MAX(DATE(session_start_ts)) AS max_observed_date FROM sessions
    ),
    user_cohort_base AS (
      SELECT
        u.user_id,
        DATE(u.signup_ts) AS cohort_date,
        DATE_TRUNC('week', u.signup_ts)::DATE AS cohort_week
      FROM users u
      CROSS JOIN dataset_bounds b
      WHERE DATE(u.signup_ts) <= (b.max_observed_date - INTERVAL '30 days')::DATE
        AND ${userWhere(f, p, "u")}
    ),
    user_activity_offsets AS (
      SELECT DISTINCT
        c.user_id,
        c.cohort_week,
        (DATE(s.session_start_ts) - c.cohort_date) AS day_offset
      FROM user_cohort_base c
      LEFT JOIN sessions s
        ON c.user_id = s.user_id
       AND DATE(s.session_start_ts) > c.cohort_date
    ),
    user_retention_flags AS (
      SELECT
        user_id,
        cohort_week,
        MAX(CASE WHEN day_offset = 1  THEN 1 ELSE 0 END) AS retained_exact_d1,
        MAX(CASE WHEN day_offset = 7  THEN 1 ELSE 0 END) AS retained_exact_d7,
        MAX(CASE WHEN day_offset = 14 THEN 1 ELSE 0 END) AS retained_exact_d14,
        MAX(CASE WHEN day_offset = 30 THEN 1 ELSE 0 END) AS retained_exact_d30
      FROM user_activity_offsets
      GROUP BY user_id, cohort_week
    )
    SELECT
      cohort_week::TEXT,
      COUNT(*) AS cohort_size,
      ROUND(AVG(retained_exact_d1) * 100, 1) AS d1_pct,
      ROUND(AVG(retained_exact_d7) * 100, 1) AS d7_pct,
      ROUND(AVG(retained_exact_d14) * 100, 1) AS d14_pct,
      ROUND(AVG(retained_exact_d30) * 100, 1) AS d30_pct
    FROM user_retention_flags
    GROUP BY cohort_week
    ORDER BY cohort_week;
  `;
  return query<CohortHeatmapRow>(sql, p.values);
}

export interface EngagementRow {
  activity_date: string;
  dau: number;
  daily_sessions: number;
  wau: number;
  mau: number;
  dau_7d_moving_avg: number;
  prev_day_dau: number | null;
  dod_dau_growth_pct: number | null;
  dau_to_wau_stickiness_pct: number | null;
  dau_to_mau_stickiness_pct: number | null;
}

export async function getUserEngagement(f: Filters): Promise<EngagementRow[]> {
  const p = new Params();
  const sql = `
    WITH daily_activity AS (
      SELECT
        DATE_TRUNC('day', s.session_start_ts)::DATE AS activity_date,
        COUNT(DISTINCT s.user_id) AS dau,
        COUNT(DISTINCT s.session_id) AS daily_sessions
      FROM sessions s
      WHERE ${sessionWhere(f, p, "s")}
      GROUP BY 1
    ),
    weekly_activity AS (
      SELECT
        DATE_TRUNC('week', s.session_start_ts)::DATE AS week_start,
        COUNT(DISTINCT s.user_id) AS wau
      FROM sessions s
      WHERE ${sessionWhere(f, p, "s")}
      GROUP BY 1
    ),
    monthly_activity AS (
      SELECT
        DATE_TRUNC('month', s.session_start_ts)::DATE AS month_start,
        COUNT(DISTINCT s.user_id) AS mau
      FROM sessions s
      WHERE ${sessionWhere(f, p, "s")}
      GROUP BY 1
    )
    SELECT
      d.activity_date::TEXT,
      d.dau,
      d.daily_sessions,
      w.wau,
      m.mau,
      ROUND(
        AVG(d.dau) OVER (
          ORDER BY d.activity_date
          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ),
        1
      ) AS dau_7d_moving_avg,
      LAG(d.dau, 1) OVER (ORDER BY d.activity_date) AS prev_day_dau,
      ROUND(
        (d.dau - LAG(d.dau, 1) OVER (ORDER BY d.activity_date))::NUMERIC
        / NULLIF(LAG(d.dau, 1) OVER (ORDER BY d.activity_date), 0) * 100,
        2
      ) AS dod_dau_growth_pct,
      ROUND(d.dau::NUMERIC / NULLIF(w.wau, 0) * 100, 2) AS dau_to_wau_stickiness_pct,
      ROUND(d.dau::NUMERIC / NULLIF(m.mau, 0) * 100, 2) AS dau_to_mau_stickiness_pct
    FROM daily_activity d
    JOIN weekly_activity w
      ON DATE_TRUNC('week', d.activity_date)::DATE = w.week_start
    JOIN monthly_activity m
      ON DATE_TRUNC('month', d.activity_date)::DATE = m.month_start
    ORDER BY d.activity_date;
  `;
  return query<EngagementRow>(sql, p.values);
}

export interface RepeatCategoryLtvRow {
  first_order_category: string;
  total_buyers: number;
  repeat_buyers: number;
  repeat_purchase_rate_pct: number;
  avg_orders_per_buyer: number;
  avg_customer_ltv_inr: number;
  avg_inter_purchase_days: number | null;
}

export async function getRepeatPurchaseAndLtv(f: Filters): Promise<RepeatCategoryLtvRow[]> {
  const p = new Params();
  const sql = `
    WITH sequenced_orders AS (
      SELECT
        o.order_id,
        o.user_id,
        o.order_ts,
        o.order_status,
        o.net_amount_inr,
        s.acquisition_channel,
        s.primary_category AS order_category,
        ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id) AS order_seq_num,
        COUNT(*) OVER (PARTITION BY o.user_id) AS customer_total_orders,
        LAG(o.order_ts) OVER (PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id) AS prev_order_ts,
        FIRST_VALUE(s.primary_category) OVER (
          PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id
        ) AS first_order_category,
        SUM(o.net_amount_inr) OVER (
          PARTITION BY o.user_id
          ORDER BY o.order_ts, o.order_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_user_ltv_inr
      FROM orders o
      JOIN sessions s ON o.session_id = s.session_id
      WHERE o.order_status <> 'cancelled'
        AND ${sessionWhere(f, p, "s")}
    ),
    customer_summary AS (
      SELECT
        user_id,
        acquisition_channel,
        first_order_category,
        MAX(customer_total_orders) AS total_valid_orders,
        MAX(cumulative_user_ltv_inr) AS realized_ltv_inr,
        AVG(EXTRACT(EPOCH FROM (order_ts - prev_order_ts)) / 86400.0)
          FILTER (WHERE prev_order_ts IS NOT NULL) AS avg_days_between_orders
      FROM sequenced_orders
      GROUP BY user_id, acquisition_channel, first_order_category
    )
    SELECT
      first_order_category,
      COUNT(*) AS total_buyers,
      COUNT(*) FILTER (WHERE total_valid_orders >= 2) AS repeat_buyers,
      ROUND(
        COUNT(*) FILTER (WHERE total_valid_orders >= 2)::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        2
      ) AS repeat_purchase_rate_pct,
      ROUND(AVG(total_valid_orders), 2) AS avg_orders_per_buyer,
      ROUND(AVG(realized_ltv_inr), 2) AS avg_customer_ltv_inr,
      ROUND(AVG(avg_days_between_orders)::NUMERIC, 1) AS avg_inter_purchase_days
    FROM customer_summary
    GROUP BY first_order_category
    ORDER BY repeat_purchase_rate_pct DESC;
  `;
  return query<RepeatCategoryLtvRow>(sql, p.values);
}

export interface CustomerSegmentRow {
  segment_tier: string;
  user_count: number;
  user_pct: number;
  total_revenue_inr: number;
  revenue_share_pct: number;
  avg_ltv_inr: number;
}

export async function getCustomerSegmentation(f: Filters): Promise<CustomerSegmentRow[]> {
  const p = new Params();
  const sql = `
    WITH buyer_stats AS (
      SELECT
        o.user_id,
        COUNT(o.order_id) AS completed_orders,
        SUM(o.net_amount_inr) AS user_revenue_inr
      FROM orders o
      JOIN sessions s ON o.session_id = s.session_id
      WHERE o.order_status = 'completed'
        AND ${sessionWhere(f, p, "s")}
      GROUP BY o.user_id
    ),
    tiered AS (
      SELECT
        CASE
          WHEN completed_orders = 1 THEN '1. One-Time Buyers (1 Order)'
          WHEN completed_orders BETWEEN 2 AND 3 THEN '2. Repeat Customers (2-3 Orders)'
          ELSE '3. Power Buyers (4+ Orders)'
        END AS segment_tier,
        user_revenue_inr
      FROM buyer_stats
    )
    SELECT
      segment_tier,
      COUNT(*) AS user_count,
      ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1) AS user_pct,
      ROUND(SUM(user_revenue_inr), 2) AS total_revenue_inr,
      ROUND(SUM(user_revenue_inr) / NULLIF(SUM(SUM(user_revenue_inr)) OVER (), 0) * 100, 1) AS revenue_share_pct,
      ROUND(AVG(user_revenue_inr), 2) AS avg_ltv_inr
    FROM tiered
    GROUP BY segment_tier
    ORDER BY segment_tier;
  `;
  return query<CustomerSegmentRow>(sql, p.values);
}
