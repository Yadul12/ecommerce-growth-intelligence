-- =============================================================================
-- FILE: sql/06_repeat_purchase_and_ltv_windows.sql
-- DEMONSTRATES: ROW_NUMBER(), LAG(), LEAD(), FIRST_VALUE(), and cumulative
--               SUM() OVER () window functions to analyze repeat purchases,
--               inter-order time, and first-to-second order category transitions.
-- =============================================================================

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
        LEAD(o.order_ts) OVER (PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id) AS next_order_ts,
        FIRST_VALUE(s.primary_category) OVER (
            PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id
        ) AS first_order_category,
        LEAD(s.primary_category) OVER (
            PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id
        ) AS next_order_category,
        SUM(o.net_amount_inr) OVER (
            PARTITION BY o.user_id
            ORDER BY o.order_ts, o.order_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_user_ltv_inr
    FROM orders o
    JOIN sessions s ON o.session_id = s.session_id
    WHERE o.order_status <> 'cancelled'
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
