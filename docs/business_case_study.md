# Business Case Study: E-commerce Growth Intelligence — Funnel, Retention & Revenue Analytics

> **Data Provenance Note:** All metrics, statistical tests, and `EXPLAIN ANALYZE` benchmarks in this case study are generated directly from the live PostgreSQL 16 database (`ecommerce_growth`, deterministic synthetic seed `setseed(0.42)` / `SEED = 42`).

---

## 1. Executive Summary & Business Problem

Our Indian e-commerce platform recorded **50,000 registered users**, **110,000 browsing sessions**, **299,480 clickstream events**, and **25,923 orders** generating **₹6.85 Crore (₹68.53M) in Gross Merchandise Value (GMV)** and **₹7.34 Crore (₹73.39M) in Booked Net Order Value** (inclusive of GST and shipping).

However, SQL reconciliation (`sql/01_executive_kpis_and_reconciliation.sql`) reveals that **only ₹5.61 Crore (₹56.12M) converts into Net Realized Revenue**—representing a **₹1.73 Crore (23.5% of Booked Value) revenue leakage gap** driven by:
1. **Promotional Discounts:** ₹63.98 Lakhs (`9.34%` of GMV)
2. **Pre-Delivery Order Cancellations:** ₹93.94 Lakhs (`10.34%` of orders cancelled)
3. **Post-Delivery Processed Refunds:** ₹78.74 Lakhs (`15.60%` order return/refund rate)

Simultaneously, strict session-level funnel analysis (`sql/02_strict_session_funnel.sql`) shows that **40.17% of active shopping carts fail to initiate checkout** (`25,765` cart sessions lost), and 30-day cohort retention (`sql/05_cohort_retention_d1_d7_d30.sql`) drops to **5.96% exact D30 retention** (`41.42%` rolling 30-day active rate).

---

## 2. Methodology (SQL-First Analytical Architecture)

1. **Strict Chronological Session Funnel (`sql/02_strict_session_funnel.sql`):**
   - Enforces `first_view_ts < first_cart_ts < first_checkout_ts < first_purchase_ts` within each `session_id` using conditional aggregation (`MIN(event_ts) FILTER (WHERE ...)`).
   - Separates **1,548 out-of-order / saved-cart sessions** (`65,686` naive cart sessions vs. `64,138` strict cart sessions) so stage conversion denominators are never distorted by wishlist additions.
2. **Multi-Dimensional Segment Stratification (`sql/03_funnel_segmentation_matrix.sql`):**
   - Stratifies funnel conversion across `(device_type, app_version, city_tier, primary_category)` to avoid Simpson's Paradox and isolate specific client builds and geographies driving drop-off.
3. **Right-Censoring-Guarded Cohort Retention (`sql/05_cohort_retention_d1_d7_d30.sql`):**
   - Restricts cohort denominators to users with $\ge 30$ days of observation window before `MAX(DATE(session_start_ts))`, reporting both exact Day-$N$ (`D1`, `D7`, `D14`, `D30`) and bounded rolling retention (`rolling_7d_active_pct`, `rolling_30d_active_pct`).
4. **Window-Function Order Sequencing (`sql/06_repeat_purchase_and_ltv_windows.sql`):**
   - Applies `ROW_NUMBER()`, `LAG()`, `LEAD()`, `FIRST_VALUE()`, and cumulative `SUM() OVER ()` to measure inter-purchase intervals and realized customer LTV.

---

## 3. Empirical Findings from PostgreSQL

### 3.1 Funnel Drop-Off & Segment Gaps (`sql/02` & `sql/03`)

| Stage Order | Funnel Stage | Strict Sessions | Naive Sessions | Out-of-Order Sessions | % of Total Sessions | Stage-to-Stage Conversion | Stage Drop-Off % | Sessions Lost |
| :---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | **Total Sessions** | 110,000 | 110,000 | 0 | 100.00% | — | — | — |
| 2 | **Product View** | 105,360 | 105,360 | 0 | 95.78% | 95.78% | 4.22% | 4,640 |
| 3 | **Add to Cart** | 64,138 | 65,686 | 1,548 | 58.31% | 60.88% | 39.12% | 41,222 |
| 4 | **Checkout Start** | 38,373 | 38,373 | 0 | 34.88% | **59.83%** | **40.17%** | **25,765** |
| 5 | **Purchase Completed** | 25,923 | 25,923 | 0 | 23.57% | 67.56% | 32.44% | 12,450 |

