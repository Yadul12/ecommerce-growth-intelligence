"""Pytest fixtures for PostgreSQL integration testing."""

import pytest
from src.db import query_df


@pytest.fixture(scope="session")
def db_ready() -> bool:
    df = query_df("SELECT COUNT(*) AS cnt FROM users;")
    assert int(df["cnt"].iloc[0]) >= 50_000, (
        "Database not seeded or below 50,000 users. Run `python -m src.generate_seed_data` first."
    )
    return True
