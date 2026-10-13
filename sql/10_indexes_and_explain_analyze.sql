-- =============================================================================
-- FILE: sql/10_indexes_and_explain_analyze.sql
-- DEMONSTRATES: Performance engineering with B-Tree composite and covering
--               (INCLUDE) indexes on sessions, events, orders, and order_items.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_events_session_type_ts
    ON events (session_id, event_type, event_ts);

CREATE INDEX IF NOT EXISTS idx_events_ts_covering
    ON events (event_ts) INCLUDE (session_id, event_type);

CREATE INDEX IF NOT EXISTS idx_sessions_user_start_ts
    ON sessions (user_id, session_start_ts);

CREATE INDEX IF NOT EXISTS idx_sessions_segment_cover
    ON sessions (device_type, city_tier, acquisition_channel)
    INCLUDE (session_id, primary_category);

CREATE INDEX IF NOT EXISTS idx_orders_user_status_net
    ON orders (user_id, order_status)
    INCLUDE (net_amount_inr, order_ts);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
    ON order_items (order_id)
    INCLUDE (line_total_inr, item_discount_inr);

ANALYZE users, products, sessions, events, orders, order_items, refunds;
