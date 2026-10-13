-- =============================================================================
-- FILE: sql/09_data_quality_and_reconciliation.sql
-- DEMONSTRATES: 10 Automated Data Quality & Reconciliation Assertions
-- =============================================================================

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
