from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "CAR_LOAN_DATABASE_URL", "sqlite:///./car_loan_agent.db"
    )
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "CAR_LOAN_CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500,"
            "http://127.0.0.1:5510,http://localhost:5510,"
            "http://127.0.0.1:3000,http://localhost:3000",
        ).split(",")
        if origin.strip()
    )
    seed_demo: bool = _as_bool(os.getenv("CAR_LOAN_SEED_DEMO"), True)


settings = Settings()

