# Data Dictionary & Metric Definitions

> **Synthetic Data Disclaimer:** All records in this database are **100% synthetic** (`setseed(0.42)` / `SEED = 42`), designed to simulate 6 months of user acquisition, session browsing, checkout events, orders, and post-delivery refunds on a large Indian e-commerce platform.

---

## 1. Relational Schema Dictionary

### 1.1 `users` (Customer Master Table — 50,000 Rows)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `user_id` | `BIGINT` | `PRIMARY KEY` | Unique customer identifier (`1..50,000`). |
| `signup_ts` | `TIMESTAMP` | `NOT NULL` | Registration timestamp. |
| `acquisition_channel` | `VARCHAR(32)` | `NOT NULL`, `CHECK` | Attribution channel (`Organic_Search`, `Paid_Search`, `Paid_Social`, `Referral`, `Direct`, `Influencer`). |
| `signup_device` | `VARCHAR(24)` | `NOT NULL`, `CHECK` | Primary registration device (`Android`, `iOS`, `Mobile_Web`, `Desktop_Web`). |
| `city` | `VARCHAR(48)` | `NOT NULL` | Customer city (Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai, Pune, Ahmedabad, Jaipur, Lucknow, Kochi, Surat, Indore). |
| `city_tier` | `VARCHAR(16)` | `NOT NULL`, `CHECK` | Indian urban classification (`Tier_1`, `Tier_2`, `Tier_3`). |
| `state` | `VARCHAR(48)` | `NOT NULL` | Indian state name. |
| `is_verified_phone` | `BOOLEAN` | `NOT NULL` | Whether mobile OTP verification completed. |

### 1.2 `products` (Catalog SKU Table — 10,000 Rows)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `product_id` | `BIGINT` | `PRIMARY KEY` | Unique product identifier (`1..10,000`). |
| `sku` | `VARCHAR(32)` | `UNIQUE NOT NULL` | Formatted SKU code (`SKU-IN-000001`). |
| `product_name` | `VARCHAR(120)` | `NOT NULL` | Display product title. |
| `category` | `VARCHAR(48)` | `NOT NULL`, `CHECK` | Top-level category (`Electronics`, `Fashion & Apparel`, `Home & Kitchen`, `Beauty & Personal Care`, `Grocery & Essentials`, `Footwear & Accessories`). |
| `subcategory` | `VARCHAR(64)` | `NOT NULL` | Subcategory label. |
| `brand_tier` | `VARCHAR(24)` | `NOT NULL`, `CHECK` | Brand positioning (`Value`, `Mid_Market`, `Premium`). |
| `mrp_inr` | `NUMERIC(12,2)` | `> 0` | Maximum Retail Price in INR (`₹`). |
| `base_price_inr` | `NUMERIC(12,2)` | `<= mrp_inr` | Platform selling price before promotional coupons (`₹`). |
| `cost_inr` | `NUMERIC(12,2)` | `<= base_price_inr` | Cost of goods sold (COGS) in INR (`₹`). |
| `is_active` | `BOOLEAN` | `NOT NULL` | Whether listed in active catalog. |
| `created_at` | `TIMESTAMP` | `NOT NULL` | SKU onboarding timestamp. |

### 1.3 `sessions` (Browsing Sessions — 110,000 Rows)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `session_id` | `BIGINT` | `PRIMARY KEY` | Unique session identifier (`1..110,000`). |
| `user_id` | `BIGINT` | `FK -> users` | Customer associated with session. |
| `session_start_ts` | `TIMESTAMP` | `NOT NULL` | Session start timestamp. |
| `session_end_ts` | `TIMESTAMP` | `>= session_start_ts` | Session end timestamp. |
| `device_type` | `VARCHAR(24)` | `NOT NULL` | Session device (`Android`, `iOS`, `Mobile_Web`, `Desktop_Web`). |
| `app_version` | `VARCHAR(24)` | `NOT NULL` | Client release (`v4.1-legacy`, `v4.8-stable`, `v5.2-ios`, `web-2025.4`). |
| `acquisition_channel` | `VARCHAR(32)` | `NOT NULL` | User acquisition channel. |
| `utm_campaign` | `VARCHAR(64)` | `NULLABLE` | Marketing campaign tag. |
| `city` / `city_tier` | `VARCHAR` | `NOT NULL` | Geographic attributes. |
| `primary_category` | `VARCHAR(48)` | `NOT NULL` | Primary product category browsed during the session. |

