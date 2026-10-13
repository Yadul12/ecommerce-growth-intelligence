-- =============================================================================
-- FILE: sql/seed_data.sql
-- PURPOSE: Deterministic, fast, in-database synthetic data generation
--          using PostgreSQL setseed(0.42) and generate_series.
-- VOLUMES:
--   - users:       50,000
--   - products:    10,000
--   - sessions:   110,000
--   - events:    ~295,000 (strictly > 150,000 requirement)
--   - orders:     ~26,000 (strictly > 25,000 requirement)
--   - order_items:~38,500
--   - refunds:     ~3,100
-- =============================================================================

BEGIN;

SELECT setseed(0.42);

TRUNCATE TABLE refunds, order_items, orders, events, sessions, products, users RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- 1. SEED 50,000 USERS
-- -----------------------------------------------------------------------------
WITH city_lookup AS (
    SELECT * FROM (VALUES
        (1,  'Bengaluru',  'Tier_1', 'Karnataka'),
        (2,  'Mumbai',     'Tier_1', 'Maharashtra'),
        (3,  'Delhi NCR',  'Tier_1', 'Delhi'),
        (4,  'Hyderabad',  'Tier_1', 'Telangana'),
        (5,  'Chennai',    'Tier_1', 'Tamil Nadu'),
        (6,  'Pune',       'Tier_1', 'Maharashtra'),
        (7,  'Ahmedabad',  'Tier_2', 'Gujarat'),
        (8,  'Jaipur',     'Tier_2', 'Rajasthan'),
        (9,  'Lucknow',    'Tier_2', 'Uttar Pradesh'),
        (10, 'Kochi',      'Tier_2', 'Kerala'),
        (11, 'Surat',      'Tier_3', 'Gujarat'),
        (12, 'Indore',     'Tier_3', 'Madhya Pradesh')
    ) AS t(idx, city, city_tier, state)
)
INSERT INTO users (
    user_id, signup_ts, acquisition_channel, signup_device,
    city, city_tier, state, is_verified_phone
)
SELECT
    g.id AS user_id,
    TIMESTAMP '2025-01-01 00:00:00'
        + ((g.id * 37) % 180) * INTERVAL '1 day'
        + ((g.id * 101) % 86400) * INTERVAL '1 second' AS signup_ts,
    CASE
        WHEN (g.id % 100) < 26 THEN 'Organic_Search'
        WHEN (g.id % 100) < 48 THEN 'Paid_Social'
        WHEN (g.id % 100) < 66 THEN 'Paid_Search'
        WHEN (g.id % 100) < 80 THEN 'Direct'
        WHEN (g.id % 100) < 91 THEN 'Referral'
        ELSE 'Influencer'
    END AS acquisition_channel,
    CASE
        WHEN (g.id % 100) < 52 THEN 'Android'
        WHEN (g.id % 100) < 74 THEN 'Mobile_Web'
        WHEN (g.id % 100) < 88 THEN 'iOS'
        ELSE 'Desktop_Web'
    END AS signup_device,
    c.city,
    c.city_tier,
    c.state,
    ((g.id % 100) < 96) AS is_verified_phone
FROM generate_series(1, 50000) AS g(id)
JOIN city_lookup c
  ON c.idx = (
      CASE
          WHEN (g.id % 100) < 55 THEN 1 + (g.id % 6)
          WHEN (g.id % 100) < 83 THEN 7 + (g.id % 4)
          ELSE 11 + (g.id % 2)
      END
  );

