-- =============================================================================
-- FILE: sql/schema.sql
-- PROJECT: E-commerce Growth Intelligence: Funnel, Retention & Revenue Analytics
-- NOTE: All data loaded into this schema is 100% synthetic (Fixed Seed = 42),
--       designed to simulate an Indian e-commerce platform for product analytics.
-- =============================================================================

DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. USERS TABLE (Target: >= 50,000 rows)
CREATE TABLE users (
    user_id             BIGINT PRIMARY KEY,
    signup_ts           TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    acquisition_channel VARCHAR(32) NOT NULL
        CHECK (acquisition_channel IN (
            'Organic_Search', 'Paid_Search', 'Paid_Social',
            'Referral', 'Direct', 'Influencer'
        )),
    signup_device       VARCHAR(24) NOT NULL
        CHECK (signup_device IN ('Android', 'iOS', 'Mobile_Web', 'Desktop_Web')),
    city                VARCHAR(48) NOT NULL,
    city_tier           VARCHAR(16) NOT NULL
        CHECK (city_tier IN ('Tier_1', 'Tier_2', 'Tier_3')),
    state               VARCHAR(48) NOT NULL,
    is_verified_phone   BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE users IS 'Synthetic customer master table (Fixed Seed = 42). Represents registered users on an Indian e-commerce platform.';

-- 2. PRODUCTS TABLE (Target: >= 10,000 rows)
CREATE TABLE products (
    product_id          BIGINT PRIMARY KEY,
    sku                 VARCHAR(32) NOT NULL UNIQUE,
    product_name        VARCHAR(120) NOT NULL,
    category            VARCHAR(48) NOT NULL
        CHECK (category IN (
            'Electronics', 'Fashion & Apparel', 'Home & Kitchen',
            'Beauty & Personal Care', 'Grocery & Essentials', 'Footwear & Accessories'
        )),
    subcategory         VARCHAR(64) NOT NULL,
    brand_tier          VARCHAR(24) NOT NULL
        CHECK (brand_tier IN ('Value', 'Mid_Market', 'Premium')),
    mrp_inr             NUMERIC(12, 2) NOT NULL CHECK (mrp_inr > 0),
    base_price_inr      NUMERIC(12, 2) NOT NULL CHECK (base_price_inr > 0 AND base_price_inr <= mrp_inr),
    cost_inr            NUMERIC(12, 2) NOT NULL CHECK (cost_inr > 0 AND cost_inr <= base_price_inr),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

COMMENT ON TABLE products IS 'Synthetic catalog of 10,000+ SKUs across 6 core Indian e-commerce categories.';

-- 3. SESSIONS TABLE (Target: >= 100,000 rows)
CREATE TABLE sessions (
    session_id          BIGINT PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    session_start_ts    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    session_end_ts      TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    device_type         VARCHAR(24) NOT NULL
        CHECK (device_type IN ('Android', 'iOS', 'Mobile_Web', 'Desktop_Web')),
    app_version         VARCHAR(24) NOT NULL,
    acquisition_channel VARCHAR(24) NOT NULL,
    utm_campaign        VARCHAR(64),
    city                VARCHAR(48) NOT NULL,
    city_tier           VARCHAR(16) NOT NULL,
    primary_category    VARCHAR(48) NOT NULL,
    CONSTRAINT chk_session_ts CHECK (session_end_ts >= session_start_ts)
);

COMMENT ON TABLE sessions IS 'User browsing sessions with device, app build, channel attribution, and primary category browsed.';

-- 4. EVENTS TABLE (Target: >= 150,000 rows)
CREATE TABLE events (
    event_id            BIGINT PRIMARY KEY,
    session_id          BIGINT NOT NULL REFERENCES sessions(session_id),
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    product_id          BIGINT REFERENCES products(product_id),
    event_type          VARCHAR(32) NOT NULL
        CHECK (event_type IN (
            'product_view', 'add_to_cart', 'checkout_start', 'purchase'
        )),
    event_ts            TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    sequence_num        SMALLINT NOT NULL CHECK (sequence_num >= 1),
    page_load_ms        INTEGER NOT NULL CHECK (page_load_ms > 0),
    device_type         VARCHAR(24) NOT NULL,
    category            VARCHAR(48) NOT NULL
);

COMMENT ON TABLE events IS 'Granular funnel clickstream events (product_view -> add_to_cart -> checkout_start -> purchase).';

-- 5. ORDERS TABLE (Target: >= 25,000 rows)
CREATE TABLE orders (
    order_id            BIGINT PRIMARY KEY,
    session_id          BIGINT NOT NULL UNIQUE REFERENCES sessions(session_id),
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    order_ts            TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    order_status        VARCHAR(24) NOT NULL
        CHECK (order_status IN ('completed', 'cancelled', 'returned', 'refunded')),
    payment_method      VARCHAR(24) NOT NULL
        CHECK (payment_method IN ('UPI', 'COD', 'Credit_Card', 'Debit_Card', 'Wallet')),
    gross_amount_inr    NUMERIC(12, 2) NOT NULL CHECK (gross_amount_inr >= 0),
    discount_amount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount_inr >= 0),
    shipping_fee_inr    NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_fee_inr >= 0),
    tax_amount_inr      NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount_inr >= 0),
    net_amount_inr      NUMERIC(12, 2) NOT NULL CHECK (net_amount_inr >= 0),
    coupon_code         VARCHAR(32),
    cancellation_reason VARCHAR(64),
    delivery_ts         TIMESTAMP WITHOUT TIME ZONE
);

COMMENT ON TABLE orders IS 'Order headers linking purchase sessions to financial totals, discounts, payment modes, and fulfillment status.';

-- 6. ORDER ITEMS TABLE
CREATE TABLE order_items (
    order_item_id       BIGINT PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(order_id),
    product_id          BIGINT NOT NULL REFERENCES products(product_id),
    category            VARCHAR(48) NOT NULL,
    quantity            SMALLINT NOT NULL CHECK (quantity >= 1),
    unit_price_inr      NUMERIC(12, 2) NOT NULL CHECK (unit_price_inr >= 0),
    item_discount_inr   NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (item_discount_inr >= 0),
    line_total_inr      NUMERIC(12, 2) NOT NULL CHECK (line_total_inr >= 0)
);

COMMENT ON TABLE order_items IS 'Line-item breakdown for each order; sum(line_total_inr) reconciles to orders.gross_amount_inr.';

-- 7. REFUNDS TABLE
CREATE TABLE refunds (
    refund_id           BIGINT PRIMARY KEY,
    order_id            BIGINT NOT NULL UNIQUE REFERENCES orders(order_id),
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    refund_ts           TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    refund_amount_inr   NUMERIC(12, 2) NOT NULL CHECK (refund_amount_inr > 0),
    refund_reason       VARCHAR(64) NOT NULL
        CHECK (refund_reason IN (
            'Size_or_Fit_Issue', 'Defective_or_Damaged', 'Wrong_Item_Sent',
            'Quality_Below_Expectation', 'Late_Delivery'
        )),
    refund_status       VARCHAR(24) NOT NULL
        CHECK (refund_status IN ('processed', 'pending'))
);

COMMENT ON TABLE refunds IS 'Post-purchase refunds issued for returned or refunded orders.';
