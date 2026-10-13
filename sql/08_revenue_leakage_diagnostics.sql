-- =============================================================================
-- FILE: sql/08_revenue_leakage_diagnostics.sql
-- DEMONSTRATES: Deep-dive revenue leakage decomposition across Payment Methods
--               (COD vs UPI vs Cards), Coupon Codes, and Product Categories.
-- =============================================================================

SELECT
    s.primary_category AS product_category,
    o.payment_method,
    COALESCE(o.coupon_code, 'NO_COUPON') AS coupon_segment,
    COUNT(o.order_id) AS total_orders,
    ROUND(SUM(o.gross_amount_inr), 2) AS gross_amount_inr,
    ROUND(SUM(o.discount_amount_inr), 2) AS discount_leakage_inr,
    ROUND(
        COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'cancelled'), 0),
        2
    ) AS cancellation_leakage_inr,
    ROUND(
        COALESCE(SUM(r.refund_amount_inr) FILTER (WHERE r.refund_status = 'processed'), 0),
        2
    ) AS refund_leakage_inr,
    ROUND(
        COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0),
        2
    ) AS retained_net_revenue_inr,
    ROUND(
        COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS cancellation_rate_pct,
    ROUND(
        COUNT(*) FILTER (WHERE o.order_status IN ('refunded', 'returned'))::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS refund_rate_pct
FROM orders o
JOIN sessions s ON o.session_id = s.session_id
LEFT JOIN refunds r ON o.order_id = r.order_id
GROUP BY s.primary_category, o.payment_method, COALESCE(o.coupon_code, 'NO_COUPON')
HAVING COUNT(o.order_id) >= 50
ORDER BY (
    SUM(o.discount_amount_inr)
    + COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'cancelled'), 0)
    + COALESCE(SUM(r.refund_amount_inr) FILTER (WHERE r.refund_status = 'processed'), 0)
) DESC
LIMIT 20;