-- -----------------------------------------------------------------------------
-- 2. SEED 10,000 PRODUCTS
-- -----------------------------------------------------------------------------
INSERT INTO products (
    product_id, sku, product_name, category, subcategory,
    brand_tier, mrp_inr, base_price_inr, cost_inr, is_active, created_at
)
SELECT
    p.id AS product_id,
    'SKU-IN-' || LPAD(p.id::TEXT, 6, '0') AS sku,
    cat.category || ' Item #' || p.id AS product_name,
    cat.category,
    cat.subcategory,
    CASE
        WHEN (p.id % 10) < 5 THEN 'Value'
        WHEN (p.id % 10) < 8 THEN 'Mid_Market'
        ELSE 'Premium'
    END AS brand_tier,
    ROUND((cat.base_anchor * (0.75 + ((p.id * 19) % 100) / 100.0) * 1.25)::NUMERIC, 2) AS mrp_inr,
    ROUND((cat.base_anchor * (0.75 + ((p.id * 19) % 100) / 100.0))::NUMERIC, 2) AS base_price_inr,
    ROUND((cat.base_anchor * (0.75 + ((p.id * 19) % 100) / 100.0) * cat.cost_ratio)::NUMERIC, 2) AS cost_inr,
    ((p.id % 50) <> 0) AS is_active,
    TIMESTAMP '2024-11-01 00:00:00' + (p.id % 60) * INTERVAL '1 day' AS created_at
FROM generate_series(1, 10000) AS p(id)
CROSS JOIN LATERAL (
    SELECT
        CASE (p.id % 6)
            WHEN 0 THEN 'Fashion & Apparel'
            WHEN 1 THEN 'Electronics'
            WHEN 2 THEN 'Beauty & Personal Care'
            WHEN 3 THEN 'Home & Kitchen'
            WHEN 4 THEN 'Grocery & Essentials'
            ELSE 'Footwear & Accessories'
        END AS category,
        CASE (p.id % 6)
            WHEN 0 THEN 'Ethnic & Casual Wear'
            WHEN 1 THEN 'Audio & Smart Accessories'
            WHEN 2 THEN 'Skincare & Grooming'
            WHEN 3 THEN 'Cookware & Organizers'
            WHEN 4 THEN 'Staples & Snacks'
            ELSE 'Sneakers & Sandals'
        END AS subcategory,
        CASE (p.id % 6)
            WHEN 0 THEN 950.0
            WHEN 1 THEN 2400.0
            WHEN 2 THEN 520.0
            WHEN 3 THEN 1350.0
            WHEN 4 THEN 380.0
            ELSE 1150.0
        END AS base_anchor,
        CASE (p.id % 6)
            WHEN 0 THEN 0.48
            WHEN 1 THEN 0.72
            WHEN 2 THEN 0.42
            WHEN 3 THEN 0.58
            WHEN 4 THEN 0.76
            ELSE 0.52
        END AS cost_ratio
) cat;

-- -----------------------------------------------------------------------------
-- 3. SEED 110,000 SESSIONS
-- -----------------------------------------------------------------------------
INSERT INTO sessions (
    session_id, user_id, session_start_ts, session_end_ts,
    device_type, app_version, acquisition_channel, utm_campaign,
    city, city_tier, primary_category
)
SELECT
    s.session_id,
    u.user_id,
    s.session_start_ts,
    s.session_start_ts + ((120 + (s.session_id * 29) % 900) * INTERVAL '1 second') AS session_end_ts,
    u.signup_device AS device_type,
    CASE
        WHEN u.signup_device = 'Android' AND (s.session_id % 10) < 3 THEN 'v4.1-legacy'
        WHEN u.signup_device = 'Android' THEN 'v4.8-stable'
        WHEN u.signup_device = 'iOS' THEN 'v5.2-ios'
        ELSE 'web-2025.4'
    END AS app_version,
    u.acquisition_channel,
    'cmp_' || LOWER(u.acquisition_channel) || '_q' || (1 + (EXTRACT(MONTH FROM s.session_start_ts)::INT - 1) / 3),
    u.city,
    u.city_tier,
    CASE ((s.session_id + u.user_id) % 6)
        WHEN 0 THEN 'Fashion & Apparel'
        WHEN 1 THEN 'Electronics'
        WHEN 2 THEN 'Beauty & Personal Care'
        WHEN 3 THEN 'Home & Kitchen'
        WHEN 4 THEN 'Grocery & Essentials'
        ELSE 'Footwear & Accessories'
    END AS primary_category
