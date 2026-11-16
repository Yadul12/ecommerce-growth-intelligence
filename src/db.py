"""Database connectivity and SQL execution helpers for PostgreSQL."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = PROJECT_ROOT / "sql"

load_dotenv(PROJECT_ROOT / ".env")


def get_db_url() -> str:
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5433")
    db = os.getenv("POSTGRES_DB", "ecommerce_growth")
    user = os.getenv("POSTGRES_USER", "analyst")
    password = os.getenv("POSTGRES_PASSWORD", "analyst_dev_pass")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(
        get_db_url(),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        pool_recycle=1800,
    )


def get_raw_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "ecommerce_growth"),
        user=os.getenv("POSTGRES_USER", "analyst"),
        password=os.getenv("POSTGRES_PASSWORD", "analyst_dev_pass"),
    )


def query_df(sql: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    engine = get_engine()
    with engine.connect() as conn:
        return pd.read_sql_query(text(sql), conn, params=params)


def run_sql_file_df(filename: str) -> pd.DataFrame:
    sql_path = SQL_DIR / filename
    sql_text = sql_path.read_text(encoding="utf-8")
    return query_df(sql_text)


def execute_sql_script(filename: str) -> None:
    sql_path = SQL_DIR / filename
    sql_text = sql_path.read_text(encoding="utf-8")
    conn = get_raw_connection()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql_text)
    finally:
        conn.close()
