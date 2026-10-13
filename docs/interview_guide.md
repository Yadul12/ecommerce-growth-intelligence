# Senior Product Analyst & Analytics Engineer Interview Guide

This guide provides **line-by-line explanations of the most important SQL queries** in the repository followed by **15 high-probability Senior Product Analyst interview questions and model answers**.

---

## Part 1: Line-by-Line SQL Query Walkthroughs

### 1. Strictly Ordered Session Funnel (`sql/02_strict_session_funnel.sql`)

```sql
WITH session_stage_timestamps AS (
    SELECT
        s.session_id,
        s.user_id,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'product_view')   AS first_view_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'add_to_cart')    AS first_cart_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'checkout_start') AS first_checkout_ts,
        MIN(e.event_ts) FILTER (WHERE e.event_type = 'purchase')       AS first_purchase_ts
    FROM sessions s
    LEFT JOIN events e ON s.session_id = e.session_id
    GROUP BY s.session_id, s.user_id
)
```
- **Lines 1–10 (`session_stage_timestamps` CTE):**
  - Performs a `LEFT JOIN` from `sessions` to `events` so sessions with zero events (bounces) are preserved in the top-of-funnel denominator (`1. Total Sessions`).
  - Uses PostgreSQL's `MIN(e.event_ts) FILTER (WHERE e.event_type = ...)` conditional aggregation to pivot multiple event rows per session into a single wide row containing the **earliest occurrence timestamp** of each funnel stage.

```sql
strict_vs_naive_flags AS (
    SELECT
        session_id,
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
        ...
```
- **Lines 12–36 (`strict_vs_naive_flags` CTE):**
  - Enforces **strict chronological ordering** (`first_view_ts < first_cart_ts < first_checkout_ts < first_purchase_ts`) inside the same `session_id`.
  - Also computes `naive_*` flags (`first_cart_ts IS NOT NULL`) so we can explicitly quantify `out_of_order_or_unattributed_sessions` (e.g., sessions where a user added an item from a saved wishlist without viewing a product page first).

```sql
    ROUND(
        strict_sessions::NUMERIC
        / NULLIF(LAG(strict_sessions) OVER (ORDER BY stage_order), 0) * 100,
        2
    ) AS stage_to_stage_conversion_pct
```
- **Window Denominator Calculation:**
  - `LAG(strict_sessions) OVER (ORDER BY stage_order)` retrieves the prior funnel stage's session count as the stage-to-stage denominator.
  - `FIRST_VALUE(strict_sessions) OVER (ORDER BY stage_order)` retrieves total sessions as the top-of-funnel denominator.
  - `NULLIF(..., 0)` prevents division-by-zero errors on empty segment slices.

---

### 2. Right-Censored D1 / D7 / D30 Cohort Retention (`sql/05_cohort_retention_d1_d7_d30.sql`)

```sql
WITH dataset_bounds AS (
    SELECT MAX(DATE(session_start_ts)) AS max_observed_date FROM sessions
),
user_cohort_base AS (
    SELECT
        u.user_id,
        DATE(u.signup_ts) AS cohort_date,
        u.acquisition_channel
    FROM users u
    CROSS JOIN dataset_bounds b
    WHERE DATE(u.signup_ts) <= (b.max_observed_date - INTERVAL '30 days')::DATE
)
```
- **Right-Censoring Guardrail:**
  - Filtering `WHERE DATE(u.signup_ts) <= (b.max_observed_date - INTERVAL '30 days')::DATE` ensures every user in the cohort denominator has had **at least 30 full calendar days** of observation window. Without this filter, recent signups artificially drag down D30 retention.