FROM (
    SELECT
        u1.user_id AS session_id,
        u1.user_id,
        u1.signup_ts + ((u1.user_id % 45) * INTERVAL '1 minute') AS session_start_ts
    FROM users u1

    UNION ALL

    SELECT
        50000 + r.seq AS session_id,
        target_u.user_id,
        target_u.signup_ts
            + (
                CASE
                    WHEN (r.seq % 100) < 28 THEN 1
                    WHEN (r.seq % 100) < 52 THEN 7
                    WHEN (r.seq % 100) < 68 THEN 14
                    WHEN (r.seq % 100) < 84 THEN 30
                    ELSE 2 + ((r.seq * 13) % 45)
                END
              ) * INTERVAL '1 day'
            + ((r.seq * 53) % 43200) * INTERVAL '1 second' AS session_start_ts
    FROM generate_series(1, 60000) AS r(seq)
    CROSS JOIN LATERAL (
        SELECT
            CASE
                WHEN (r.seq % 10) < 6 THEN 1 + ((r.seq * 7) % 35000)
                ELSE 1 + ((r.seq * 31) % 50000)
            END AS user_id
    ) mapped
    JOIN users target_u ON target_u.user_id = mapped.user_id
) s
JOIN users u ON u.user_id = s.user_id;

-- -----------------------------------------------------------------------------
-- 4. SEED STRICTLY ORDERED FUNNEL EVENTS (~295,000+ rows)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_session_funnel AS
SELECT
    s.session_id,
    s.user_id,
    s.session_start_ts,
    s.device_type,
    s.app_version,
    s.acquisition_channel,
    s.city_tier,
    s.primary_category,
    (((s.session_id * 17) % 1660) * 6 +
        CASE s.primary_category
            WHEN 'Fashion & Apparel' THEN 6
            WHEN 'Electronics' THEN 1
            WHEN 'Beauty & Personal Care' THEN 2
            WHEN 'Home & Kitchen' THEN 3
            WHEN 'Grocery & Essentials' THEN 4
            ELSE 5
        END
    ) AS product_id,
    CASE
        WHEN s.app_version = 'v4.1-legacy' THEN 2800 + (s.session_id % 1400)
        WHEN s.device_type = 'Mobile_Web' AND s.city_tier IN ('Tier_2', 'Tier_3') THEN 2400 + (s.session_id % 1200)
        WHEN s.device_type = 'iOS' THEN 750 + (s.session_id % 500)
        ELSE 1100 + (s.session_id % 700)
    END AS base_latency_ms,
    ((s.session_id * 313 + s.user_id * 17) % 1000) AS funnel_roll
FROM sessions s;

CREATE TEMP TABLE tmp_session_flags AS
SELECT
    f.*,
    (f.funnel_roll < 960) AS has_view,
    (f.funnel_roll < (
        580
        + CASE WHEN f.primary_category IN ('Grocery & Essentials', 'Beauty & Personal Care') THEN 65 ELSE 0 END
        - CASE WHEN f.primary_category = 'Electronics' THEN 75 ELSE 0 END
        - CASE WHEN f.device_type = 'Mobile_Web' THEN 55 ELSE 0 END
    )) AS has_cart,
    (f.funnel_roll < (
        365
        + CASE WHEN f.primary_category IN ('Grocery & Essentials', 'Beauty & Personal Care') THEN 55 ELSE 0 END
        - CASE WHEN f.primary_category = 'Electronics' THEN 65 ELSE 0 END
        - CASE WHEN f.app_version = 'v4.1-legacy' THEN 115 ELSE 0 END
        - CASE WHEN f.device_type = 'Mobile_Web' THEN 85 ELSE 0 END
        - CASE WHEN f.city_tier = 'Tier_3' THEN 45 ELSE 0 END
        + CASE WHEN f.acquisition_channel IN ('Referral', 'Organic_Search') THEN 35 ELSE 0 END
    )) AS has_checkout,
    (f.funnel_roll < (
        258
        + CASE WHEN f.primary_category IN ('Grocery & Essentials', 'Beauty & Personal Care') THEN 45 ELSE 0 END
        - CASE WHEN f.primary_category = 'Electronics' THEN 52 ELSE 0 END
        - CASE WHEN f.app_version = 'v4.1-legacy' THEN 95 ELSE 0 END
        - CASE WHEN f.device_type = 'Mobile_Web' THEN 70 ELSE 0 END
        - CASE WHEN f.city_tier = 'Tier_3' THEN 35 ELSE 0 END
        + CASE WHEN f.acquisition_channel IN ('Referral', 'Organic_Search') THEN 32 ELSE 0 END
        - CASE WHEN f.acquisition_channel = 'Paid_Social' THEN 22 ELSE 0 END
    )) AS has_purchase
