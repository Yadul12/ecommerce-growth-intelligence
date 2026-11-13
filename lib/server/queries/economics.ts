import "server-only";

import type { Filters } from "@/lib/filters";
import { query } from "@/lib/server/db";
import { Params, sessionWhere, type Paginated } from "@/lib/server/sql";

/**
 * PAGE 4 — Channel & Product Economics
 *
 * Sources preserved:
 *  - Channel Economics      ← sql/07_channel_and_category_economics.sql (ARPU, Repeat %, AOV, Refund %)
 *  - Revenue Leakage Diagnostics ← sql/08_revenue_leakage_diagnostics.sql (Discounts, Cancellations, Refunds, paginated)
 *  - Product Category Profitability ← Joining order_items & products for real COGS & Gross Margin %
 *  - Payment Method Breakdown ← COD vs UPI vs Cards cancellation and return risk
 */

export interface ChannelEconomicsRow {
  acquisition_channel: string;
  acquired_users: number;
  converting_users: number;
  user_conversion_rate_pct: number | null;
  repeat_purchase_rate_pct: number | null;
  total_orders: number;
  gmv_inr: number;
  net_realized_revenue_inr: number;
  net_aov_inr: number | null;
  net_revenue_per_user_arpu_inr: number | null;
  avg_discount_pct: number | null;
  order_refund_rate_pct: number | null;
}

export async function getChannelEconomics(f: Filters): Promise<ChannelEconomicsRow[]> {
  const p = new Params();
  const sql = `
    WITH filtered_sessions AS (
      SELECT s.session_id, s.user_id, s.acquisition_channel
      FROM sessions s
      WHERE ${sessionWhere(f, p, "s")}
    ),
    channel_users AS (
      SELECT
        acquisition_channel,
        COUNT(DISTINCT user_id) AS acquired_users
      FROM filtered_sessions
      GROUP BY acquisition_channel
    ),
    channel_orders AS (
      SELECT
        fs.acquisition_channel,
        COUNT(DISTINCT o.user_id) AS converting_users,
        COUNT(DISTINCT o.user_id) FILTER (
          WHERE (SELECT COUNT(*) FROM orders o2 WHERE o2.user_id = o.user_id AND o2.order_status <> 'cancelled') >= 2
        ) AS repeat_users,
        COUNT(o.order_id) AS total_orders,
        COUNT(o.order_id) FILTER (WHERE o.order_status <> 'cancelled') AS valid_orders,
        COUNT(o.order_id) FILTER (WHERE o.order_status IN ('refunded', 'returned')) AS refunded_orders,
        COALESCE(ROUND(SUM(o.gross_amount_inr), 2), 0) AS total_gmv_inr,
        COALESCE(ROUND(SUM(o.discount_amount_inr), 2), 0) AS total_discount_inr,
        COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 2), 0) AS completed_net_rev_inr
      FROM orders o
      JOIN filtered_sessions fs ON o.session_id = fs.session_id
      GROUP BY fs.acquisition_channel
    )
    SELECT
      cu.acquisition_channel,
      cu.acquired_users,
      COALESCE(co.converting_users, 0) AS converting_users,
      ROUND(COALESCE(co.converting_users, 0)::NUMERIC / NULLIF(cu.acquired_users, 0) * 100, 2) AS user_conversion_rate_pct,
      ROUND(COALESCE(co.repeat_users, 0)::NUMERIC / NULLIF(co.converting_users, 0) * 100, 2) AS repeat_purchase_rate_pct,
      COALESCE(co.total_orders, 0) AS total_orders,
      COALESCE(co.total_gmv_inr, 0) AS gmv_inr,
      COALESCE(co.completed_net_rev_inr, 0) AS net_realized_revenue_inr,
      ROUND(COALESCE(co.completed_net_rev_inr, 0) / NULLIF(co.valid_orders, 0), 2) AS net_aov_inr,
      ROUND(COALESCE(co.completed_net_rev_inr, 0) / NULLIF(cu.acquired_users, 0), 2) AS net_revenue_per_user_arpu_inr,
      ROUND(COALESCE(co.total_discount_inr, 0) / NULLIF(co.total_gmv_inr, 0) * 100, 2) AS avg_discount_pct,
      ROUND(COALESCE(co.refunded_orders, 0)::NUMERIC / NULLIF(co.total_orders, 0) * 100, 2) AS order_refund_rate_pct
    FROM channel_users cu
    LEFT JOIN channel_orders co ON cu.acquisition_channel = co.acquisition_channel
    ORDER BY net_revenue_per_user_arpu_inr DESC NULLS LAST;
  `;
  return query<ChannelEconomicsRow>(sql, p.values);
}

export interface RevenueLeakageRow {
  product_category: string;
  payment_method: string;
  coupon_segment: string;
  total_orders: number;
  gross_amount_inr: number;
  discount_leakage_inr: number;
  cancellation_leakage_inr: number;
  refund_leakage_inr: number;
  total_leakage_inr: number;
  retained_net_revenue_inr: number;
  cancellation_rate_pct: number | null;
  refund_rate_pct: number | null;
}

