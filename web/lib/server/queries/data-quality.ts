import "server-only";

import { query, timedQuery } from "@/lib/server/db";

/**
 * PAGE 5 — Data Quality & SQL Benchmarks
 *
 * Sources preserved:
 *  - 10-Point Audit Checklist ← sql/09_data_quality_and_reconciliation.sql
 *  - Table Volume Health Checks ← python/src/generate_seed_data.py (REQUIRED_MINIMUMS)
 *  - EXPLAIN ANALYZE Benchmarks ← sql/11_explain_analyze_benchmarks.sql & python/src/run_pipeline.py
 */

export interface DataQualityCheckRow {
  check_id: number;
  check_category: string;
  check_description: string;
  failing_records_count: number;
  status: "PASS" | "FAIL";
}

export async function getDataQualityAudit(): Promise<DataQualityCheckRow[]> {
  const sql = `
    SELECT
      check_id,
      check_category,
      check_description,
      failing_records_count,
      CASE WHEN failing_records_count = 0 THEN 'PASS' ELSE 'FAIL' END AS status
    FROM (
      SELECT
        1 AS check_id,
        'Uniqueness' AS check_category,
        'Duplicate primary keys in users, sessions, events, or orders' AS check_description,
        (
          (SELECT COUNT(*) - COUNT(DISTINCT user_id) FROM users) +
          (SELECT COUNT(*) - COUNT(DISTINCT session_id) FROM sessions) +
          (SELECT COUNT(*) - COUNT(DISTINCT event_id) FROM events) +
          (SELECT COUNT(*) - COUNT(DISTINCT order_id) FROM orders)
        ) AS failing_records_count

      UNION ALL

      SELECT
        2,
        'Completeness',
        'NULL values in critical foreign keys or timestamps',
        (
          (SELECT COUNT(*) FROM users WHERE signup_ts IS NULL OR acquisition_channel IS NULL) +
          (SELECT COUNT(*) FROM sessions WHERE user_id IS NULL OR session_start_ts IS NULL) +
          (SELECT COUNT(*) FROM orders WHERE user_id IS NULL OR session_id IS NULL OR net_amount_inr IS NULL)
        )

      UNION ALL

      SELECT
        3,
        'Referential Integrity',
        'Orphan records across sessions->users, events->sessions, orders->sessions, refunds->orders',
        (
          (SELECT COUNT(*) FROM sessions s LEFT JOIN users u ON s.user_id = u.user_id WHERE u.user_id IS NULL) +
          (SELECT COUNT(*) FROM events e LEFT JOIN sessions s ON e.session_id = s.session_id WHERE s.session_id IS NULL) +
          (SELECT COUNT(*) FROM orders o LEFT JOIN sessions s ON o.session_id = s.session_id WHERE s.session_id IS NULL) +
          (SELECT COUNT(*) FROM refunds r LEFT JOIN orders o ON r.order_id = o.order_id WHERE o.order_id IS NULL)
        )

      UNION ALL

      SELECT
        4,
        'Temporal Logic',
        'Sessions where session_end_ts < session_start_ts',
        (SELECT COUNT(*) FROM sessions WHERE session_end_ts < session_start_ts)

      UNION ALL

      SELECT
        5,
        'Temporal Logic',
        'Sessions occurring before user signup_ts',
        (
          SELECT COUNT(*)
          FROM sessions s
          JOIN users u ON s.user_id = u.user_id
          WHERE s.session_start_ts < u.signup_ts
        )

      UNION ALL

      SELECT
        6,
        'Temporal Logic',
        'Refunds occurring prior to order_ts or delivery_ts',
        (
          SELECT COUNT(*)
          FROM refunds r
          JOIN orders o ON r.order_id = o.order_id
          WHERE r.refund_ts < o.order_ts
        )

      UNION ALL

      SELECT
        7,
        'Revenue Reconciliation',
        'Orders where gross_amount_inr != SUM(order_items.line_total_inr)',
        (
          SELECT COUNT(*)
          FROM orders o
          LEFT JOIN (
            SELECT order_id, SUM(line_total_inr) AS items_gross
            FROM order_items
            GROUP BY order_id
          ) oi ON o.order_id = oi.order_id
          WHERE ABS(o.gross_amount_inr - COALESCE(oi.items_gross, 0)) > 0.01
        )

      UNION ALL

      SELECT
        8,
        'Revenue Reconciliation',
        'Orders where net_amount_inr != (gross - discount + shipping + tax)',
        (
          SELECT COUNT(*)
          FROM orders
          WHERE ABS(
            net_amount_inr - ((gross_amount_inr - discount_amount_inr) + shipping_fee_inr + tax_amount_inr)
          ) > 0.01
        )

      UNION ALL

      SELECT
        9,
        'Revenue Reconciliation',
        'Refunds where refund_amount_inr > orders.net_amount_inr',
        (
          SELECT COUNT(*)
          FROM refunds r
          JOIN orders o ON r.order_id = o.order_id
          WHERE r.refund_amount_inr > o.net_amount_inr + 0.01
        )

      UNION ALL

      SELECT
        10,
        'Domain Validity',
        'Products where base_price_inr > mrp_inr or cost_inr > base_price_inr',
        (
          SELECT COUNT(*)
          FROM products
          WHERE base_price_inr > mrp_inr OR cost_inr > base_price_inr
        )
    ) dq_checks
    ORDER BY check_id;
  `;
  return query<DataQualityCheckRow>(sql);
}

