-- =============================================================================
-- FILE: sql/05_cohort_retention_d1_d7_d30.sql
-- DEMONSTRATES: Explicit Cohort & Activity Definitions for D1, D7, D14, D30
--               retention (both exact day-offset and bounded rolling retention)
--               segmented by Acquisition Channel.
-- =============================================================================

WITH dataset_bounds AS (
    SELECT MAX(DATE(session_start_ts)) AS max_observed_date FROM sessions
),
user_cohort_base AS (
    SELECT
        u.user_id,
        DATE(u.signup_ts) AS cohort_date,
        DATE_TRUNC('week', u.signup_ts)::DATE AS cohort_week,
        u.acquisition_channel,
        u.city_tier
    FROM users u
    CROSS JOIN dataset_bounds b
    WHERE DATE(u.signup_ts) <= (b.max_observed_date - INTERVAL '30 days')::DATE
),
user_activity_offsets AS (
    SELECT DISTINCT
        c.user_id,
        c.cohort_week,
        c.acquisition_channel,
        c.city_tier,
        (DATE(s.session_start_ts) - c.cohort_date) AS day_offset
    FROM user_cohort_base c
    LEFT JOIN sessions s
        ON c.user_id = s.user_id
       AND DATE(s.session_start_ts) > c.cohort_date
),
user_retention_flags AS (
    SELECT
        user_id,
        cohort_week,
        acquisition_channel,
        city_tier,
        MAX(CASE WHEN day_offset = 1  THEN 1 ELSE 0 END) AS retained_exact_d1,
        MAX(CASE WHEN day_offset = 7  THEN 1 ELSE 0 END) AS retained_exact_d7,
        MAX(CASE WHEN day_offset = 14 THEN 1 ELSE 0 END) AS retained_exact_d14,
        MAX(CASE WHEN day_offset = 30 THEN 1 ELSE 0 END) AS retained_exact_d30,
        MAX(CASE WHEN day_offset BETWEEN 1 AND 7  THEN 1 ELSE 0 END) AS active_within_7d,
        MAX(CASE WHEN day_offset BETWEEN 1 AND 30 THEN 1 ELSE 0 END) AS active_within_30d
    FROM user_activity_offsets
    GROUP BY user_id, cohort_week, acquisition_channel, city_tier
)
SELECT
    COALESCE(acquisition_channel, 'ALL_CHANNELS_TOTAL') AS acquisition_channel,
    COUNT(*) AS eligible_cohort_users,
    SUM(retained_exact_d1) AS d1_retained_users,
    ROUND(AVG(retained_exact_d1) * 100, 2) AS d1_retention_pct,
    SUM(retained_exact_d7) AS d7_retained_users,
    ROUND(AVG(retained_exact_d7) * 100, 2) AS d7_retention_pct,
    SUM(retained_exact_d14) AS d14_retained_users,
    ROUND(AVG(retained_exact_d14) * 100, 2) AS d14_retention_pct,
    SUM(retained_exact_d30) AS d30_retained_users,
    ROUND(AVG(retained_exact_d30) * 100, 2) AS d30_retention_pct,
    ROUND(AVG(active_within_7d) * 100, 2) AS rolling_7d_active_pct,
    ROUND(AVG(active_within_30d) * 100, 2) AS rolling_30d_active_pct
FROM user_retention_flags
GROUP BY ROLLUP(acquisition_channel)
ORDER BY d30_retention_pct DESC NULLS LAST;
