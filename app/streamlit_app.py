"""Interactive 5-page product analytics dashboard connected directly to PostgreSQL.

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
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.analytics import calculate_ab_sample_size
from src.db import query_df, run_sql_file_df

st.set_page_config(
    page_title="E-commerce Growth Intelligence | Product Analytics",
    page_icon=":material/analytics:",
    layout="wide",
    initial_sidebar_state="expanded",
)

PAGE_OPTIONS = [
    "1. Executive Overview",
    "2. Funnel & Friction Analysis",
    "3. Retention & Cohort Analysis",
    "4. Channel & Product Economics",
    "5. Data Quality & SQL Benchmarks",
]


@st.cache_data(ttl="5m", max_entries=8, show_spinner="Loading filter options…")
def load_filter_options() -> dict[str, Any]:
    bounds = query_df(
        "SELECT MIN(session_start_ts)::date AS min_d, MAX(session_start_ts)::date AS max_d FROM sessions;"
    )
    dims = query_df(
        """
        SELECT
            (SELECT ARRAY_AGG(d ORDER BY d) FROM (SELECT DISTINCT device_type AS d FROM sessions) t) AS devices,
            (SELECT ARRAY_AGG(d ORDER BY d) FROM (SELECT DISTINCT acquisition_channel AS d FROM sessions) t) AS channels,
            (SELECT ARRAY_AGG(d ORDER BY d) FROM (SELECT DISTINCT city AS d FROM sessions) t) AS cities,
            (SELECT ARRAY_AGG(d ORDER BY d) FROM (SELECT DISTINCT primary_category AS d FROM sessions) t) AS categories;
        """
    ).iloc[0]
    return {
        "min_date": bounds["min_d"].iloc[0],
        "max_date": bounds["max_d"].iloc[0],
        "devices": list(dims["devices"] or []),
        "channels": list(dims["channels"] or []),
        "cities": list(dims["cities"] or []),
        "categories": list(dims["categories"] or []),
    }


@st.cache_data(ttl="5m", max_entries=64, show_spinner="Running analytics query…")
def cached_query(sql: str, param_items: tuple[tuple[str, Any], ...]) -> pd.DataFrame:
    return query_df(sql, dict(param_items) if param_items else None)


@st.cache_data(ttl="15m", max_entries=16, show_spinner="Loading SQL suite…")
def cached_sql_file(filename: str) -> pd.DataFrame:
    return run_sql_file_df(filename)


def freeze_params(params: dict[str, Any]) -> tuple[tuple[str, Any], ...]:
    frozen: list[tuple[str, Any]] = []
    for key, value in sorted(params.items()):
        if isinstance(value, list):
            frozen.append((key, tuple(value)))
        else:
            frozen.append((key, value))
    return tuple(frozen)


def build_where_clause(
    start_date: date,
    end_date: date,
    devices: list[str],
    channels: list[str],
    cities: list[str],
    categories: list[str],
) -> tuple[str, dict[str, Any]]:
    start_ts = datetime.combine(start_date, time.min)
    end_ts = datetime.combine(end_date, time.min) + timedelta(days=1)
    clauses = [
        "s.session_start_ts >= :start_ts",
        "s.session_start_ts < :end_ts",
    ]
    params: dict[str, Any] = {"start_ts": start_ts, "end_ts": end_ts}

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


def _chart(fig, *, alt: str, key: str) -> None:
    st.plotly_chart(fig, width="stretch", alt=alt, key=key)


@st.fragment
def ab_sample_size_calculator() -> None:
    st.markdown("#### Interactive A/B test power & sample size calculator")
    col_a, col_b, col_c = st.columns(3)
    base_cvr = col_a.slider("Baseline stage conversion rate (%)", 10.0, 80.0, 48.3, 0.5) / 100.0
    rel_mde = col_b.slider("Minimum detectable relative lift (%)", 2.0, 20.0, 8.0, 0.5) / 100.0
    power = col_c.selectbox("Statistical power (1 - β)", [0.80, 0.85, 0.90], index=0)

    plan = calculate_ab_sample_size(base_cvr, rel_mde, alpha=0.05, power=float(power))
    st.info(
        f"**Required sample size (50/50 split, two-sided α=0.05):** "
        f"`{plan['sample_size_per_variant']:,}` eligible sessions per variant "
        f"(`{plan['total_sample_size_50_50']:,}` total sessions) to detect a lift from "
        f"`{plan['baseline_rate_pct']}%` to `{plan['target_rate_pct']}%` "
        f"(`+{plan['absolute_mde_pp']} pp`)."
    )


st.title("E-commerce growth intelligence: funnel, retention & revenue")
st.caption(
    "SQL-first product analytics | PostgreSQL 16 + Python + Streamlit + Plotly | "
    "Synthetic Indian e-commerce dataset (fixed seed = 42)"
)

opts = load_filter_options()

st.sidebar.header("Navigation")
page = st.sidebar.radio("Select analytical view", PAGE_OPTIONS)

st.sidebar.markdown("---")
st.sidebar.header("Global segment filters")
with st.sidebar.form("global_filters"):
    date_range = st.date_input(
        "Session date range",
        value=(opts["min_date"], opts["max_date"]),
        min_value=opts["min_date"],
        max_value=opts["max_date"],
    )
    sel_devices = st.multiselect("Device type", opts["devices"], default=opts["devices"])
    sel_channels = st.multiselect("Acquisition channel", opts["channels"], default=opts["channels"])
    sel_cities = st.multiselect("City", opts["cities"], default=opts["cities"])
    sel_categories = st.multiselect("Product category", opts["categories"], default=opts["categories"])
    st.form_submit_button("Apply filters", icon=":material/filter_alt:")

if isinstance(date_range, tuple) and len(date_range) == 2:
    start_date, end_date = date_range
else:
    start_date = end_date = opts["min_date"]

where_sql, params = build_where_clause(
    start_date, end_date, sel_devices, sel_channels, sel_cities, sel_categories
)
param_key = freeze_params(params)

if page == "1. Executive Overview":
    st.subheader("Executive KPIs & gross-to-net revenue reconciliation")
    kpi_slot = st.container()
    with kpi_slot.skeleton():
        kpi_sql = f"""
        WITH filtered_sessions AS (
            SELECT s.session_id, s.user_id
            FROM sessions s
            WHERE {where_sql}
        ),
        session_stats AS (
            SELECT
                COUNT(*) AS total_sessions,
                COUNT(DISTINCT user_id) AS active_users
            FROM filtered_sessions
        ),
        order_stats AS (
            SELECT
                COUNT(o.order_id) AS total_orders,
                COALESCE(ROUND(SUM(o.gross_amount_inr), 2), 0) AS gmv_inr,
                COALESCE(ROUND(SUM(o.discount_amount_inr), 2), 0) AS discounts_inr,
                COALESCE(ROUND(SUM(o.shipping_fee_inr + o.tax_amount_inr), 2), 0) AS tax_and_shipping_inr,
                COALESCE(ROUND(SUM(o.net_amount_inr), 2), 0) AS booked_net_inr,
                COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'cancelled'), 2), 0) AS cancelled_inr,
                COALESCE(ROUND(SUM(COALESCE(r.refund_amount_inr, 0)) FILTER (WHERE r.refund_status = 'processed'), 2), 0) AS refunded_inr,
                COALESCE(ROUND(
                    SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed')
                    + SUM(o.net_amount_inr - COALESCE(r.refund_amount_inr, 0))
                        FILTER (WHERE o.order_status IN ('returned', 'refunded')),
                    2
                ), 0) AS realized_net_inr,
                COALESCE(ROUND(AVG(o.net_amount_inr), 2), 0) AS aov_inr,
                COALESCE(ROUND(SUM(o.net_amount_inr) FILTER (WHERE o.order_status = 'completed'), 2), 0) AS completed_net_inr
            FROM orders o
            JOIN filtered_sessions fs ON o.session_id = fs.session_id
            LEFT JOIN refunds r ON o.order_id = r.order_id AND r.refund_status = 'processed'
        )
        SELECT
            ss.active_users,
            ss.total_sessions,
            os.total_orders,
            ROUND(os.total_orders::NUMERIC / NULLIF(ss.total_sessions, 0) * 100, 2) AS session_cvr_pct,
            os.gmv_inr,
            os.discounts_inr,
            os.tax_and_shipping_inr,
            os.booked_net_inr,
            os.cancelled_inr,
            os.refunded_inr,
            os.realized_net_inr,
            os.aov_inr,
            COALESCE(ROUND(os.completed_net_inr / NULLIF(ss.active_users, 0), 2), 0) AS net_arpu_inr
        FROM session_stats ss
        CROSS JOIN order_stats os;
        """
        kpi = cached_query(kpi_sql, param_key).iloc[0]

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
        trend_df = cached_query(trend_sql, param_key)

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("Active users", f"{int(kpi['active_users']):,}")
    c2.metric("Sessions", f"{int(kpi['total_sessions']):,}")
    c3.metric("Total orders", f"{int(kpi['total_orders']):,}", f"{kpi['session_cvr_pct']}% CVR")
    c4.metric("GMV (gross)", f"₹{kpi['gmv_inr'] / 1e6:.2f}M")
    c5.metric("Net realized rev", f"₹{kpi['realized_net_inr'] / 1e6:.2f}M")
    c6.metric("Net AOV / ARPU", f"₹{kpi['aov_inr']:,.0f}", f"ARPU ₹{kpi['net_arpu_inr']:,.0f}")

    col_l, col_r = st.columns([3, 2])
    with col_l:
        wf_fig = go.Figure(
            go.Waterfall(
                name="Revenue Bridge",
                orientation="v",
                measure=["absolute", "relative", "relative", "total", "relative", "relative", "total"],
                x=[
                    "1. GMV (catalog gross)",
                    "2. Promotional discounts",
                    "3. GST & shipping fees",
                    "4. Booked order value",
                    "5. Order cancellations",
                    "6. Returns & refunds",
                    "7. Net realized revenue",
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
        wf_fig.update_layout(title="GMV to net realized revenue leakage bridge (INR)", height=420)
        _chart(
            wf_fig,
            alt="Waterfall from GMV through discounts, tax, cancellations, and refunds to net realized revenue",
            key="exec_waterfall",
        )

    with col_r:
        fig_trend = px.line(
            trend_df,
            x="week_start",
            y="net_rev",
            markers=True,
            title="Weekly net realized revenue trend (INR)",
            labels={"week_start": "Week", "net_rev": "Net realized revenue (₹)"},
        )
        fig_trend.update_layout(height=420)
        _chart(fig_trend, alt="Weekly net realized revenue line chart", key="exec_trend")

elif page == "2. Funnel & Friction Analysis":
    st.subheader("Strictly ordered session funnel (`t_view < t_cart < t_checkout < t_purchase`)")
    funnel_slot = st.container()
    with funnel_slot.skeleton():
        funnel_sql = f"""
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
            COUNT(*) FILTER (WHERE t_view IS NOT NULL) AS views,
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view) AS carts,
            COUNT(*) FILTER (
                WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart
            ) AS checkouts,
            COUNT(*) FILTER (
                WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk
            ) AS purchases,
            ROUND(
                COUNT(*) FILTER (
                    WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart
                )::NUMERIC
                / NULLIF(COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view), 0) * 100, 2
            ) AS cart_to_checkout_pct,
            ROUND(
                COUNT(*) FILTER (
                    WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk
                )::NUMERIC
                / NULLIF(COUNT(*), 0) * 100, 2
            ) AS overall_session_cvr_pct
        FROM stage_ts
        GROUP BY 1, 2
        ORDER BY cart_to_checkout_pct ASC NULLS LAST;
        """
        seg_df = cached_query(funnel_sql, param_key)

    stages = [
        "1. Sessions",
        "2. Product view",
        "3. Add to cart",
        "4. Checkout start",
        "5. Purchase completed",
    ]
    counts = [
        int(seg_df["sessions"].sum()) if not seg_df.empty else 0,
        int(seg_df["views"].sum()) if not seg_df.empty else 0,
        int(seg_df["carts"].sum()) if not seg_df.empty else 0,
        int(seg_df["checkouts"].sum()) if not seg_df.empty else 0,
        int(seg_df["purchases"].sum()) if not seg_df.empty else 0,
    ]

    c_left, c_right = st.columns(2)
    with c_left:
        fig_f = go.Figure(
            go.Funnel(
                y=stages,
                x=counts,
                textinfo="value+percent initial+percent previous",
            )
        )
        fig_f.update_layout(title="Strict session-level conversion funnel", height=430)
        _chart(fig_f, alt="Five-stage session conversion funnel counts", key="funnel_chart")

    with c_right:
        fig_bar = px.bar(
            seg_df,
            x="device_build",
            y="cart_to_checkout_pct",
            color="city_tier",
            barmode="group",
            title="Biggest friction gap: cart to checkout conversion by device build and city tier",
            labels={"cart_to_checkout_pct": "Cart to checkout CVR (%)", "device_build": "Device and app build"},
        )
        fig_bar.update_layout(height=430)
        _chart(
            fig_bar,
            alt="Grouped bars of cart-to-checkout conversion by device build and city tier",
            key="funnel_friction",
        )

    st.markdown("#### Full multi-segment funnel matrix")
    st.dataframe(seg_df, width="stretch", alt="Funnel conversion rates by device build and city tier")

elif page == "3. Retention & Cohort Analysis":
    st.subheader("D1 / D7 / D14 / D30 cohort retention & active user stickiness")
    retention_slot = st.container()
    with retention_slot.skeleton():
        ret_df = cached_sql_file("05_cohort_retention_d1_d7_d30.sql")
        dau_df = cached_sql_file("04_user_engagement_dau_wau_mau.sql")

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
            title="Exact D1 / D7 / D14 / D30 cohort retention by acquisition channel",
        )
        _chart(fig_ret, alt="Grouped retention rates by acquisition channel and horizon", key="retention_bars")

    with col2:
        fig_dau = px.line(
            dau_df,
            x="activity_date",
            y=["dau", "dau_7d_moving_avg"],
            title="Daily active users (DAU) and 7-day rolling average",
        )
        _chart(fig_dau, alt="Daily active users and seven-day moving average", key="dau_line")

    st.markdown("#### Cohort retention summary table")
    st.dataframe(ret_df, width="stretch", alt="Cohort retention summary by acquisition channel")

elif page == "4. Channel & Product Economics":
    st.subheader("Acquisition channel & product category unit economics")
    econ_slot = st.container()
    with econ_slot.skeleton():
        ch_df = cached_sql_file("07_channel_and_category_economics.sql")
        rep_df = cached_sql_file("06_repeat_purchase_and_ltv_windows.sql")
        leak_df = cached_sql_file("08_revenue_leakage_diagnostics.sql")

    c1, c2 = st.columns(2)
    with c1:
        fig_ch = px.scatter(
            ch_df,
            x="repeat_purchase_rate_pct",
            y="net_revenue_per_user_arpu_inr",
            size="gmv_inr",
            color="acquisition_channel",
            text="acquisition_channel",
            title="Channel quality matrix: repeat purchase rate vs. net ARPU (bubble = GMV)",
        )
        _chart(fig_ch, alt="Scatter of repeat purchase rate versus net ARPU by channel", key="channel_scatter")

    with c2:
        fig_rep = px.bar(
            rep_df,
            x="first_order_category",
            y="repeat_purchase_rate_pct",
            color="avg_customer_ltv_inr",
            title="Repeat purchase rate and realized LTV by first-purchase category",
        )
        _chart(fig_rep, alt="Repeat purchase rate by first-purchase category", key="repeat_bars")

    st.markdown("#### Top revenue leakage segments (discounts + cancellations + refunds)")
    st.dataframe(leak_df, width="stretch", alt="Revenue leakage segments")

elif page == "5. Data Quality & SQL Benchmarks":
    st.subheader("Automated 10-point SQL data quality & financial reconciliation audit")
    dq_slot = st.container()
    with dq_slot.skeleton():
        dq_df = cached_sql_file("09_data_quality_and_reconciliation.sql")

    passed = int((dq_df["status"] == "PASS").sum())
    total = len(dq_df)
    pass_pct = (passed / total * 100.0) if total else 0.0
    if total and passed == total:
        st.success(f"Data quality health score: {passed}/{total} automated checks passing ({pass_pct:.0f}%)")
    else:
        st.error(
            f"Data quality health score: {passed}/{total} automated checks passing ({pass_pct:.0f}%) — review failing checks below"
        )
    st.dataframe(dq_df, width="stretch", alt="Data quality audit results")
    ab_sample_size_calculator()