export interface TableVolumeRow {
  table_name: string;
  actual_count: number;
  required_minimum: number;
  status: "OK" | "BELOW_MINIMUM";
}

export async function getTableVolumes(): Promise<TableVolumeRow[]> {
  const minimums: Record<string, number> = {
    users: 50_000,
    products: 10_000,
    sessions: 100_000,
    events: 150_000,
    orders: 25_000,
    order_items: 25_000,
    refunds: 1_000,
  };

  const sql = `
    SELECT 'users' AS table_name, COUNT(*)::BIGINT AS actual_count FROM users
    UNION ALL SELECT 'products', COUNT(*)::BIGINT FROM products
    UNION ALL SELECT 'sessions', COUNT(*)::BIGINT FROM sessions
    UNION ALL SELECT 'events', COUNT(*)::BIGINT FROM events
    UNION ALL SELECT 'orders', COUNT(*)::BIGINT FROM orders
    UNION ALL SELECT 'order_items', COUNT(*)::BIGINT FROM order_items
    UNION ALL SELECT 'refunds', COUNT(*)::BIGINT FROM refunds;
  `;

  const rows = await query<{ table_name: string; actual_count: number }>(sql);
  return rows.map((r) => {
    const min = minimums[r.table_name] ?? 0;
    return {
      table_name: r.table_name,
      actual_count: r.actual_count,
      required_minimum: min,
      status: r.actual_count >= min ? "OK" : "BELOW_MINIMUM",
    };
  });
}

export interface ExplainBenchmarkResult {
  query_name: string;
  query_sql: string;
  plan_lines: string[];
  execution_time_ms: number;
  planning_time_ms: number;
  total_duration_ms: number;
}

/**
 * Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) on the two benchmark queries from sql/11.
 * Safely parses plan output to extract execution and planning time.
 */
export async function runExplainBenchmarks(): Promise<ExplainBenchmarkResult[]> {
  const benchmarks = [
    {
      name: "1. Date-Filtered Session Funnel Over 295k+ Events (idx_events_ts_covering)",
      sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    e.session_id,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
FROM events e
WHERE e.event_ts >= TIMESTAMP '2025-03-01 00:00:00'
  AND e.event_ts <  TIMESTAMP '2025-03-15 00:00:00'
GROUP BY e.session_id;`,
    },
    {
      name: "2. User-Level Completed LTV Aggregation (idx_orders_user_status_net)",
      sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    o.user_id,
    COUNT(o.order_id) AS completed_orders,
    SUM(o.net_amount_inr) AS realized_ltv_inr
FROM orders o
WHERE o.order_status = 'completed'
GROUP BY o.user_id
HAVING COUNT(o.order_id) >= 2;`,
    },
  ];

  const results: ExplainBenchmarkResult[] = [];

  for (const b of benchmarks) {
    const timed = await timedQuery<Record<string, string>>(b.sql);
    const planLines = timed.rows.map((r) => Object.values(r)[0]);
    let execTime = 0;
    let planTime = 0;

    for (const line of planLines) {
      const execMatch = /Execution Time:\s+([\d.]+)\s*ms/i.exec(line);
      if (execMatch) execTime = parseFloat(execMatch[1]);
      const planMatch = /Planning Time:\s+([\d.]+)\s*ms/i.exec(line);
      if (planMatch) planTime = parseFloat(planMatch[1]);
    }

    results.push({
      query_name: b.name,
      query_sql: b.sql,
      plan_lines: planLines,
      execution_time_ms: execTime,
      planning_time_ms: planTime,
      total_duration_ms: timed.durationMs,
    });
  }

  return results;
}
