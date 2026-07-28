from __future__ import annotations

from sqlalchemy import create_engine, inspect, text

from app.migrations import ensure_schema_compatibility


def test_existing_sqlite_database_receives_cpf_pulled_column(tmp_path) -> None:
    database_path = tmp_path / "legacy.db"
    legacy_engine = create_engine(f"sqlite:///{database_path}")
    with legacy_engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE applications (
                    id VARCHAR(32) PRIMARY KEY,
                    incomeVerified FLOAT
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO applications (id, incomeVerified)
                VALUES ('CAR-LEGACY-001', 6000)
                """
            )
        )

    ensure_schema_compatibility(legacy_engine)

    columns = {
        column["name"] for column in inspect(legacy_engine).get_columns("applications")
    }
    with legacy_engine.connect() as connection:
        migrated_value = connection.scalar(
            text(
                """
                SELECT "cpfPulled"
                FROM applications
                WHERE id = 'CAR-LEGACY-001'
                """
            )
        )

    assert "cpfPulled" in columns
    assert migrated_value == 1

