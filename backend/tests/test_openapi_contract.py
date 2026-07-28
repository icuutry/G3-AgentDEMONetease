from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def test_checked_in_openapi_matches_application_contract() -> None:
    checked_in_path = Path(__file__).resolve().parents[1] / "openapi.json"
    checked_in = json.loads(checked_in_path.read_text(encoding="utf-8"))
    generated = app.openapi()

    assert checked_in == generated
    assert checked_in["info"]["version"] == "1.1.0"
    assert "/applications/{application_id}/mock/myinfo" in checked_in["paths"]
    assert "/applications/{application_id}/mock/cpf" in checked_in["paths"]
    assert "/applications/{application_id}/mock/credit-report" in checked_in["paths"]
    assert (
        "cpfPulled"
        in checked_in["components"]["schemas"]["ApplicationOut"]["properties"]
    )
