-- =============================================================================
-- FILE: sql/02_strict_session_funnel.sql
-- DEMONSTRATES: Strictly ordered session-level funnel:
--               product_view -> add_to_cart -> checkout_start -> purchase
--               with chronological timestamp enforcement (t1 < t2 < t3 < t4),
--               comparison against naive unordered funnel, and stage drop-offs.
-- =============================================================================

WITH session_stage_timestamps AS (
    SELECT
        s.session_id,
        s.user_id,
        s.device_type,
        s.city_tier,
        s.acquisition_channel,
        s.primary_category,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS first_view_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS first_cart_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS first_checkout_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS first_purchase_ts
    FROM sessions s
    LEFT JOIN events e
        ON s.session_id = e.session_id
    GROUP BY
        s.session_id, s.user_id, s.device_type,
        s.city_tier, s.acquisition_channel, s.primary_category
),
strict_vs_naive_flags AS (
    SELECT
        session_id,
        (first_view_ts IS NOT NULL)::INT AS naive_view,
        (first_cart_ts IS NOT NULL)::INT AS naive_cart,
        (first_checkout_ts IS NOT NULL)::INT AS naive_checkout,
        (first_purchase_ts IS NOT NULL)::INT AS naive_purchase,
        (first_view_ts IS NOT NULL)::INT AS strict_view,
        (
            first_view_ts IS NOT NULL
            AND first_cart_ts IS NOT NULL
            AND first_cart_ts > first_view_ts
        )::INT AS strict_cart,
        (
            first_view_ts IS NOT NULL
            AND first_cart_ts IS NOT NULL
            AND first_checkout_ts IS NOT NULL
            AND first_cart_ts > first_view_ts
            AND first_checkout_ts > first_cart_ts
        )::INT AS strict_checkout,
        (
            first_view_ts IS NOT NULL
            AND first_cart_ts IS NOT NULL
            AND first_checkout_ts IS NOT NULL
            AND first_purchase_ts IS NOT NULL
            AND first_cart_ts > first_view_ts
            AND first_checkout_ts > first_cart_ts
            AND first_purchase_ts > first_checkout_ts
        )::INT AS strict_purchase
    FROM session_stage_timestamps
),
funnel_stages AS (
    SELECT 1 AS stage_order, '1. Total Sessions' AS stage_name,
           COUNT(*)::BIGINT AS strict_sessions, COUNT(*)::BIGINT AS naive_sessions
    FROM strict_vs_naive_flags
    UNION ALL
    SELECT 2, '2. Product View', SUM(strict_view), SUM(naive_view) FROM strict_vs_naive_flags
    UNION ALL
    SELECT 3, '3. Add to Cart', SUM(strict_cart), SUM(naive_cart) FROM strict_vs_naive_flags
    UNION ALL
    SELECT 4, '4. Checkout Start', SUM(strict_checkout), SUM(naive_checkout) FROM strict_vs_naive_flags
    UNION ALL
    SELECT 5, '5. Purchase Completed', SUM(strict_purchase), SUM(naive_purchase) FROM strict_vs_naive_flags
)
SELECT
    stage_order,
    stage_name,
    strict_sessions,
    naive_sessions,
    (naive_sessions - strict_sessions) AS out_of_order_or_unattributed_sessions,
    ROUND(
        strict_sessions::NUMERIC
        / NULLIF(FIRST_VALUE(strict_sessions) OVER (ORDER BY stage_order), 0) * 100,
        2
    ) AS pct_of_total_sessions,
    ROUND(
        strict_sessions::NUMERIC
        / NULLIF(LAG(strict_sessions) OVER (ORDER BY stage_order), 0) * 100,
        2
    ) AS stage_to_stage_conversion_pct,
    ROUND(
        (1.0 - strict_sessions::NUMERIC / NULLIF(LAG(strict_sessions) OVER (ORDER BY stage_order), 0)) * 100,
        2
    ) AS stage_drop_off_pct,
    LAG(strict_sessions) OVER (ORDER BY stage_order) - strict_sessions AS sessions_lost_at_stage
FROM funnel_stages
ORDER BY stage_order;