### 1.4 `events` (Funnel Clickstream Events — ~295,000+ Rows)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `event_id` | `BIGINT` | `PRIMARY KEY` | Unique event identifier. |
| `session_id` | `BIGINT` | `FK -> sessions` | Parent session identifier. |
| `user_id` | `BIGINT` | `FK -> users` | Customer identifier. |
| `product_id` | `BIGINT` | `FK -> products` | Product interacted with. |
| `event_type` | `VARCHAR(32)` | `CHECK` | Funnel stage (`product_view`, `add_to_cart`, `checkout_start`, `purchase`). |
| `event_ts` | `TIMESTAMP` | `NOT NULL` | Exact event occurrence timestamp. |
| `sequence_num` | `SMALLINT` | `>= 1` | Intra-session sequence index. |
| `page_load_ms` | `INTEGER` | `> 0` | Client-side page/screen load time in milliseconds. |
| `device_type` / `category` | `VARCHAR` | `NOT NULL` | Denormalized session dimensions for fast analytical slicing. |

### 1.5 `orders`, `order_items`, and `refunds`
- **`orders` (~26,000+ rows):** One row per completed checkout (`order_id`, `session_id`, `user_id`, `order_ts`, `order_status` [`completed`, `cancelled`, `returned`, `refunded`], `payment_method` [`UPI`, `COD`, `Credit_Card`, `Debit_Card`, `Wallet`], `gross_amount_inr`, `discount_amount_inr`, `shipping_fee_inr`, `tax_amount_inr`, `net_amount_inr`, `coupon_code`, `cancellation_reason`, `delivery_ts`).
- **`order_items` (~38,500+ rows):** Line items (`order_item_id`, `order_id`, `product_id`, `category`, `quantity`, `unit_price_inr`, `item_discount_inr`, `line_total_inr`) whose sum reconciles exactly to `orders.gross_amount_inr`.
- **`refunds` (~3,100+ rows):** Post-delivery refund records (`refund_id`, `order_id`, `user_id`, `refund_ts`, `refund_amount_inr`, `refund_reason`, `refund_status`).

---

## 2. Standard Metric Definitions

1. **Strict Session Funnel Conversion ($CVR_{k-1 \to k}$):**
   $$\text{Stage Conversion}_{k-1 \to k} = \frac{\text{Sessions with } t_{\text{view}} < t_{\text{cart}} < \dots < t_k}{\text{Sessions with } t_{\text{view}} < \dots < t_{k-1}} \times 100\%$$
2. **Exact Day-$N$ Cohort Retention ($D_1, D_7, D_{14}, D_{30}$):**
   - **Cohort ($C$):** Registered users grouped by `DATE(signup_ts)` with at least 30 days of observation window prior to the dataset end date (`max_observed_date - INTERVAL '30 days'`).
   - **Numerator:** Distinct users in Cohort $C$ with at least one session where `DATE(session_start_ts) - DATE(signup_ts) = N`.
3. **Stickiness Ratio (`DAU / WAU` & `DAU / MAU`):**
   - Ratio of distinct daily active users on date $t$ to distinct weekly or monthly active users in the corresponding ISO week or calendar month.
4. **Repeat Purchase Rate (RPR):**
   - Percentage of distinct buyers (with $\ge 1$ non-cancelled order) who complete $\ge 2$ non-cancelled orders.
5. **Revenue Bridge (INR `₹`):**
   - **GMV:** $\sum \text{gross\_amount\_inr}$ across all placed orders.
   - **Booked Net Order Value:** $\text{GMV} - \text{Discounts} + \text{Shipping Fees} + \text{GST (18\%)}$.
   - **Net Realized Revenue:** Booked Net Order Value of `completed` orders plus non-refunded portion of `returned`/`refunded` orders (excluding `cancelled` orders and `processed` refunds).
