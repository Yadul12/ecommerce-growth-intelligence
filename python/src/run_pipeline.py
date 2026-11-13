"""End-to-end analytical SQL runner, EXPLAIN ANALYZE benchmark, and statistical verification pipeline."""

from __future__ import annotations

from tabulate import tabulate
from src.db import run_sql_file_df, query_df, get_raw_connection
from src.generate_seed_data import build_and_seed_database
from src.analytics import two_proportion_z_test, calculate_ab_sample_size


ANALYTICAL_SQL_FILES = [
    ("01_executive_kpis_and_reconciliation.sql", "Executive KPIs & Revenue Waterfall"),
    ("02_strict_session_funnel.sql", "Strict Chronological Session Funnel"),
    ("03_funnel_segmentation_matrix.sql", "Worst-Converting Device/Tier/Category Segments"),
    ("04_user_engagement_dau_wau_mau.sql", "DAU / WAU / MAU & Rolling Stickiness"),
    ("05_cohort_retention_d1_d7_d30.sql", "D1 / D7 / D14 / D30 Cohort Retention by Channel"),
    ("06_repeat_purchase_and_ltv_windows.sql", "Repeat Purchase Rate & Inter-Order Windows"),
    ("07_channel_and_category_economics.sql", "Acquisition Channel Unit Economics"),
    ("08_revenue_leakage_diagnostics.sql", "Revenue Leakage (Discounts, COD Cancellations, Refunds)"),
    ("09_data_quality_and_reconciliation.sql", "Automated 10-Point Data Quality Audit"),
]


def run_explain_analyze_comparison() -> dict[str, str]:
    """Runs real EXPLAIN (ANALYZE, BUFFERS) before and after secondary indexes."""
    benchmark_query = """
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
    """
    conn = get_raw_connection()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            # 1. Drop indexes for unindexed baseline
            cur.execute("DROP INDEX IF EXISTS idx_events_session_type_ts;")
            cur.execute("DROP INDEX IF EXISTS idx_events_ts_covering;")
            cur.execute("ANALYZE events;")
            cur.execute(benchmark_query)
            before_plan = "\n".join(row[0] for row in cur.fetchall())

            # 2. Re-create covering and composite indexes
            cur.execute(
                "CREATE INDEX idx_events_session_type_ts ON events (session_id, event_type, event_ts);"
            )
            cur.execute(
                "CREATE INDEX idx_events_ts_covering ON events (event_ts) INCLUDE (session_id, event_type);"
            )
            cur.execute("ANALYZE events;")
            cur.execute(benchmark_query)
            after_plan = "\n".join(row[0] for row in cur.fetchall())
    finally:
        conn.close()

    return {"before_index": before_plan, "after_index": after_plan}


def main() -> None:
    build_and_seed_database()
    print("\n" + "=" * 88)
    print("EXECUTING SQL ANALYTICAL SUITE AGAINST POSTGRESQL")
    print("=" * 88)

    for filename, title in ANALYTICAL_SQL_FILES:
        print(f"\n>>> {title} ({filename})")
        df = run_sql_file_df(filename)
        print(tabulate(df.head(12), headers="keys", tablefmt="github", showindex=False))

    plans = run_explain_analyze_comparison()
    print("\n>>> EXPLAIN (ANALYZE, BUFFERS) - BEFORE COVERING INDEX:")
    print(plans["before_index"])
    print("\n>>> EXPLAIN (ANALYZE, BUFFERS) - AFTER COVERING INDEX:")
    print(plans["after_index"])

    seg_sql = """
    WITH session_strict AS (
        SELECT
            s.session_id,
            s.app_version,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk
        FROM sessions s
        LEFT JOIN events e ON s.session_id = e.session_id
        WHERE s.device_type = 'Android'
        GROUP BY s.session_id, s.app_version
    )
    SELECT
        app_version,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view) AS cart_sessions,
        COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart) AS checkout_sessions
    FROM session_strict
    GROUP BY app_version;
    """
    seg_df = query_df(seg_sql).set_index("app_version")
    legacy = seg_df.loc["v4.1-legacy"]
    stable = seg_df.loc["v4.8-stable"]

    z_res = two_proportion_z_test(
        conv_a=int(legacy["checkout_sessions"]),
        total_a=int(legacy["cart_sessions"]),
        conv_b=int(stable["checkout_sessions"]),
        total_b=int(stable["cart_sessions"]),
        group_a_name="Android v4.1-legacy",
        group_b_name="Android v4.8-stable",
    )
    print("\n>>> Statistical Hypothesis Test (Cart -> Checkout Conversion):")
    print(f"    {z_res.group_a_name}: {z_res.rate_a:.2f}% ({z_res.conv_a:,}/{z_res.total_a:,})")
    print(f"    {z_res.group_b_name}: {z_res.rate_b:.2f}% ({z_res.conv_b:,}/{z_res.total_b:,})")
    print(f"    Difference: {z_res.abs_diff_pp:+.2f} pp | Z = {z_res.z_stat:.2f} | p-value = {z_res.p_value:.3e}")

    ab_plan = calculate_ab_sample_size(
        baseline_rate=z_res.rate_a / 100.0,
        relative_mde=0.08,
        alpha=0.05,
        power=0.80,
    )
    print("\n>>> A/B Test Sample Size Plan (8% Relative Lift MDE, alpha=0.05, power=80%):")
    print(f"    Baseline: {ab_plan['baseline_rate_pct']}% -> Target: {ab_plan['target_rate_pct']}%")
    print(f"    Required Sample Size: {ab_plan['sample_size_per_variant']:,} cart sessions/arm "
          f"({ab_plan['total_sample_size_50_50']:,} total)")


if __name__ == "__main__":
    main()
