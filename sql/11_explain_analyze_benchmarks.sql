-- =============================================================================
-- FILE: sql/11_explain_analyze_benchmarks.sql
-- DEMONSTRATES: Requirement #11 - Indexing and EXPLAIN (ANALYZE, BUFFERS)
--               comparisons on expensive session-funnel and order-join queries.
-- =============================================================================

-- Query 1: Date-filtered session funnel aggregation over 299,480 clickstream events
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    e.session_id,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
    MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
FROM events e
WHERE e.event_ts >= TIMESTAMP '2025-03-01 00:00:00'
  AND e.event_ts <  TIMESTAMP '2025-03-15 00:00:00'
GROUP BY e.session_id;

-- Query 2: User-level completed revenue and repeat order aggregation using covering index
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    o.user_id,
    COUNT(o.order_id) AS completed_orders,
    SUM(o.net_amount_inr) AS realized_ltv_inr
FROM orders o
WHERE o.order_status = 'completed'
GROUP BY o.user_id
HAVING COUNT(o.order_id) >= 2;
