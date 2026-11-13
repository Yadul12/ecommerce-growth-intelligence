"""Runs sql/09_data_quality_and_reconciliation.sql and asserts all 10 checks pass."""

from src.db import run_sql_file_df


def test_all_10_sql_data_quality_checks_pass(db_ready):
    df = run_sql_file_df("09_data_quality_and_reconciliation.sql")
    assert len(df) == 10
    failing = df[df["failing_records_count"] > 0]
    assert failing.empty, f"Data quality checks failed:\n{failing.to_string(index=False)}"
