"""Interactive 5-Page Product Analytics Dashboard connected directly to PostgreSQL.

Pages:
  1. Executive Overview & Revenue Waterfall
  2. Strict Session Funnel & Segment Bottlenecks
  3. Customer Retention, Cohorts & Stickiness (DAU/WAU/MAU)
  4. Acquisition Channel & Product Category Unit Economics
  5. Data Quality Audit & Query Performance (EXPLAIN ANALYZE)

Global Filters:
  - Date Range (session_start_ts)
  - Device Type (Android, iOS, Mobile_Web, Desktop_Web)
  - Acquisition Channel (Organic_Search, Paid_Social, Paid_Search, Direct, Referral, Influencer)
  - City / City Tier (Bengaluru, Mumbai, Delhi NCR, etc.)
  - Product Category (Fashion & Apparel, Electronics, Beauty & Personal Care, etc.)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.db import query_df, run_sql_file_df
from src.analytics import two_proportion_z_test, calculate_ab_sample_size

st.set_page_config(
    page_title="E-commerce Growth Intelligence | Product Analytics",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data(ttl=300)
def load_filter_options() -> dict[str, list]:
    bounds = query_df(
        "SELECT MIN(DATE(session_start_ts)) AS min_d, MAX(DATE(session_start_ts)) AS max_d FROM sessions;"
    )
    devices = query_df("SELECT DISTINCT device_type FROM sessions ORDER BY 1;")["device_type"].tolist()
    channels = query_df("SELECT DISTINCT acquisition_channel FROM sessions ORDER BY 1;")["acquisition_channel"].tolist()
    cities = query_df("SELECT DISTINCT city FROM sessions ORDER BY 1;")["city"].tolist()
    categories = query_df("SELECT DISTINCT primary_category FROM sessions ORDER BY 1;")["primary_category"].tolist()
    return {
        "min_date": bounds["min_d"].iloc[0],
        "max_date": bounds["max_d"].iloc[0],
        "devices": devices,
        "channels": channels,
        "cities": cities,
        "categories": categories,
    }


def build_where_clause(
    start_date, end_date, devices: list[str], channels: list[str], cities: list[str], categories: list[str]
) -> tuple[str, dict]:
    clauses = ["DATE(s.session_start_ts) BETWEEN :start_date AND :end_date"]
    params = {"start_date": start_date, "end_date": end_date}

    if devices:
        clauses.append("s.device_type IN :devices")
        params["devices"] = tuple(devices)
    if channels:
        clauses.append("s.acquisition_channel IN :channels")
        params["channels"] = tuple(channels)
    if cities:
        clauses.append("s.city IN :cities")
        params["cities"] = tuple(cities)
    if categories:
        clauses.append("s.primary_category IN :categories")
        params["categories"] = tuple(categories)

    return " AND ".join(clauses), params


def render_dashboard() -> None:
    st.title("📊 E-commerce Growth Intelligence: Funnel, Retention & Revenue Analytics")
    st.caption(
        "SQL-First Product Analytics Portfolio | PostgreSQL 16 + Python + Streamlit + Plotly | "
        "Synthetic Indian E-commerce Dataset (Fixed Seed = 42)"
    )

    opts = load_filter_options()

    st.sidebar.header("Navigation")
    page = st.sidebar.radio(
        "Select Analytical View",
        [
            "1. Executive Overview",
            "2. Funnel & Friction Analysis",
            "3. Retention & Cohort Analysis",
            "4. Channel & Product Economics",
            "5. Data Quality & SQL Benchmarks",
        ],
    )

    st.sidebar.markdown("---")
    st.sidebar.header("Global Segment Filters")
    date_range = st.sidebar.date_input(
        "Session Date Range",
        value=(opts["min_date"], opts["max_date"]),
        min_value=opts["min_date"],
        max_value=opts["max_date"],
    )
    if isinstance(date_range, tuple) and len(date_range) == 2:
        start_date, end_date = date_range
    else:
        start_date = end_date = opts["min_date"]

    sel_devices = st.sidebar.multiselect("Device Type", opts["devices"], default=opts["devices"])
    sel_channels = st.sidebar.multiselect("Acquisition Channel", opts["channels"], default=opts["channels"])
    sel_cities = st.sidebar.multiselect("City", opts["cities"], default=opts["cities"])
    sel_categories = st.sidebar.multiselect("Product Category", opts["categories"], default=opts["categories"])

    where_sql, params = build_where_clause(
        start_date, end_date, sel_devices, sel_channels, sel_cities, sel_categories
    )

    # =========================================================================
    # PAGE 1: EXECUTIVE OVERVIEW
    # =========================================================================
    if page == "1. Executive Overview":
        st.subheader("Executive KPIs & Gross-to-Net Revenue Reconciliation")

        kpi_sql = f"""
        WITH filtered_sessions AS (
            SELECT s.session_id, s.user_id
            FROM sessions s
            WHERE {where_sql}
        ),
        filtered_orders AS (
            SELECT
                o.*,
                COALESCE(r.refund_amount_inr, 0) AS refunded_inr
            FROM orders o
            JOIN filtered_sessions fs ON o.session_id = fs.session_id
            LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
        )
        SELECT
            (SELECT COUNT(DISTINCT user_id) FROM filtered_sessions) AS active_users,
            (SELECT COUNT(*) FROM filtered_sessions) AS total_sessions,
            COUNT(order_id) AS total_orders,
            ROUND(
                COUNT(order_id)::NUMERIC
                / NULLIF((SELECT COUNT(*) FROM filtered_sessions), 0) * 100, 2
            ) AS session_cvr_pct,
            COALESCE(ROUND(SUM(gross_amount_inr), 2), 0) AS gmv_inr,
            COALESCE(ROUND(SUM(discount_amount_inr), 2), 0) AS discounts_inr,
            COALESCE(ROUND(SUM(shipping_fee_inr + tax_amount_inr), 2), 0) AS tax_and_shipping_inr,
            COALESCE(ROUND(SUM(net_amount_inr), 2), 0) AS booked_net_inr,
            COALESCE(ROUND(SUM(net_amount_inr) FILTER (WHERE order_status = 'cancelled'), 2), 0) AS cancelled_inr,
            COALESCE(ROUND(SUM(refunded_inr), 2), 0) AS refunded_inr,
            COALESCE(ROUND(
                SUM(net_amount_inr) FILTER (WHERE order_status = 'completed')
                + SUM(net_amount_inr - refunded_inr) FILTER (WHERE order_status IN ('returned', 'refunded')),
                2
            ), 0) AS realized_net_inr,
            COALESCE(ROUND(AVG(net_amount_inr), 2), 0) AS aov_inr,
            COALESCE(ROUND(
                SUM(net_amount_inr) FILTER (WHERE order_status = 'completed')
                / NULLIF((SELECT COUNT(DISTINCT user_id) FROM filtered_sessions), 0), 2
            ), 0) AS net_arpu_inr
        FROM filtered_orders;
        """
        kpi = query_df(kpi_sql, params).iloc[0]

        c1, c2, c3, c4, c5, c6 = st.columns(6)
        c1.metric("Active Users", f"{int(kpi['active_users']):,}")
        c2.metric("Sessions", f"{int(kpi['total_sessions']):,}")
        c3.metric("Total Orders", f"{int(kpi['total_orders']):,}", f"{kpi['session_cvr_pct']}% CVR")
        c4.metric("GMV (Gross)", f"₹{kpi['gmv_inr'] / 1e6:.2f}M")
        c5.metric("Net Realized Rev", f"₹{kpi['realized_net_inr'] / 1e6:.2f}M")
        c6.metric("Net AOV / ARPU", f"₹{kpi['aov_inr']:,.0f}", f"ARPU ₹{kpi['net_arpu_inr']:,.0f}")

        col_l, col_r = st.columns([3, 2])
        with col_l:
            wf_fig = go.Figure(
                go.Waterfall(
                    name="Revenue Bridge",
                    orientation="v",
                    measure=["absolute", "relative", "relative", "total", "relative", "relative", "total"],
                    x=[
                        "1. GMV (Catalog Gross)",
                        "2. Promotional Discounts",
                        "3. GST & Shipping Fees",
                        "4. Booked Order Value",
                        "5. Order Cancellations",
                        "6. Returns & Refunds",
                        "7. Net Realized Revenue",
                    ],
                    y=[
                        float(kpi["gmv_inr"]),
                        -float(kpi["discounts_inr"]),
                        float(kpi["tax_and_shipping_inr"]),
                        0,
                        -float(kpi["cancelled_inr"]),
                        -float(kpi["refunded_inr"]),
                        0,
                    ],
                    connector={"line": {"color": "rgb(63, 63, 63)"}},
                )
            )
            wf_fig.update_layout(
                title="GMV to Net Realized Revenue Leakage Bridge (INR)",
                height=420,
            )
            st.plotly_chart(wf_fig, use_container_width=True)

        with col_r:
            trend_sql = f"""
            SELECT
                DATE_TRUNC('week', s.session_start_ts)::DATE AS week_start,
                COUNT(DISTINCT s.session_id) AS sessions,
                COUNT(DISTINCT o.order_id) AS orders,
                COALESCE(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 0) AS net_rev
            FROM sessions s
            LEFT JOIN orders o ON s.session_id = o.session_id
            WHERE {where_sql}
            GROUP BY 1
            ORDER BY 1;
            """
            trend_df = query_df(trend_sql, params)
            fig_trend = px.line(
                trend_df,
                x="week_start",
                y="net_rev",
                markers=True,
                title="Weekly Net Realized Revenue Trend (INR)",
                labels={"week_start": "Week", "net_rev": "Net Realized Revenue (₹)"},
            )
            fig_trend.update_layout(height=420)
            st.plotly_chart(fig_trend, use_container_width=True)

    # =========================================================================
    # PAGE 2: FUNNEL & FRICTION ANALYSIS
    # =========================================================================
    elif page == "2. Funnel & Friction Analysis":
        st.subheader("Strictly Ordered Session Funnel (`t_view < t_cart < t_checkout < t_purchase`)")

        funnel_sql = f"""
        WITH stage_ts AS (
            SELECT
                s.session_id,
                s.device_type,
                s.app_version,
                s.city_tier,
                s.primary_category,
                MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
                MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
                MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
                MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
            FROM sessions s
            LEFT JOIN events e ON s.session_id = e.session_id
            WHERE {where_sql}
            GROUP BY 1, 2, 3, 4, 5
        )
        SELECT
            COUNT(*) AS s1_sessions,
            COUNT(*) FILTER (WHERE t_view IS NOT NULL) AS s2_views,
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view) AS s3_carts,
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart) AS s4_checkouts,
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk) AS s5_purchases
        FROM stage_ts;
        """
        f_row = query_df(funnel_sql, params).iloc[0]
        stages = [
            "1. Sessions",
            "2. Product View",
            "3. Add to Cart",
            "4. Checkout Start",
            "5. Purchase Completed",
        ]
        counts = [
            int(f_row["s1_sessions"]),
            int(f_row["s2_views"]),
            int(f_row["s3_carts"]),
            int(f_row["s4_checkouts"]),
            int(f_row["s5_purchases"]),
        ]

        c_left, c_right = st.columns([1, 1])
        with c_left:
            fig_f = go.Figure(
                go.Funnel(
                    y=stages,
                    x=counts,
                    textinfo="value+percent initial+percent previous",
                )
            )
            fig_f.update_layout(title="Strict Session-Level Conversion Funnel", height=430)
            st.plotly_chart(fig_f, use_container_width=True)

        with c_right:
            seg_sql = f"""
            WITH stage_ts AS (
                SELECT
                    s.session_id,
                    s.device_type || ' (' || s.app_version || ')' AS device_build,
                    s.city_tier,
                    MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
                    MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
                    MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
                    MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
                FROM sessions s
                LEFT JOIN events e ON s.session_id = e.session_id
                WHERE {where_sql}
                GROUP BY 1, 2, 3
            )
            SELECT
                device_build,
                city_tier,
                COUNT(*) AS sessions,
                ROUND(
                    COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart)::NUMERIC
                    / NULLIF(COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view), 0) * 100, 2
                ) AS cart_to_checkout_pct,
                ROUND(
                    COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk)::NUMERIC
                    / NULLIF(COUNT(*), 0) * 100, 2
                ) AS overall_session_cvr_pct
            FROM stage_ts
            GROUP BY 1, 2
            ORDER BY cart_to_checkout_pct ASC;
            """
            seg_df = query_df(seg_sql, params)
            fig_bar = px.bar(
                seg_df,
                x="device_build",
                y="cart_to_checkout_pct",
                color="city_tier",
                barmode="group",
                title="Biggest Friction Gap: Cart -> Checkout Conversion by Device Build & City Tier",
                labels={"cart_to_checkout_pct": "Cart -> Checkout CVR (%)", "device_build": "Device & App Build"},
            )
            fig_bar.update_layout(height=430)
            st.plotly_chart(fig_bar, use_container_width=True)

        st.markdown("#### Full Multi-Segment Funnel Matrix")
        st.dataframe(seg_df, use_container_width=True)

    # =========================================================================
    # PAGE 3: RETENTION & COHORTS
    # =========================================================================
    elif page == "3. Retention & Cohort Analysis":
        st.subheader("D1 / D7 / D14 / D30 Cohort Retention & Active User Stickiness")

        ret_df = run_sql_file_df("05_cohort_retention_d1_d7_d30.sql")
        dau_df = run_sql_file_df("04_user_engagement_dau_wau_mau.sql")

        col1, col2 = st.columns(2)
        with col1:
            channel_ret = ret_df[ret_df["acquisition_channel"] != "ALL_CHANNELS_TOTAL"]
            fig_ret = px.bar(
                channel_ret.melt(
                    id_vars=["acquisition_channel"],
                    value_vars=["d1_retention_pct", "d7_retention_pct", "d14_retention_pct", "d30_retention_pct"],
                    var_name="Retention_Horizon",
                    value_name="Retention_Pct",
                ),
                x="acquisition_channel",
                y="Retention_Pct",
                color="Retention_Horizon",
                barmode="group",
                title="Exact D1 / D7 / D14 / D30 Cohort Retention by Acquisition Channel",
            )
            st.plotly_chart(fig_ret, use_container_width=True)

        with col2:
            fig_dau = px.line(
                dau_df,
                x="activity_date",
                y=["dau", "dau_7d_moving_avg"],
                title="Daily Active Users (DAU) & 7-Day Rolling Average",
            )
            st.plotly_chart(fig_dau, use_container_width=True)

        st.markdown("#### Cohort Retention Summary Table")
        st.dataframe(ret_df, use_container_width=True)

    # =========================================================================
    # PAGE 4: CHANNEL & PRODUCT ECONOMICS
    # =========================================================================
    elif page == "4. Channel & Product Economics":
        st.subheader("Acquisition Channel & Product Category Unit Economics")

        ch_df = run_sql_file_df("07_channel_and_category_economics.sql")
        rep_df = run_sql_file_df("06_repeat_purchase_and_ltv_windows.sql")
        leak_df = run_sql_file_df("08_revenue_leakage_diagnostics.sql")

        c1, c2 = st.columns(2)
        with c1:
            fig_ch = px.scatter(
                ch_df,
                x="repeat_purchase_rate_pct",
                y="net_revenue_per_user_arpu_inr",
                size="gmv_inr",
                color="acquisition_channel",
                text="acquisition_channel",
                title="Channel Quality Matrix: Repeat Purchase Rate vs. Net ARPU (Bubble = GMV)",
            )
            st.plotly_chart(fig_ch, use_container_width=True)

        with c2:
            fig_rep = px.bar(
                rep_df,
                x="first_order_category",
                y="repeat_purchase_rate_pct",
                color="avg_customer_ltv_inr",
                title="Repeat Purchase Rate & Realized LTV by First-Purchase Category",
            )
            st.plotly_chart(fig_rep, use_container_width=True)

        st.markdown("#### Top Revenue Leakage Segments (Discounts + Cancellations + Refunds)")
        st.dataframe(leak_df, use_container_width=True)

    # =========================================================================
    # PAGE 5: DATA QUALITY & SQL BENCHMARKS
    # =========================================================================
    elif page == "5. Data Quality & SQL Benchmarks":
        st.subheader("Automated 10-Point SQL Data Quality & Financial Reconciliation Audit")
        dq_df = run_sql_file_df("09_data_quality_and_reconciliation.sql")

        passed = int((dq_df["status"] == "PASS").sum())
        total = len(dq_df)
        pass_pct = (passed / total * 100.0) if total else 0.0
        if total and passed == total:
            st.success(f"Data Quality Health Score: {passed}/{total} automated checks passing ({pass_pct:.0f}%)")
        else:
            st.error(f"Data Quality Health Score: {passed}/{total} automated checks passing ({pass_pct:.0f}%) — review failing checks below")
        st.dataframe(dq_df, use_container_width=True)

        st.markdown("#### Interactive A/B Test Power & Sample Size Calculator")
        col_a, col_b, col_c = st.columns(3)
        base_cvr = col_a.slider("Baseline Stage Conversion Rate (%)", 10.0, 80.0, 48.3, 0.5) / 100.0
        rel_mde = col_b.slider("Minimum Detectable Relative Lift (%)", 2.0, 20.0, 8.0, 0.5) / 100.0
        power = col_c.selectbox("Statistical Power (1 - β)", [0.80, 0.85, 0.90], index=0)

        plan = calculate_ab_sample_size(base_cvr, rel_mde, alpha=0.05, power=float(power))
        st.info(
            f"**Required Sample Size (50/50 split, two-sided α=0.05):** "
            f"`{plan['sample_size_per_variant']:,}` eligible sessions per variant "
            f"(`{plan['total_sample_size_50_50']:,}` total sessions) to detect a lift from "
            f"`{plan['baseline_rate_pct']}%` to `{plan['target_rate_pct']}%` "
            f"(`+{plan['absolute_mde_pp']} pp`)."
        )


if __name__ == "__main__":
    render_dashboard()