```sql
user_activity_offsets AS (
    SELECT DISTINCT
        c.user_id,
        c.acquisition_channel,
        (DATE(s.session_start_ts) - c.cohort_date) AS day_offset
    FROM user_cohort_base c
    LEFT JOIN sessions s
        ON c.user_id = s.user_id
       AND DATE(s.session_start_ts) > c.cohort_date
)
```
- **Day-Offset Calculation:**
  - Computes integer day differences `(DATE(s.session_start_ts) - c.cohort_date)` and deduplicates at `(user_id, day_offset)` so multiple sessions on the same day count once per user.
  - Uses `MAX(CASE WHEN day_offset = 7 THEN 1 ELSE 0 END)` followed by `AVG(...) * 100` across all eligible users in the cohort to compute exact D1, D7, D14, and D30 retention percentages.

---

### 3. Order Sequencing & Inter-Purchase Windows (`sql/06_repeat_purchase_and_ltv_windows.sql`)

- **`ROW_NUMBER() OVER (PARTITION BY o.user_id ORDER BY o.order_ts, o.order_id)`:** Assigns a deterministic `1st, 2nd, 3rd...` order sequence number per buyer.
- **`LAG(o.order_ts) OVER (...)` & `LEAD(o.order_ts) OVER (...)`:** Retrieves the previous and next order timestamps for each customer to calculate `avg_days_between_orders` (`EXTRACT(EPOCH FROM (order_ts - prev_order_ts)) / 86400.0`).
- **`FIRST_VALUE(s.primary_category) OVER (...)` & `LEAD(s.primary_category) OVER (...)`:** Identifies each customer's entry category ("anchor category") and their subsequent cross-sell category transition.
- **`SUM(o.net_amount_inr) OVER (PARTITION BY o.user_id ORDER BY o.order_ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`:** Computes the running cumulative LTV curve per customer after each order.

---

## Part 2: 15 Likely Senior Product Analyst Interview Questions & Answers

1. **Why build a strict timestamp-ordered session funnel (`t_view < t_cart < t_checkout < t_purchase`) instead of counting distinct sessions per event type?**
   - Unordered counts allow stage $k$ to include sessions that bypassed stage $k-1$ (e.g., adding to cart from a wishlist without a `product_view`), which can produce $>100\%$ stage-to-stage conversion or mask where real discovery-to-purchase drop-off occurs.

2. **When would a session-level funnel be misleading compared to a user-level windowed funnel?**
   - In high-AOV, long-consideration categories like `Electronics`, users frequently browse in Session 1, compare prices in Session 2, and purchase in Session 3. A session-level funnel treats Sessions 1 and 2 as drop-offs; pairing it with a 7-day user-level conversion window captures multi-session journeys.

3. **What is right-censoring in cohort retention, and how did you prevent it in SQL?**
   - Right-censoring happens when users who signed up 5 days ago are included in the denominator for D30 retention — since Day 30 hasn't happened yet for them, they are counted as "churned." We prevent this in `sql/05_cohort_retention_d1_d7_d30.sql` by restricting the cohort denominator to users where `signup_date <= max_observed_date - 30 days`.

4. **What is the difference between Exact Day-$N$ retention, Bounded Window retention, and Unbounded (Rolling) retention?**
   - **Exact Day-$N$:** Active specifically on Day $N$ (`day_offset = 7`). Best for measuring habit formation.
   - **Bounded Window:** Active at least once within a range (`day_offset BETWEEN 1 AND 7`).
   - **Unbounded / Rolling:** Active on Day $N$ or *any* day thereafter (`day_offset >= 7`). Often overstates stickiness because a single return on Day 85 marks the user as retained at D7, D14, and D30.

5. **Why is Gross Merchandise Value (GMV) insufficient as a North Star metric for Indian e-commerce?**
   - GMV ignores three massive leakage vectors: promotional discounts (`10%–22%`), Cash-on-Delivery (`COD`) doorstep cancellations/RTO (`~15%`), and post-delivery returns/refunds (`~16%` in Fashion). Optimizing for GMV incentivizes marketing teams to acquire low-intent discount/COD shoppers (`Paid_Social`) who destroy net contribution margin.

