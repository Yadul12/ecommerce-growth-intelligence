"""Comprehensive automated tests for SQL analytical queries and statistical functions."""

import pytest
from src.db import run_sql_file_df, query_df
from src.analytics import (
    two_proportion_z_test,
    chi_square_independence_test,
    compare_continuous_distributions,
    calculate_ab_sample_size,
)


def test_executive_kpis_reconciliation(db_ready):
    df = run_sql_file_df("01_executive_kpis_and_reconciliation.sql")
    assert len(df) == 1
    row = df.iloc[0]
    assert int(row["total_users"]) == 50_000
    assert int(row["total_sessions"]) == 110_000
    assert int(row["total_orders"]) >= 25_000
    assert float(row["gross_merchandise_value_inr"]) > float(row["net_realized_revenue_inr"]) > 0
    # Verify accounting identity: Booked Net = Cancelled + Processed Refunds + Net Realized Revenue
    reconciled_booked = (
        float(row["cancelled_order_value_inr"])
        + float(row["processed_refunds_inr"])
        + float(row["net_realized_revenue_inr"])
    )
    assert abs(float(row["booked_net_order_value_inr"]) - reconciled_booked) < 1.0


def test_strict_funnel_monotonicity(db_ready):
    df = run_sql_file_df("02_strict_session_funnel.sql").sort_values("stage_order")
    strict_counts = df["strict_sessions"].tolist()
    assert len(strict_counts) == 5
    for i in range(1, len(strict_counts)):
        assert strict_counts[i] <= strict_counts[i - 1], (
            f"Funnel stage {i+1} ({strict_counts[i]}) exceeded stage {i} ({strict_counts[i-1]})"
        )
    cart_row = df[df["stage_order"] == 3].iloc[0]
    assert int(cart_row["naive_sessions"]) > int(cart_row["strict_sessions"])
    assert int(cart_row["out_of_order_or_unattributed_sessions"]) == 1548


def test_funnel_segmentation_matrix(db_ready):
    df = run_sql_file_df("03_funnel_segmentation_matrix.sql")
    assert not df.empty
    assert (df["total_sessions"] >= 200).all()
    assert (df["overall_cvr_pct"].between(0.0, 100.0)).all()


def test_dau_wau_mau_stickiness(db_ready):
    df = run_sql_file_df("04_user_engagement_dau_wau_mau.sql")
    assert len(df) >= 180
    assert (df["dau"] <= df["wau"]).all()
    assert (df["dau"] <= df["mau"]).all()
    assert (df["dau_to_wau_stickiness_pct"].between(0.0, 100.0)).all()
    assert (df["dau_to_mau_stickiness_pct"].between(0.0, 100.0)).all()


def test_retention_rates_bounded(db_ready):
    df = run_sql_file_df("05_cohort_retention_d1_d7_d30.sql")
    assert len(df) == 7  # 6 channels + ALL_CHANNELS_TOTAL rollup
    for col in [
        "d1_retention_pct",
        "d7_retention_pct",
        "d14_retention_pct",
        "d30_retention_pct",
        "rolling_7d_active_pct",
        "rolling_30d_active_pct",
    ]:
        assert (df[col].between(0.0, 100.0)).all(), f"Column {col} out of [0, 100] bounds"
    assert (df["rolling_30d_active_pct"] >= df["rolling_7d_active_pct"]).all()


def test_repeat_purchase_and_ltv_windows(db_ready):
    df = run_sql_file_df("06_repeat_purchase_and_ltv_windows.sql")
    assert len(df) == 6
    assert (df["repeat_buyers"] <= df["total_buyers"]).all()
    assert (df["repeat_purchase_rate_pct"].between(0.0, 100.0)).all()
    assert (df["avg_customer_ltv_inr"] > 0).all()


def test_channel_and_category_economics(db_ready):
    df = run_sql_file_df("07_channel_and_category_economics.sql")
    assert len(df) == 6
    assert int(df["acquired_users"].sum()) == 50_000
    assert (df["gmv_inr"] >= df["net_realized_revenue_inr"]).all()


def test_revenue_leakage_diagnostics(db_ready):
    df = run_sql_file_df("08_revenue_leakage_diagnostics.sql")
    assert not df.empty
    assert (df["cancellation_rate_pct"].between(0.0, 100.0)).all()
    assert (df["refund_rate_pct"].between(0.0, 100.0)).all()


def test_explain_analyze_benchmark_query(db_ready):
    df = query_df(
        """
        EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
        SELECT o.user_id, COUNT(o.order_id), SUM(o.net_amount_inr)
        FROM orders o
        WHERE o.order_status = 'completed'
        GROUP BY o.user_id;
        """
    )
    plan_text = "\n".join(df.iloc[:, 0].astype(str).tolist())
    assert "Execution Time:" in plan_text


def test_statistical_functions():
    res = two_proportion_z_test(420, 1000, 560, 1000, "Legacy", "Stable")
    assert res.abs_diff_pp == -14.0
    assert res.is_significant is True
    assert res.p_value < 1e-8

    chi_res = chi_square_independence_test([[5228, 5458], [13640, 8851]])
    assert chi_res["is_significant"] is True
    assert chi_res["cramers_v"] > 0.05

    cont_res = compare_continuous_distributions(
        [3200, 3450, 3600, 3510, 3390],
        [1200, 1350, 1420, 1280, 1500],
    )
    assert cont_res["is_significant"] is True
    assert cont_res["mean_a"] > cont_res["mean_b"]

    sample_plan = calculate_ab_sample_size(0.4892, 0.08, alpha=0.05, power=0.80)
    assert sample_plan["sample_size_per_variant"] == 2561
    assert sample_plan["total_sample_size_50_50"] == 5122