- **Highest Relative Drop-Off Stage:** **`Add to Cart -> Checkout Start`** loses **40.17% of cart sessions** (`25,765` high-intent sessions abandoned before checkout initiation), closely followed by `Product View -> Add to Cart` (`39.12%` drop-off).
- **Largest Segment Conversion Gap (`Android v4.1-legacy` vs. `Android v4.8-stable`):**
  - **Android `v4.1-legacy`** (`~3,540 ms` average page load): **`48.92%`** Cart $\rightarrow$ Checkout conversion (`5,228 / 10,686` cart sessions).
  - **Android `v4.8-stable`** (`~1,450 ms` average page load): **`60.65%`** Cart $\rightarrow$ Checkout conversion (`13,640 / 22,491` cart sessions).
  - **Two-Proportion Z-Test (`src/analytics.py`):** **$-11.72\text{ pp}$ gap** ($95\%\text{ CI}: [-12.86\text{ pp}, -10.58\text{ pp}]$, $Z = -20.15$, $p < 10^{-89}$).
- **Geography & Mobile Web Friction:** `Mobile_Web` sessions in `Tier_2` and `Tier_3` cities browsing `Electronics` (`avg_latency_ms = 3,052 ms`) convert at just **8.01% overall session CVR** ($-15.56\text{ pp}$ below the `23.57%` platform baseline).

### 3.2 Cohort Retention & Acquisition Channel Quality (`sql/05` & `sql/07`)

| Acquisition Channel | Acquired Users | User CVR % | Orders | GMV (₹) | Net Realized Revenue (₹) | Net AOV (₹) | **Net ARPU (₹)** | Avg Discount % | Order Refund Rate % | Exact D1 / D7 / D30 Retention % |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| **Direct** | 7,000 | 36.86% | 4,065 | ₹10.28M | ₹9.27M | ₹2,468.65 | **₹1,324.96** | 2.86% | 15.55% | 4.23% / 11.64% / 3.13% |
| **Organic_Search** | 13,000 | 34.45% | 6,563 | ₹17.79M | ₹16.83M | ₹2,759.14 | **₹1,294.67** | 2.68% | 12.52% | 9.41% / **14.08%** / 6.81% |
| **Referral** | 5,500 | 36.91% | 3,020 | ₹8.31M | ₹7.05M | ₹2,695.78 | **₹1,281.72** | 2.75% | 13.21% | **23.53%** / 8.82% / 8.20% |
| **Paid_Search** | 9,000 | 43.44% | 5,121 | ₹13.16M | ₹11.46M | ₹2,395.09 | **₹1,273.39** | 10.01% | 14.35% | 11.87% / 9.41% / **9.48%** |
| **Influencer** | 4,500 | 45.33% | 2,820 | ₹7.63M | ₹4.61M | ₹1,948.60 | **₹1,025.40** | **21.48%** | **20.00%** | 12.38% / 1.84% / 2.18% |
| **Paid_Social** | 11,000 | 22.31% | 4,334 | ₹11.37M | ₹6.77M | ₹1,873.00 | **₹615.88** | **21.48%** | **20.58%** | 9.75% / 5.54% / 4.30% |

- **Revenue Leakage Insight (`sql/08_revenue_leakage_diagnostics.sql`):**
  - `Paid_Social` generates **₹1.14 Crore in GMV**, but after **21.48% promotional discounts (`SOCIAL22`)**, **25.5%–27.7% COD cancellation rates**, and **20.58% order refund rates**, it yields only **₹67.75 Lakhs in Net Realized Revenue** (**₹615.88 Net ARPU** — less than half of `Organic_Search` at **₹1,294.67**).

### 3.3 Query Performance Optimization (`sql/10_indexes_and_explain_analyze.sql`)
Running `EXPLAIN (ANALYZE, BUFFERS)` on the 14-day session funnel aggregation query over `299,480` events:
- **Unindexed Baseline (`Seq Scan on events e`):** Scanned all `299,480` rows, discarded `277,236` rows via filter (`Buffers: shared hit=4532`), completing in **`26.510 ms`**.
- **Indexed (`Bitmap Index Scan on idx_events_ts_covering`):** Eliminated full-table scan (`Rows Removed by Filter: 0`, `Heap Blocks: exact=4033`), completing in **`13.829 ms`** (**47.8% execution time reduction**).

---

## 4. Descriptive Correlation vs. Causal Evidence & Limitations

1. **Correlation vs. Causation:**
   - The $-11.72\text{ pp}$ Cart $\rightarrow$ Checkout gap on `Android v4.1-legacy` is strongly correlated with client latency (`~3,540 ms` vs. `~1,450 ms`), but **observational SQL cannot prove causality alone**. Users on older app builds may also have budget hardware or weaker cellular networks in Tier-2/3 areas.
   - Similarly, high cancellation rates on `COD + SOCIAL22` orders reflect both payment-method friction (doorstep cash refusal) and audience selection bias (low-intent impulse buyers attracted by 22% off ads).