6. **In our data, `Android v4.1-legacy` has much higher latency (`>2,800 ms`) and lower Cart $\rightarrow$ Checkout conversion than `v4.8-stable`. Does this prove latency caused the drop-off?**
   - No. Observational data only shows correlation. Users who haven't updated their app may also own older low-memory phones, live in lower-connectivity Tier-2/3 areas, or have lower purchasing power. Proving causality requires a randomized A/B test (or quasi-experimental diff-in-diff around a forced update).

7. **Why should our Checkout A/B test randomize on `user_id` rather than `session_id`?**
   - If randomized by `session_id`, a single returning user could see the new single-sheet checkout in the morning and the old 3-step checkout in the evening, violating SUTVA (Stable Unit Treatment Value Assumption) and contaminating user behavior.

8. **If we randomize by `user_id` but our primary metric is Session Conversion Rate ($\frac{\text{Purchases}}{\text{Cart Sessions}}$), what statistical pitfall arises?**
   - Sessions from the same user are correlated, violating the independence assumption of a naive session-level Z-test and underestimating variance. We either define the metric at the randomization unit (`% of exposed users who complete a purchase`) or use the **Delta Method / cluster-robust standard errors** clustered at `user_id`.

9. **What is Simpson's Paradox, and how does `sql/03_funnel_segmentation_matrix.sql` guard against it?**
   - Simpson's Paradox occurs when an aggregate comparison between two groups reverses when stratified by a confounding variable (e.g., an acquisition channel appears to have low conversion only because 80% of its traffic lands on high-ticket `Electronics` or `Mobile_Web`). Stratifying across `(device_type, app_version, city_tier, primary_category)` exposes within-cell performance.

10. **How did you choose Primary vs. Guardrail metrics for the Checkout optimization experiment?**
    - **Primary Metric:** `add_to_cart` $\rightarrow$ `purchase` conversion rate (directly measures whether checkout friction decreased).
    - **Guardrail Metrics:** Payment failure rate, app crash rate, post-order cancellation rate (ensuring faster checkout doesn't create accidental/regret COD orders), and net margin per user.

11. **How did you calculate the required sample size for the A/B test?**
    - Using a two-sided two-proportion power formula ($\alpha = 0.05$, power $1 - \beta = 0.80$, baseline conversion $p_1$, and relative MDE of $+8\%$). Smaller MDEs require quadratically larger sample sizes ($n \propto \frac{1}{\Delta^2}$).

12. **What is Peeking in A/B testing, and how do you prevent false positives?**
    - Repeatedly checking $p < 0.05$ every day and stopping as soon as significance is crossed inflates false positives from 5% to 20%+. We prevent it by locking the sample size and duration (minimum 2 full weekly cycles) before launch, or using group-sequential testing boundaries (e.g., O'Brien-Fleming or mSPRT).

13. **Explain how `sql/09_data_quality_and_reconciliation.sql` validates financial integrity.**
    - It runs 10 automated assertions, including verifying zero orphan foreign keys, zero impossible chronological sequences (`session_end_ts < session_start_ts`, `refund_ts < order_ts`), exact header-to-line-item reconciliation (`ABS(orders.gross_amount_inr - SUM(order_items.line_total_inr)) <= 0.01`), and the net order accounting identity (`net = gross - discount + shipping + tax`).

14. **How did composite and covering indexes improve query performance in `sql/10_indexes_and_explain_analyze.sql`?**
    - Adding `CREATE INDEX idx_events_ts_covering ON events (event_ts) INCLUDE (session_id, event_type)` allows PostgreSQL to execute an **Index-Only Scan** on date-filtered funnel queries, reading only the compact index pages instead of scanning the entire `events` heap table.

15. **If leadership asks you whether to cut `Paid_Social` budget based on this analysis, what is your recommendation?**
    - Rather than cutting `Paid_Social` to zero, reallocate budget away from broad `SOCIAL22` discount-heavy campaigns in high-return `Fashion & Apparel` COD segments, and test landing `Paid_Social` traffic on high-repeat anchor categories (`Beauty & Personal Care`) with UPI-first checkout incentives, measuring 30-day **Net Realized LTV:CAC** rather than Day-0 CPAs.
