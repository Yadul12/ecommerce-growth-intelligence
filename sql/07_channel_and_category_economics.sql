-- =============================================================================
-- FILE: sql/07_channel_and_category_economics.sql
-- DEMONSTRATES: Channel-level unit economics:
--               Repeat purchase rate, AOV, ARPU, Refund Rate, Discount %.
-- =============================================================================

WITH user_orders AS (
    SELECT
        u.user_id,
        u.acquisition_channel,
        COUNT(DISTINCT o.order_id) FILTER (WHERE o.order_status <> 'cancelled') AS valid_order_count,
        COUNT(DISTINCT o.order_id) AS total_order_count,
        COUNT(DISTINCT o.order_id) FILTER (WHERE o.order_status IN ('refunded', 'returned')) AS refunded_order_count,
        COALESCE(SUM(o.gross_amount_inr), 0) AS total_gmv_inr,
        COALESCE(SUM(o.discount_amount_inr), 0) AS total_discount_inr,
        COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0) AS completed_net_rev_inr
    FROM users u
    LEFT JOIN orders o ON u.user_id = o.user_id
    GROUP BY u.user_id, u.acquisition_channel
)
SELECT
    acquisition_channel,
    COUNT(user_id) AS acquired_users,
    COUNT(user_id) FILTER (WHERE total_order_count >= 1) AS converting_users,
    ROUND(
        COUNT(user_id) FILTER (WHERE total_order_count >= 1)::NUMERIC
        / NULLIF(COUNT(user_id), 0) * 100,
        2
    ) AS user_conversion_rate_pct,
    ROUND(
        COUNT(user_id) FILTER (WHERE valid_order_count >= 2)::NUMERIC
        / NULLIF(COUNT(user_id) FILTER (WHERE valid_order_count >= 1), 0) * 100,
        2
    ) AS repeat_purchase_rate_pct,
    SUM(total_order_count) AS total_orders,
    ROUND(SUM(total_gmv_inr), 2) AS gmv_inr,
    ROUND(SUM(completed_net_rev_inr), 2) AS net_realized_revenue_inr,
    ROUND(
        SUM(completed_net_rev_inr) / NULLIF(SUM(valid_order_count), 0),
        2
    ) AS net_aov_inr,
    ROUND(
        SUM(completed_net_rev_inr) / NULLIF(COUNT(user_id), 0),
        2
    ) AS net_revenue_per_user_arpu_inr,
    ROUND(
        SUM(total_discount_inr) / NULLIF(SUM(total_gmv_inr), 0) * 100,
        2
    ) AS avg_discount_pct,
    ROUND(
        SUM(refunded_order_count)::NUMERIC / NULLIF(SUM(total_order_count), 0) * 100,
        2
    ) AS order_refund_rate_pct
FROM user_orders
GROUP BY acquisition_channel
ORDER BY net_revenue_per_user_arpu_inr DESC;
