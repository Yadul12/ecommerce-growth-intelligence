"""Verifies that all synthetic data tables meet or exceed minimum row requirements."""

from src.db import query_df


def test_minimum_row_volumes(db_ready):
    sql = """
    SELECT
        (SELECT COUNT(*) FROM users)    AS users_cnt,
        (SELECT COUNT(*) FROM sessions) AS sessions_cnt,
        (SELECT COUNT(*) FROM events)   AS events_cnt,
        (SELECT COUNT(*) FROM orders)   AS orders_cnt,
        (SELECT COUNT(*) FROM products) AS products_cnt;
    """
    row = query_df(sql).iloc[0]
    assert int(row["users_cnt"]) >= 50_000
    assert int(row["sessions_cnt"]) >= 100_000
    assert int(row["events_cnt"]) >= 150_000
    assert int(row["orders_cnt"]) >= 25_000
    assert int(row["products_cnt"]) >= 10_000