FROM tmp_session_funnel f;

INSERT INTO events (
    event_id, session_id, user_id, product_id, event_type,
    event_ts, sequence_num, page_load_ms, device_type, category
)
SELECT
    ROW_NUMBER() OVER (ORDER BY e.session_id, e.sequence_num) AS event_id,
    e.session_id,
    e.user_id,
    LEAST(GREATEST(e.product_id, 1), 10000) AS product_id,
    e.event_type,
    e.event_ts,
    e.sequence_num,
    e.page_load_ms,
    e.device_type,
    e.primary_category
FROM (
    SELECT
        session_id, user_id, product_id,
        'product_view'::VARCHAR(32) AS event_type,
        session_start_ts + INTERVAL '8 seconds' AS event_ts,
        1::SMALLINT AS sequence_num,
        base_latency_ms AS page_load_ms,
        device_type, primary_category
    FROM tmp_session_flags
    WHERE has_view

    UNION ALL

    SELECT
        session_id, user_id, product_id,
        'add_to_cart'::VARCHAR(32) AS event_type,
        session_start_ts + INTERVAL '45 seconds' AS event_ts,
        2::SMALLINT AS sequence_num,
        base_latency_ms + 150 AS page_load_ms,
        device_type, primary_category
    FROM tmp_session_flags
    WHERE has_cart OR (NOT has_view AND (session_id % 3) = 0)

    UNION ALL

    SELECT
        session_id, user_id, product_id,
        'checkout_start'::VARCHAR(32) AS event_type,
        session_start_ts + INTERVAL '110 seconds' AS event_ts,
        3::SMALLINT AS sequence_num,
        base_latency_ms + 320 AS page_load_ms,
        device_type, primary_category
    FROM tmp_session_flags
    WHERE has_view AND has_cart AND has_checkout

    UNION ALL

    SELECT
        session_id, user_id, product_id,
        'purchase'::VARCHAR(32) AS event_type,
        session_start_ts + INTERVAL '185 seconds' AS event_ts,
        4::SMALLINT AS sequence_num,
        base_latency_ms + 210 AS page_load_ms,
        device_type, primary_category
    FROM tmp_session_flags
    WHERE has_view AND has_cart AND has_checkout AND has_purchase

    UNION ALL

    SELECT
        session_id, user_id, ((product_id + 6) % 10000) + 1 AS product_id,
        'product_view'::VARCHAR(32) AS event_type,
        session_start_ts + INTERVAL '24 seconds' AS event_ts,
        2::SMALLINT AS sequence_num,
        base_latency_ms + 40 AS page_load_ms,
        device_type, primary_category
    FROM tmp_session_flags
    WHERE has_view AND has_cart
) e;

