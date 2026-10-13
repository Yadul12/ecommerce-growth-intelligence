"""Generates standalone interactive HTML and high-DPI PNG dashboard captures from live PostgreSQL data."""

from __future__ import annotations

from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from plotly.subplots import make_subplots
import plotly.graph_objects as go

from src.db import run_sql_file_df, query_df

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = PROJECT_ROOT / "docs"
SCREENSHOTS_DIR = DOCS_DIR / "screenshots"


def generate_dashboard_capture() -> list[Path]:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    kpi = run_sql_file_df("01_executive_kpis_and_reconciliation.sql").iloc[0]
    funnel = run_sql_file_df("02_strict_session_funnel.sql")
    dau_df = run_sql_file_df("04_user_engagement_dau_wau_mau.sql")
    ret = run_sql_file_df("05_cohort_retention_d1_d7_d30.sql")
    rep = run_sql_file_df("06_repeat_purchase_and_ltv_windows.sql")
    ch = run_sql_file_df("07_channel_and_category_economics.sql")

    counts = query_df(
        """
        SELECT
            (SELECT COUNT(*) FROM users)    AS users,
            (SELECT COUNT(*) FROM sessions) AS sessions,
            (SELECT COUNT(*) FROM events)   AS events,
            (SELECT COUNT(*) FROM orders)   AS orders;
        """
    ).iloc[0]

    gmv = float(kpi["gross_merchandise_value_inr"])
    discounts = float(kpi["total_discounts_inr"])
    booked = float(kpi["booked_net_order_value_inr"])
    cancelled = float(kpi["cancelled_order_value_inr"])
    refunded = float(kpi["processed_refunds_inr"])
    realized = float(kpi["net_realized_revenue_inr"])
    tax_and_shipping = booked - (gmv - discounts)

    summary_line = (
        f"{int(counts['users']):,} Users | {int(counts['sessions']):,} Sessions | "
        f"{int(counts['events']):,} Events | {int(counts['orders']):,} Orders | "
        f"INR {realized / 1e7:.2f} Cr Net Realized Revenue (synthetic data)"
    )

    # 1. Interactive Plotly HTML Capture
    fig = make_subplots(
        rows=2,
        cols=2,
        subplot_titles=(
            f"1. Strict Session Conversion Funnel ({int(counts['sessions']):,} Sessions)",
            "2. GMV to Net Realized Revenue Bridge (INR)",
            "3. Exact D1 / D7 / D30 Cohort Retention by Channel (%)",
            "4. Net Realized ARPU by Acquisition Channel (INR)",
        ),
        vertical_spacing=0.14,
        horizontal_spacing=0.10,
    )

    fig.add_trace(
        go.Funnel(
            y=funnel["stage_name"],
            x=funnel["strict_sessions"],
            textinfo="value+percent initial+percent previous",
            name="Strict Funnel",
        ),
        row=1,
        col=1,
    )

    # Plotly "total" bars are computed from the running sum (y is ignored),
    # so every intermediate step must be supplied as a relative delta.
    fig.add_trace(
        go.Waterfall(
            name="Revenue Bridge",
            measure=["absolute", "relative", "relative", "total", "relative", "relative", "total"],
            x=[
                "GMV (Gross)",
                "Discounts",
                "GST & Shipping",
                "Booked Net",
                "Cancellations",
                "Processed Refunds",
                "Net Realized Rev",
            ],
            y=[gmv, -discounts, tax_and_shipping, 0, -cancelled, -refunded, 0],
        ),
        row=1,
        col=2,
    )

    ch_ret = ret[ret["acquisition_channel"] != "ALL_CHANNELS_TOTAL"]
    for col_name, label in [
        ("d1_retention_pct", "D1 Retention %"),
        ("d7_retention_pct", "D7 Retention %"),
        ("d30_retention_pct", "D30 Retention %"),
    ]:
        fig.add_trace(
            go.Bar(x=ch_ret["acquisition_channel"], y=ch_ret[col_name], name=label),
            row=2,
            col=1,
        )

    fig.add_trace(
        go.Bar(
            x=ch["acquisition_channel"],
            y=ch["net_revenue_per_user_arpu_inr"],
            name="Net ARPU (₹)",
            text=[f"₹{v:,.0f}" for v in ch["net_revenue_per_user_arpu_inr"]],
            textposition="auto",
        ),
        row=2,
        col=2,
    )

    fig.update_layout(
        title_text=(
            "<b>E-commerce Growth Intelligence: Executive Dashboard Capture</b><br>"
            f"<sup>PostgreSQL 16 | {summary_line}</sup>"
        ),
        height=920,
        width=1400,
        template="plotly_white",
        showlegend=True,
    )

    html_path = DOCS_DIR / "dashboard_capture.html"
    fig.write_html(str(html_path), include_plotlyjs="cdn")

    # 2. High-DPI PNG Screenshot Capture (4-Panel Executive Overview)
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
    fig_mpl, axes = plt.subplots(2, 2, figsize=(16, 10), dpi=160)
    fig_mpl.suptitle(
        "E-commerce Growth Intelligence: PostgreSQL 16 Analytical Charts\n" + summary_line,
        fontsize=14,
        fontweight="bold",
        y=0.98,
    )

    # Panel 1: Strict Session Funnel
    ax1 = axes[0, 0]
    stages = funnel["stage_name"].tolist()[::-1]
    vals = (funnel["strict_sessions"] / 1000.0).tolist()[::-1]
    pcts = funnel["pct_of_total_sessions"].tolist()[::-1]
    bars1 = ax1.barh(stages, vals, color=["#16a34a", "#2563eb", "#3b82f6", "#60a5fa", "#1e40af"])
    ax1.set_title("1. Strict Chronological Session Funnel (Thousands)", fontweight="bold")
    ax1.set_xlabel("Sessions (k)")
    for bar, pct, raw_v in zip(bars1, pcts, funnel["strict_sessions"].tolist()[::-1]):
        ax1.text(
            bar.get_width() + 1.5,
            bar.get_y() + bar.get_height() / 2,
            f"{raw_v:,} ({pct:.1f}%)",
            va="center",
            fontsize=9,
            fontweight="bold",
        )
    ax1.set_xlim(0, 132)

    # Panel 2: Revenue Waterfall Components (INR Millions)
    ax2 = axes[0, 1]
    rev_labels = [
        "GMV\n(Gross)",
        f"Discounts\n(-{float(kpi['discount_rate_pct']):.1f}% GMV)",
        "Booked Net\n(incl GST/Ship)",
        f"Cancelled\n({float(kpi['cancellation_rate_pct']):.1f}% ord)",
        f"Refunded\n({float(kpi['refund_or_return_rate_pct']):.1f}% ord)",
        "Net Realized\nRevenue",
    ]
    rev_vals = [
        float(kpi["gross_merchandise_value_inr"]) / 1e6,
        -float(kpi["total_discounts_inr"]) / 1e6,
        float(kpi["booked_net_order_value_inr"]) / 1e6,
        -float(kpi["cancelled_order_value_inr"]) / 1e6,
        -float(kpi["processed_refunds_inr"]) / 1e6,
        float(kpi["net_realized_revenue_inr"]) / 1e6,
    ]
    colors2 = ["#2563eb", "#dc2626", "#0284c7", "#dc2626", "#ea580c", "#16a34a"]
    bars2 = ax2.bar(rev_labels, rev_vals, color=colors2)
    ax2.axhline(0, color="black", linewidth=0.8)
    ax2.set_title("2. GMV to Net Realized Revenue Bridge (INR Millions)", fontweight="bold")
    ax2.set_ylabel("INR Millions (₹M)")
    for bar, v in zip(bars2, rev_vals):
        y_pos = bar.get_height() + (1.8 if v >= 0 else -5.2)
        ax2.text(
            bar.get_x() + bar.get_width() / 2,
            y_pos,
            f"₹{v:+.2f}M" if v < 0 else f"₹{v:.2f}M",
            ha="center",
            fontsize=9,
            fontweight="bold",
        )
    ax2.set_ylim(-18, 86)

    # Panel 3: Exact D1 / D7 / D30 Retention by Channel
    ax3 = axes[1, 0]
    x = np.arange(len(ch_ret))
    w = 0.26
    ax3.bar(x - w, ch_ret["d1_retention_pct"], width=w, label="Exact D1 %", color="#3b82f6")
    ax3.bar(x, ch_ret["d7_retention_pct"], width=w, label="Exact D7 %", color="#8b5cf6")
    ax3.bar(x + w, ch_ret["d30_retention_pct"], width=w, label="Exact D30 %", color="#10b981")
    ax3.set_xticks(x)
    ax3.set_xticklabels(ch_ret["acquisition_channel"], rotation=20, ha="right")
    ax3.set_title("3. Exact D1 / D7 / D30 Cohort Retention by Acquisition Channel (%)", fontweight="bold")
    ax3.set_ylabel("Retention Rate (%)")
    ax3.legend()

    # Panel 4: Channel Net ARPU vs Discount %
    ax4 = axes[1, 1]
    bars4 = ax4.bar(
        ch["acquisition_channel"],
        ch["net_revenue_per_user_arpu_inr"],
        color=["#16a34a", "#2563eb", "#0d9488", "#6366f1", "#f59e0b", "#ef4444"],
    )
    ax4.set_title("4. Acquisition Channel Net Realized ARPU (INR)", fontweight="bold")
    ax4.set_ylabel("Net Realized ARPU (₹)")
    ax4.tick_params(axis="x", rotation=20)
    for bar, arpu, disc in zip(bars4, ch["net_revenue_per_user_arpu_inr"], ch["avg_discount_pct"]):
        ax4.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 25,
            f"₹{arpu:,.0f}\n({disc:.1f}% disc)",
            ha="center",
            fontsize=8.5,
            fontweight="bold",
        )
    ax4.set_ylim(0, 1550)

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    png1_path = SCREENSHOTS_DIR / "01_executive_dashboard_overview.png"
    fig_mpl.savefig(png1_path, dpi=160)
    plt.close(fig_mpl)

    # 3. Second High-DPI PNG Screenshot: Segment Friction & DAU Stickiness
    seg_sql = """
    WITH stage_ts AS (
        SELECT
            s.session_id,
            s.device_type || ' (' || s.app_version || ')' AS device_build,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS t_view,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS t_cart,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS t_chk,
            MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS t_buy
        FROM sessions s
        LEFT JOIN events e ON s.session_id = e.session_id
        GROUP BY 1, 2
    )
    SELECT
        device_build,
        ROUND(
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart)::NUMERIC
            / NULLIF(COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view), 0) * 100, 2
        ) AS cart_to_checkout_pct,
        ROUND(
            COUNT(*) FILTER (WHERE t_view IS NOT NULL AND t_cart > t_view AND t_chk > t_cart AND t_buy > t_chk)::NUMERIC
            / NULLIF(COUNT(*), 0) * 100, 2
        ) AS overall_cvr_pct
    FROM stage_ts
    GROUP BY 1
    ORDER BY cart_to_checkout_pct ASC;
    """
    seg_df = query_df(seg_sql)

    fig_mpl2, axes2 = plt.subplots(1, 2, figsize=(15, 5.5), dpi=160)
    fig_mpl2.suptitle(
        "Segment Conversion Bottlenecks (Device/App Build) & 6-Month DAU Rolling Stickiness",
        fontsize=13,
        fontweight="bold",
        y=0.98,
    )

    ax_s1 = axes2[0]
    x_s = np.arange(len(seg_df))
    ax_s1.bar(x_s - 0.18, seg_df["cart_to_checkout_pct"], width=0.35, label="Cart -> Checkout CVR %", color="#ef4444")
    ax_s1.bar(x_s + 0.18, seg_df["overall_cvr_pct"], width=0.35, label="Overall Session CVR %", color="#1d4ed8")
    ax_s1.set_xticks(x_s)
    ax_s1.set_xticklabels(seg_df["device_build"], rotation=15, ha="right")
    ax_s1.set_title("Cart -> Checkout Drop-Off by Device & App Build", fontweight="bold")
    ax_s1.set_ylabel("Conversion Rate (%)")
    ax_s1.legend()

    ax_s2 = axes2[1]
    ax_s2.plot(dau_df["activity_date"], dau_df["dau"], alpha=0.45, color="#93c5fd", label="Daily DAU")
    ax_s2.plot(dau_df["activity_date"], dau_df["dau_7d_moving_avg"], linewidth=2.2, color="#1e3a8a", label="7-Day Moving Avg DAU")
    ax_s2.set_title("Daily Active Users (DAU) & 7-Day Rolling Trend", fontweight="bold")
    ax_s2.set_ylabel("Active Users")
    ax_s2.legend()

    plt.tight_layout(rect=[0, 0, 1, 0.93])
    png2_path = SCREENSHOTS_DIR / "02_segment_friction_and_dau_trends.png"
    fig_mpl2.savefig(png2_path, dpi=160)
    plt.close(fig_mpl2)

    print(f"Saved interactive HTML capture: {html_path}")
    print(f"Saved PNG screenshot 1:         {png1_path}")
    print(f"Saved PNG screenshot 2:         {png2_path}")
    return [html_path, png1_path, png2_path]


if __name__ == "__main__":
    generate_dashboard_capture()