export async function getRevenueLeakage(
  f: Filters,
  opts: { page: number; pageSize: number; offset: number; minOrders?: number },
): Promise<Paginated<RevenueLeakageRow>> {
  const p = new Params();
  const where = sessionWhere(f, p, "s");
  const minOrders = p.add(opts.minOrders ?? 25);
  const limit = p.add(opts.pageSize);
  const offset = p.add(opts.offset);

  const sql = `
    WITH filtered_orders AS (
      SELECT
        s.primary_category AS product_category,
        o.payment_method,
        COALESCE(o.coupon_code, 'NO_COUPON') AS coupon_segment,
        o.order_id,
        o.order_status,
        o.gross_amount_inr,
        o.discount_amount_inr,
        o.net_amount_inr,
        COALESCE(r.refund_amount_inr, 0) AS refund_amount_inr,
        r.refund_status
      FROM orders o
      JOIN sessions s ON o.session_id = s.session_id
      LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
      WHERE ${where}
    ),
    aggregated AS (
      SELECT
        product_category,
        payment_method,
        coupon_segment,
        COUNT(order_id) AS total_orders,
        ROUND(SUM(gross_amount_inr), 2) AS gross_amount_inr,
        ROUND(SUM(discount_amount_inr), 2) AS discount_leakage_inr,
        ROUND(COALESCE(SUM(net_amount_inr) FILTER (WHERE order_status = 'cancelled'), 0), 2) AS cancellation_leakage_inr,
        ROUND(COALESCE(SUM(refund_amount_inr), 0), 2) AS refund_leakage_inr,
        ROUND(
          SUM(discount_amount_inr)
          + COALESCE(SUM(net_amount_inr) FILTER (WHERE order_status = 'cancelled'), 0)
          + COALESCE(SUM(refund_amount_inr), 0),
          2
        ) AS total_leakage_inr,
        ROUND(COALESCE(SUM(net_amount_inr) FILTER (WHERE order_status = 'completed'), 0), 2) AS retained_net_revenue_inr,
        ROUND(COUNT(*) FILTER (WHERE order_status = 'cancelled')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS cancellation_rate_pct,
        ROUND(COUNT(*) FILTER (WHERE order_status IN ('refunded', 'returned'))::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS refund_rate_pct
      FROM filtered_orders
      GROUP BY product_category, payment_method, coupon_segment
      HAVING COUNT(order_id) >= ${minOrders}
    )
    SELECT *, COUNT(*) OVER () AS __total
    FROM aggregated
    ORDER BY total_leakage_inr DESC
    LIMIT ${limit} OFFSET ${offset};
  `;
  const rows = await query<RevenueLeakageRow & { __total: number }>(sql, p.values);
  let total = rows[0]?.__total ?? 0;
  if (!rows.length && opts.offset > 0) {
    const first = await getRevenueLeakage(f, { ...opts, page: 1, offset: 0 });
    total = first.total;
  }
  return {
    rows: rows.map(({ __total: _t, ...r }) => r),
    page: opts.page,
    pageSize: opts.pageSize,
    total,
  };
}

export interface CategoryProfitabilityRow {
  category: string;
  items_sold: number;
  gross_revenue_inr: number;
  cogs_inr: number;
  gross_profit_inr: number;
  gross_margin_pct: number;
  discounts_inr: number;
  realized_margin_pct: number;
}

export async function getCategoryProfitability(f: Filters): Promise<CategoryProfitabilityRow[]> {
  const p = new Params();
  const sql = `
    WITH filtered_orders AS (
      SELECT o.order_id
      FROM orders o
      JOIN sessions s ON o.session_id = s.session_id
      WHERE o.order_status = 'completed'
        AND ${sessionWhere(f, p, "s")}
    )
    SELECT
      p.category,
      SUM(oi.quantity) AS items_sold,
      ROUND(SUM(oi.line_total_inr), 2) AS gross_revenue_inr,
      ROUND(SUM(oi.quantity * p.cost_inr), 2) AS cogs_inr,
      ROUND(SUM(oi.line_total_inr - (oi.quantity * p.cost_inr)), 2) AS gross_profit_inr,
      ROUND(
        (SUM(oi.line_total_inr - (oi.quantity * p.cost_inr)) / NULLIF(SUM(oi.line_total_inr), 0)) * 100,
        2
      ) AS gross_margin_pct,
      ROUND(SUM(oi.item_discount_inr), 2) AS discounts_inr,
      ROUND(
        (SUM((oi.line_total_inr - oi.item_discount_inr) - (oi.quantity * p.cost_inr))
         / NULLIF(SUM(oi.line_total_inr - oi.item_discount_inr), 0)) * 100,
        2
      ) AS realized_margin_pct
    FROM order_items oi
    JOIN filtered_orders fo ON oi.order_id = fo.order_id
    JOIN products p ON oi.product_id = p.product_id
    GROUP BY p.category
    ORDER BY gross_profit_inr DESC;
  `;
  return query<CategoryProfitabilityRow>(sql, p.values);
}

export interface PaymentMethodRiskRow {
  payment_method: string;
  orders: number;
  cancellation_rate_pct: number;
  refund_rate_pct: number;
  retained_revenue_pct: number;
  total_net_inr: number;
}

export async function getPaymentMethodRisk(f: Filters): Promise<PaymentMethodRiskRow[]> {
  const p = new Params();
  const sql = `
    SELECT
      o.payment_method,
      COUNT(o.order_id) AS orders,
      ROUND(COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS cancellation_rate_pct,
      ROUND(COUNT(*) FILTER (WHERE o.order_status IN ('refunded', 'returned'))::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS refund_rate_pct,
      ROUND(
        COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0)
        / NULLIF(SUM(o.net_amount_inr), 0) * 100,
        2
      ) AS retained_revenue_pct,
      ROUND(SUM(o.net_amount_inr), 2) AS total_net_inr
    FROM orders o
    JOIN sessions s ON o.session_id = s.session_id
    WHERE ${sessionWhere(f, p, "s")}
    GROUP BY o.payment_method
    ORDER BY orders DESC;
  `;
  return query<PaymentMethodRiskRow>(sql, p.values);
}