-- -----------------------------------------------------------------------------
-- 5. SEED ORDERS & ORDER_ITEMS (~26,000+ orders)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_purchase_sessions AS
SELECT
    ROW_NUMBER() OVER (ORDER BY f.session_id) AS order_id,
    f.session_id,
    f.user_id,
    f.session_start_ts + INTERVAL '185 seconds' AS order_ts,
    f.device_type,
    f.acquisition_channel,
    f.city_tier,
    f.primary_category,
    LEAST(GREATEST(f.product_id, 1), 10000) AS primary_product_id
FROM tmp_session_flags f
WHERE f.has_view AND f.has_cart AND f.has_checkout AND f.has_purchase;

CREATE TEMP TABLE tmp_order_items AS
SELECT
    ROW_NUMBER() OVER (ORDER BY items.order_id, items.item_seq) AS order_item_id,
    items.order_id,
    items.product_id,
    p.category,
    items.quantity,
    p.base_price_inr AS unit_price_inr,
    ROUND((p.base_price_inr * items.quantity * items.disc_pct)::NUMERIC, 2) AS item_discount_inr,
    ROUND((p.base_price_inr * items.quantity)::NUMERIC, 2) AS line_total_inr
FROM (
    SELECT
        ps.order_id,
        1 AS item_seq,
        ps.primary_product_id AS product_id,
        (1 + (ps.order_id % 2))::SMALLINT AS quantity,
        CASE
            WHEN ps.acquisition_channel IN ('Paid_Social', 'Influencer') THEN 0.22
            WHEN ps.acquisition_channel = 'Paid_Search' THEN 0.12
            WHEN (ps.order_id % 5) = 0 THEN 0.10
            ELSE 0.00
        END AS disc_pct
    FROM tmp_purchase_sessions ps

    UNION ALL

    SELECT
        ps.order_id,
        2 AS item_seq,
        ((ps.primary_product_id + 12) % 10000) + 1 AS product_id,
        1::SMALLINT AS quantity,
        CASE
            WHEN ps.acquisition_channel IN ('Paid_Social', 'Influencer') THEN 0.20
            ELSE 0.05
        END AS disc_pct
    FROM tmp_purchase_sessions ps
    WHERE (ps.order_id % 100) < 48
) items
JOIN products p ON p.product_id = items.product_id;

WITH item_totals AS (
    SELECT
        oi.order_id,
        SUM(oi.line_total_inr) AS gross_amount_inr,
        SUM(oi.item_discount_inr) AS discount_amount_inr
    FROM tmp_order_items oi
    GROUP BY oi.order_id
)
INSERT INTO orders (
    order_id, session_id, user_id, order_ts, order_status, payment_method,
    gross_amount_inr, discount_amount_inr, shipping_fee_inr, tax_amount_inr,
    net_amount_inr, coupon_code, cancellation_reason, delivery_ts
)
SELECT
    ps.order_id,
    ps.session_id,
    ps.user_id,
    ps.order_ts,
    status_calc.order_status,
    pm_calc.payment_method,
    it.gross_amount_inr,
    it.discount_amount_inr,
    ship_calc.shipping_fee_inr,
    ROUND(((it.gross_amount_inr - it.discount_amount_inr) * 0.18)::NUMERIC, 2) AS tax_amount_inr,
    ROUND((
        (it.gross_amount_inr - it.discount_amount_inr)
        + ship_calc.shipping_fee_inr
        + ROUND(((it.gross_amount_inr - it.discount_amount_inr) * 0.18)::NUMERIC, 2)
    )::NUMERIC, 2) AS net_amount_inr,
    CASE
        WHEN it.discount_amount_inr > 0 AND ps.acquisition_channel IN ('Paid_Social', 'Influencer') THEN 'SOCIAL22'
        WHEN it.discount_amount_inr > 0 AND ps.acquisition_channel = 'Paid_Search' THEN 'SEARCH12'
        WHEN it.discount_amount_inr > 0 THEN 'SAVE10'
        ELSE NULL
    END AS coupon_code,
    CASE
        WHEN status_calc.order_status = 'cancelled' AND pm_calc.payment_method = 'COD' THEN 'COD_Doorstep_Refusal'
        WHEN status_calc.order_status = 'cancelled' THEN 'Customer_Changed_Mind'
        ELSE NULL
    END AS cancellation_reason,
    CASE
        WHEN status_calc.order_status IN ('completed', 'returned', 'refunded')
            THEN ps.order_ts + ((2 + (ps.order_id % 5)) * INTERVAL '1 day')
        ELSE NULL
    END AS delivery_ts