2. **Dataset Limitations:**
   - The dataset is deterministically generated (`SEED = 42`) and models logged-in sessions (`1 user_id : N session_id`). Real production environments require anonymous-to-authenticated identity stitching, multi-touch marketing attribution, and seasonal festival adjustments (e.g., Diwali / Big Billion Days).

---

## 5. Addressable Opportunity Sizing & 3 Product Recommendations

### Transparent Opportunity Math (6-Month Run-Rate Basis)

| Initiative | Target Segment Base | Baseline Metric | Conservative Assumed Lift | Transparent Calculation Formula | Estimated 6-Month Net Realized Revenue Opportunity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Lightweight Single-Sheet Checkout & App Update Prompt** (`Android v4.1-legacy` & `Mobile_Web`) | `10,686` legacy Android cart sessions + `10,938` Mobile Web cart sessions = **`21,624` cart sessions** | `48.92%` Cart $\rightarrow$ Checkout CVR | **+5.0 pp** Cart $\rightarrow$ Checkout lift ($\times 67.56\%$ Checkout $\rightarrow$ Purchase $\times 74.1\%$ Net Realized Order rate) | $21,624 \times 0.05 \times 0.6756 \times 0.741 \approx +541$ net completed orders $\times$ ₹2,831 AOV | **~₹15.32 Lakhs** |
| **2. COD-to-UPI Instant ₹30 Switch Incentive + WhatsApp COD Verification** | **`3,697` COD + `SOCIAL22` orders** across categories (`26.5%` avg cancellation rate) | `26.5%` COD cancellation rate (`₹31.72 Lakhs` cancelled value) | **-6.0 pp** absolute reduction in COD cancellations (recovering ~22.6% of cancelled COD orders) | $3,697 \times 0.06 \approx +222$ saved orders $\times$ (₹1,910 avg net order $-\ ₹30$ UPI incentive) | **~₹4.17 Lakhs** |
| **3. D3–D7 Post-Purchase Cohort Reactivation Trigger** (`Paid_Social` & `Influencer` 1st-time buyers) | **`4,494` converting buyers** in `Paid_Social` + `Influencer` | `3.5%` D30 retention / low repeat realization | **+3.5 pp** incremental repeat buyer conversion within 30 days | $4,494 \times 0.035 \approx +157$ incremental completed orders $\times$ ₹1,900 Net AOV | **~₹2.98 Lakhs** |

---

### Metric Framework for the 3 Recommendations

| Recommendation | Primary Metric | Guardrail Metrics |
| :--- | :--- | :--- |
| **Rec 1: Single-Sheet Checkout & Dynamic Free-Shipping Threshold Bar** | `add_to_cart` $\rightarrow$ `checkout_start` CVR & `add_to_cart` $\rightarrow$ `purchase` CVR | 1. Payment gateway failure rate<br>2. Client crash/ANR rate<br>3. Post-purchase cancellation rate |
| **Rec 2: Smart COD Risk Gate & Instant ₹30 UPI Switch Nudge** | Net Completed Order Rate ($\frac{\text{Completed Orders}}{\text{Checkout Sessions}}$) & COD Cancellation Rate | 1. Checkout $\rightarrow$ Purchase CVR (ensure COD friction doesn't depress total orders)<br>2. Total discount + incentive % of GMV |
| **Rec 3: D7 Replenishment & Cross-Category Habit Loop** | Exact D7 / D30 Cohort Retention & 30-Day Repeat Purchase Rate | 1. Promotional discount % of GMV<br>2. Push/WhatsApp opt-out rate |

---

## 6. A/B Test Proposal: Lightweight Single-Sheet Checkout (Rec #1)

- **Experiment Name:** `exp_checkout_singlesheet_v1`
- **Target Population:** Users on `Android` or `Mobile_Web` who trigger an `add_to_cart` event.
- **Randomization Unit:** `user_id` (50% Control: existing multi-step checkout; 50% Treatment: single-sheet bottom drawer checkout with pre-fetched UPI apps and live free-shipping bar).
- **Sample Size & Power Calculation (`src/analytics.py`):**
  - Baseline `add_to_cart` $\rightarrow$ `checkout_start` rate in `Android v4.1-legacy`: **$48.92\%$**
  - Minimum Detectable Effect (MDE): **+8.0% relative lift** ($48.92\% \rightarrow 52.84\%$, $+3.91\text{ pp}$ absolute lift)
  - Significance Level ($\alpha = 0.05$, two-sided) & Power ($1 - \beta = 0.80$)
  - **Required Sample Size:** **2,560 cart sessions per arm** (**5,120 total eligible cart sessions**).
  - **Recommended Duration:** **14 full calendar days** (2 weekly cycles) to account for weekend shopping seasonality and allow 7 days post-order to verify cancellation guardrails.
