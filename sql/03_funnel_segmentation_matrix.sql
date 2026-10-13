-- =============================================================================
-- FILE: sql/03_funnel_segmentation_matrix.sql
-- DEMONSTRATES: Device, City Tier, Acquisition Channel, and Product Category
--               funnel segmentation with window-function benchmarks and rank.
-- =============================================================================

WITH session_strict AS (
    SELECT
        s.session_id,
        s.device_type,
        s.app_version,
        s.city_tier,
        s.acquisition_channel,
        s.primary_category,
        AVG(e.page_load_ms) AS avg_session_latency_ms,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
    FROM sessions s
    LEFT JOIN events e ON s.session_id = e.session_id
    GROUP BY
        s.session_id, s.device_type, s.app_version,
        s.city_tier, s.acquisition_channel, s.primary_category
),
segment_agg AS (
    SELECT
        device_type,
        app_version,
        city_tier,
        primary_category,
        COUNT(*) AS total_sessions,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL) AS view_sessions,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view) AS cart_sessions,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart) AS checkout_sessions,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk) AS purchase_sessions,
        ROUND(AVG(avg_session_latency_ms), 0) AS avg_latency_ms
    FROM session_strict
    GROUP BY device_type, app_version, city_tier, primary_category
)
SELECT
    device_type,
    app_version,
    city_tier,
    primary_category,
    total_sessions,
    cart_sessions,
    checkout_sessions,
    purchase_sessions,
    avg_latency_ms,
    ROUND(cart_sessions::NUMERIC / NULLIF(view_sessions, 0) * 100, 2) AS view_to_cart_pct,
    ROUND(checkout_sessions::NUMERIC / NULLIF(cart_sessions, 0) * 100, 2) AS cart_to_checkout_pct,
    ROUND(purchase_sessions::NUMERIC / NULLIF(checkout_sessions, 0) * 100, 2) AS checkout_to_purchase_pct,
    ROUND(purchase_sessions::NUMERIC / NULLIF(total_sessions, 0) * 100, 2) AS overall_cvr_pct,
    ROUND(
        SUM(purchase_sessions) OVER ()::NUMERIC / NULLIF(SUM(total_sessions) OVER (), 0) * 100,
        2
    ) AS platform_baseline_cvr_pct,
    ROUND(
        (purchase_sessions::NUMERIC / NULLIF(total_sessions, 0) * 100)
        - (SUM(purchase_sessions) OVER ()::NUMERIC / NULLIF(SUM(total_sessions) OVER (), 0) * 100),
        2
    ) AS cvr_gap_vs_platform_pp,
    RANK() OVER (ORDER BY (purchase_sessions::NUMERIC / NULLIF(total_sessions, 0)) ASC) AS worst_cvr_rank
FROM segment_agg
WHERE total_sessions >= 200
ORDER BY worst_cvr_rank ASC
LIMIT 25;