FROM tmp_purchase_sessions ps
JOIN item_totals it ON it.order_id = ps.order_id
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN ps.city_tier = 'Tier_3' AND (ps.order_id % 100) < 46 THEN 'COD'
            WHEN ps.acquisition_channel IN ('Paid_Social', 'Influencer') AND (ps.order_id % 100) < 38 THEN 'COD'
            WHEN (ps.order_id % 100) < 52 THEN 'UPI'
            WHEN (ps.order_id % 100) < 72 THEN 'COD'
            WHEN (ps.order_id % 100) < 86 THEN 'Credit_Card'
            WHEN (ps.order_id % 100) < 95 THEN 'Debit_Card'
            ELSE 'Wallet'
        END AS payment_method
) pm_calc
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN pm_calc.payment_method = 'COD' AND (ps.order_id % 100) < 16 THEN 'cancelled'
            WHEN ps.acquisition_channel IN ('Paid_Social', 'Influencer') AND (ps.order_id % 100) < 13 THEN 'cancelled'
            WHEN (ps.order_id % 100) < 7 THEN 'cancelled'
            WHEN ps.primary_category = 'Fashion & Apparel' AND (ps.order_id % 100) BETWEEN 70 AND 86 THEN 'refunded'
            WHEN ps.acquisition_channel IN ('Paid_Social', 'Influencer') AND (ps.order_id % 100) BETWEEN 80 AND 91 THEN 'refunded'
            WHEN (ps.order_id % 100) BETWEEN 88 AND 95 THEN 'refunded'
            WHEN (ps.order_id % 100) BETWEEN 96 AND 98 THEN 'returned'
            ELSE 'completed'
        END AS order_status
) status_calc
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN (it.gross_amount_inr - it.discount_amount_inr) < 499.00 THEN 49.00
            ELSE 0.00
        END AS shipping_fee_inr
) ship_calc;

INSERT INTO order_items (
    order_item_id, order_id, product_id, category,
    quantity, unit_price_inr, item_discount_inr, line_total_inr
)
SELECT
    order_item_id, order_id, product_id, category,
    quantity, unit_price_inr, item_discount_inr, line_total_inr
FROM tmp_order_items;

-- -----------------------------------------------------------------------------
-- 6. SEED REFUNDS (~3,100+ rows)
-- -----------------------------------------------------------------------------
INSERT INTO refunds (
    refund_id, order_id, user_id, refund_ts,
    refund_amount_inr, refund_reason, refund_status
)
SELECT
    ROW_NUMBER() OVER (ORDER BY o.order_id) AS refund_id,
    o.order_id,
    o.user_id,
    o.delivery_ts + ((1 + (o.order_id % 6)) * INTERVAL '1 day') AS refund_ts,
    o.net_amount_inr AS refund_amount_inr,
    CASE (o.order_id % 5)
        WHEN 0 THEN 'Size_or_Fit_Issue'
        WHEN 1 THEN 'Quality_Below_Expectation'
        WHEN 2 THEN 'Defective_or_Damaged'
        WHEN 3 THEN 'Late_Delivery'
        ELSE 'Wrong_Item_Sent'
    END AS refund_reason,
    CASE WHEN (o.order_id % 20) = 0 THEN 'pending' ELSE 'processed' END AS refund_status
FROM orders o
WHERE o.order_status IN ('refunded', 'returned');

COMMIT;
