-- =============================================================================
-- FILE: sql/04_user_engagement_dau_wau_mau.sql
-- DEMONSTRATES: DAU, WAU, MAU, Stickiness (DAU/WAU & DAU/MAU),
--               7-day moving average via window frames, and LAG() DoD growth.
-- =============================================================================

WITH daily_activity AS (
    SELECT
        DATE_TRUNC('day', s.session_start_ts)::DATE AS activity_date,
        COUNT(DISTINCT s.user_id) AS dau,
        COUNT(DISTINCT s.session_id) AS daily_sessions
    FROM sessions s
    GROUP BY 1
),
weekly_activity AS (
    SELECT
        DATE_TRUNC('week', s.session_start_ts)::DATE AS week_start,
        COUNT(DISTINCT s.user_id) AS wau
    FROM sessions s
    GROUP BY 1
),
monthly_activity AS (
    SELECT
        DATE_TRUNC('month', s.session_start_ts)::DATE AS month_start,
        COUNT(DISTINCT s.user_id) AS mau
    FROM sessions s
    GROUP BY 1
)
SELECT
    d.activity_date,
    d.dau,
    d.daily_sessions,
    w.wau,
    m.mau,
    ROUND(
        AVG(d.dau) OVER (
            ORDER BY d.activity_date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ),
        1
    ) AS dau_7d_moving_avg,
    LAG(d.dau, 1) OVER (ORDER BY d.activity_date) AS prev_day_dau,
    ROUND(
        (d.dau - LAG(d.dau, 1) OVER (ORDER BY d.activity_date))::NUMERIC
        / NULLIF(LAG(d.dau, 1) OVER (ORDER BY d.activity_date), 0) * 100,
        2
    ) AS dod_dau_growth_pct,
    ROUND(d.dau::NUMERIC / NULLIF(w.wau, 0) * 100, 2) AS dau_to_wau_stickiness_pct,
    ROUND(d.dau::NUMERIC / NULLIF(m.mau, 0) * 100, 2) AS dau_to_mau_stickiness_pct
FROM daily_activity d
JOIN weekly_activity w
    ON DATE_TRUNC('week', d.activity_date)::DATE = w.week_start
JOIN monthly_activity m
    ON DATE_TRUNC('month', d.activity_date)::DATE = m.month_start
ORDER BY d.activity_date;
