-- =============================================================================
-- FILE: sql/01_executive_kpis_and_reconciliation.sql
-- DEMONSTRATES: Multi-table joins, CTEs, conditional aggregation (FILTER),
--               GMV -> Net Realized Revenue waterfall, AOV, ARPU, ARPPU.
-- =============================================================================

WITH user_base AS (
    SELECT COUNT(*) AS total_users FROM users
),
session_base AS (
    SELECT COUNT(*) AS total_sessions FROM sessions
),
order_financials AS (
    SELECT
        o.order_id,
        o.user_id,
        o.order_status,
        o.gross_amount_inr,
        o.discount_amount_inr,
        o.shipping_fee_inr,
        o.tax_amount_inr,
        o.net_amount_inr,
        COALESCE(r.refund_amount_inr, 0.00) AS refunded_inr
    FROM orders o
    LEFT JOIN refunds r
        ON o.order_id = r.order_id
       AND r.refund_status = 'processed'
)
SELECT
    ub.total_users,
    sb.total_sessions,
    COUNT(ofin.order_id) AS total_orders,
    COUNT(DISTINCT ofin.user_id) AS purchasing_users,
    ROUND(COUNT(ofin.order_id)::NUMERIC / NULLIF(sb.total_sessions, 0) * 100, 2) AS session_conversion_rate_pct,
    ROUND(SUM(ofin.gross_amount_inr), 2) AS gross_merchandise_value_inr,
    ROUND(SUM(ofin.discount_amount_inr), 2) AS total_discounts_inr,
    ROUND(SUM(ofin.net_amount_inr), 2) AS booked_net_order_value_inr,
    ROUND(SUM(ofin.net_amount_inr) FILTER (WHERE ofin.order_status = 'cancelled'), 2) AS cancelled_order_value_inr,
    ROUND(SUM(ofin.refunded_inr), 2) AS processed_refunds_inr,
    ROUND(
        SUM(ofin.net_amount_inr) FILTER (WHERE ofin.order_status = 'completed')
        + SUM(ofin.net_amount_inr - ofin.refunded_inr) FILTER (WHERE ofin.order_status IN ('returned', 'refunded')),
        2
    ) AS net_realized_revenue_inr,
    ROUND(AVG(ofin.net_amount_inr), 2) AS average_order_value_inr,
    ROUND(
        (SUM(ofin.net_amount_inr) FILTER (WHERE ofin.order_status = 'completed'))
        / NULLIF(ub.total_users, 0),
        2
    ) AS net_arpu_inr,
    ROUND(
        (SUM(ofin.net_amount_inr) FILTER (WHERE ofin.order_status = 'completed'))
        / NULLIF(COUNT(DISTINCT ofin.user_id), 0),
        2
    ) AS net_arppu_inr,
    ROUND(
        SUM(ofin.discount_amount_inr) / NULLIF(SUM(ofin.gross_amount_inr), 0) * 100,
        2
    ) AS discount_rate_pct,
    ROUND(
        COUNT(*) FILTER (WHERE ofin.order_status = 'cancelled')::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS cancellation_rate_pct,
    ROUND(
        COUNT(*) FILTER (WHERE ofin.order_status IN ('refunded', 'returned'))::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS refund_or_return_rate_pct
FROM order_financials ofin
CROSS JOIN user_base ub
CROSS JOIN session_base sb
GROUP BY ub.total_users, sb.total_sessions;
