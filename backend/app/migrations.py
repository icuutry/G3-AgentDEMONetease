from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_schema_compatibility(engine: Engine) -> None:
    """Apply the small additive migration required by existing demo databases."""

    inspector = inspect(engine)
    if "applications" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("applications")}
    if "cpfPulled" in columns:
        return

    default_value = "0" if engine.dialect.name == "sqlite" else "FALSE"
    statement = (
        'ALTER TABLE applications ADD COLUMN "cpfPulled" '
        f"BOOLEAN NOT NULL DEFAULT {default_value}"
    )
    with engine.begin() as connection:
        connection.execute(text(statement))
        connection.execute(
            text(
                'UPDATE applications SET "cpfPulled" = '
                f"{'1' if engine.dialect.name == 'sqlite' else 'TRUE'} "
                'WHERE "incomeVerified" IS NOT NULL'
            )
        )
