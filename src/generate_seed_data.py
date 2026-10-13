"""Deterministic synthetic dataset generator and verification runner (Fixed Seed = 42).

Executes sql/00_schema.sql and sql/seed_data.sql against PostgreSQL, then validates
that all table volumes strictly exceed project minimums:
  - users       >=  50,000
  - sessions    >= 100,000
  - events      >= 150,000
  - orders      >=  25,000
  - products    >=  10,000
"""

from __future__ import annotations

import time
from src.db import execute_sql_script, query_df


REQUIRED_MINIMUMS = {
    "users": 50_000,
    "products": 10_000,
    "sessions": 100_000,
    "events": 150_000,
    "orders": 25_000,
    "order_items": 25_000,
    "refunds": 1_000,
}


def build_and_seed_database() -> dict[str, int]:
    print("[1/3] Creating relational schema (sql/00_schema.sql)...")
    t0 = time.perf_counter()
    execute_sql_script("00_schema.sql")
    print(f"      Schema created in {time.perf_counter() - t0:.2f}s.")

    print("[2/3] Generating deterministic synthetic data (sql/seed_data.sql, SEED=42)...")
    t1 = time.perf_counter()
    execute_sql_script("seed_data.sql")
    print(f"      Seed data populated in {time.perf_counter() - t1:.2f}s.")

    print("[3/3] Building analytical indexes (sql/10_indexes_and_explain_analyze.sql)...")
    t2 = time.perf_counter()
    execute_sql_script("10_indexes_and_explain_analyze.sql")
    print(f"      Indexes and statistics updated in {time.perf_counter() - t2:.2f}s.")

    counts_sql = """
    SELECT 'users' AS table_name, COUNT(*)::BIGINT AS row_count FROM users
    UNION ALL SELECT 'products', COUNT(*)::BIGINT FROM products
    UNION ALL SELECT 'sessions', COUNT(*)::BIGINT FROM sessions
    UNION ALL SELECT 'events', COUNT(*)::BIGINT FROM events
    UNION ALL SELECT 'orders', COUNT(*)::BIGINT FROM orders
    UNION ALL SELECT 'order_items', COUNT(*)::BIGINT FROM order_items
    UNION ALL SELECT 'refunds', COUNT(*)::BIGINT FROM refunds;
    """
    df_counts = query_df(counts_sql)
    counts = dict(zip(df_counts["table_name"], df_counts["row_count"].astype(int)))

    for tbl, min_rows in REQUIRED_MINIMUMS.items():
        actual = counts.get(tbl, 0)
        status = "OK" if actual >= min_rows else "BELOW_MINIMUM"
        print(f"      - {tbl:<12}: {actual:>9,} rows (required >= {min_rows:>7,}) [{status}]")
        if actual < min_rows:
            raise RuntimeError(f"Table {tbl} has {actual} rows, below required {min_rows}")

    return counts


if __name__ == "__main__":
    build_and_seed_database()
