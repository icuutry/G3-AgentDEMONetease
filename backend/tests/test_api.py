from __future__ import annotations

from collections import Counter
import os

os.environ["CAR_LOAN_DATABASE_URL"] = "sqlite:///./test_car_loan_agent.db"
os.environ["CAR_LOAN_SEED_DEMO"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app
from app.seed import PRESETS


LOW_PAYLOAD = {
    "consent": True,
    "myinfoPulled": True,
    "cpfPulled": True,
    "creditPulled": True,
    "name": "Test Applicant",
    "nric": "S8••••99Z",
    "age": 38,
    "residency": "Singapore Citizen",
    "phone": "9•••0000",
    "empType": "Full-time employee",
    "employer": "Example Pte Ltd",
    "title": "Manager",
    "empMonths": 20,
    "incomeDeclared": 6000,
    "incomeVerified": 6000,
    "education": "Bachelor",
    "marital": "Married",
    "existingMonthly": 500,
    "outstanding": 12000,
    "latePayments": 0,
    "otherLoans": 1,
    "carModel": "Toyota Corolla Altis 1.6",
    "carPrice": 115000,
    "omv": 17000,
    "carAge": 1,
    "downPayment": 43700,
    "loanAmount": 71300,
    "tenureYears": 5,
}


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def token(client: TestClient, role: str) -> str:
    payload = {
        "role": role,
        "email": f"{role}@demo.com",
        "password": "demo123",
    }
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 200
    return response.json()["accessToken"]


def auth_header(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def assert_unauthenticated(response) -> None:
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "not_authenticated"
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/auth/me"),
        ("POST", "/applications"),
        ("POST", "/demo/reset"),
    ],
)
def test_protected_endpoints_require_bearer_token(
    client: TestClient, method: str, path: str
) -> None:
    assert_unauthenticated(client.request(method, path))


@pytest.mark.parametrize(
    ("method", "path", "role"),
    [
        ("GET", "/auth/me", "officer"),
        ("GET", "/auth/me", "applicant"),
        ("POST", "/demo/reset", "officer"),
        ("POST", "/applications", "applicant"),
    ],
)
def test_demo_role_header_cannot_authenticate(
    client: TestClient, method: str, path: str, role: str
) -> None:
    assert_unauthenticated(
        client.request(method, path, headers={"X-Demo-Role": role})
    )


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer unknown-token"},
        {
            "Authorization": "Bearer invalid-token",
            "X-Demo-Role": "officer",
        },
        {"Authorization": "Bearer "},
        {"Authorization": "malformed"},
        {"Authorization": "Basic ZGVtbzpkZW1v"},
    ],
)
def test_invalid_authorization_cannot_be_repaired_by_role_header(
    client: TestClient, headers: dict[str, str]
) -> None:
    assert_unauthenticated(client.get("/auth/me", headers=headers))


@pytest.mark.parametrize(
    ("access_token", "expected_role"),
    [
        ("demo-applicant-token", "applicant"),
        ("demo-officer-token", "officer"),
    ],
)
def test_valid_bearer_authenticates_expected_account(
    client: TestClient, access_token: str, expected_role: str
) -> None:
    response = client.get("/auth/me", headers=auth_header(access_token))
    assert response.status_code == 200
    assert response.json()["role"] == expected_role


@pytest.mark.parametrize(
    ("access_token", "conflicting_role", "expected_role"),
    [
        ("demo-applicant-token", "officer", "applicant"),
        ("demo-officer-token", "applicant", "officer"),
    ],
)
def test_valid_bearer_role_ignores_conflicting_demo_role_header(
    client: TestClient,
    access_token: str,
    conflicting_role: str,
    expected_role: str,
) -> None:
    response = client.get(
        "/auth/me",
        headers={
            **auth_header(access_token),
            "X-Demo-Role": conflicting_role,
        },
    )
    assert response.status_code == 200
    assert response.json()["role"] == expected_role


@pytest.mark.parametrize(
    ("payload", "expected_token", "expected_role"),
    [
        (
            {
                "role": "applicant",
                "email": "applicant@demo.com",
                "password": "demo123",
            },
            "demo-applicant-token",
            "applicant",
        ),
        (
            {
                "role": "officer",
                "email": "officer@demo.com",
                "password": "demo123",
            },
            "demo-officer-token",
            "officer",
        ),
        (
            {
                "role": "officer",
                "staffId": "Officer01",
                "password": "demo123",
            },
            "demo-officer-token",
            "officer",
        ),
    ],
)
def test_demo_login_identities_remain_valid(
    client: TestClient,
    payload: dict[str, str],
    expected_token: str,
    expected_role: str,
) -> None:
    response = client.post("/auth/login", json=payload)
    assert response.status_code == 200
    assert response.json()["accessToken"] == expected_token
    assert response.json()["user"]["role"] == expected_role


def test_invalid_login_password_remains_unauthorized(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={
            "role": "applicant",
            "email": "applicant@demo.com",
            "password": "wrong-password",
        },
    )
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_credentials"


def test_authenticated_wrong_roles_remain_forbidden(client: TestClient) -> None:
    applicant_headers = auth_header("demo-applicant-token")
    officer_headers = auth_header("demo-officer-token")

    officer_endpoint = client.post("/demo/reset", headers=applicant_headers)
    applicant_endpoint = client.post(
        "/applications",
        headers=officer_headers,
    )
    officer_decision = client.post(
        "/applications/APP-NOT-USED/decision",
        json={"decision": "approve", "note": "Must remain forbidden."},
        headers=applicant_headers,
    )

    assert officer_endpoint.status_code == 403
    assert applicant_endpoint.status_code == 403
    assert officer_decision.status_code == 403


def test_forced_demo_reset_creates_distinct_final_seed_contract(
    client: TestClient,
) -> None:
    officer_headers = auth_header(token(client, "officer"))
    applicant_headers = auth_header(token(client, "applicant"))

    assert client.post("/demo/reset", headers=applicant_headers).status_code == 403
    reset = client.post("/demo/reset", headers=officer_headers)
    assert reset.status_code == 200
    assert reset.json() == {"status": "reset"}

    response = client.get("/applications", headers=officer_headers)
    assert response.status_code == 200
    applications = response.json()["items"]
    assert response.json()["total"] == 5
    assert {application["id"] for application in applications} == {
        f"CAR-2026-{index:03d}" for index in range(1, 6)
    }
    by_id = {application["id"]: application for application in applications}

    expected_identity_vehicle_status = {
        "CAR-2026-001": ("Sarah Lee", "Nissan Sylphy 1.6", "approved"),
        "CAR-2026-002": ("Daniel Lim", "Honda Civic 1.5 Turbo", "reviewing"),
        "CAR-2026-003": ("Marcus Wong", "Mazda 3 1.5", "rejected"),
        "CAR-2026-004": (
            "Daniel Lim (second application)",
            "Honda HR-V 1.5",
            "need_info",
        ),
        "CAR-2026-005": ("Amelia Tan", "Toyota Corolla Altis 1.6", "reviewing"),
    }
    for application_id, expected in expected_identity_vehicle_status.items():
        application = by_id[application_id]
        assert (
            application["name"],
            application["carModel"],
            application["status"],
        ) == expected

    assert {
        field: by_id["CAR-2026-001"][field]
        for field in ("nric", "phone", "employer", "title")
    } == {
        "nric": "S8••••42H",
        "phone": "8•••3519",
        "employer": "Meridian Supply Pte. Ltd.",
        "title": "Operations Executive",
    }
    assert by_id["CAR-2026-001"]["decision"] == "Approve"
    assert by_id["CAR-2026-001"]["officerNote"] == (
        "Stable verified income and low debt."
    )
    assert by_id["CAR-2026-001"]["nric"] != by_id["CAR-2026-005"]["nric"]
    assert by_id["CAR-2026-002"]["nric"] == by_id["CAR-2026-004"]["nric"]
    duplicate_groups = [
        sorted(
            application["id"]
            for application in applications
            if application["nric"] == nric
        )
        for nric, count in Counter(
            application["nric"] for application in applications
        ).items()
        if count > 1
    ]
    assert duplicate_groups == [["CAR-2026-002", "CAR-2026-004"]]
    assert len({application["carModel"] for application in applications}) == 5

    status_counts = Counter(application["status"] for application in applications)
    assert {
        "all": len(applications),
        "open": sum(
            status_counts[status] for status in ("submitted", "reviewing", "need_info")
        ),
        "approved": status_counts["approved"],
        "rejected": status_counts["rejected"],
    } == {"all": 5, "open": 3, "approved": 1, "rejected": 1}

    financial_fields = (
        "carPrice",
        "omv",
        "carAge",
        "downPayment",
        "loanAmount",
        "tenureYears",
    )
    preset_for_case = {
        "CAR-2026-001": "low",
        "CAR-2026-002": "medium",
        "CAR-2026-003": "high",
        "CAR-2026-004": "medium",
        "CAR-2026-005": "low",
    }
    for application_id, preset_name in preset_for_case.items():
        for field in financial_fields:
            assert by_id[application_id][field] == PRESETS[preset_name][field]

    expected_risk = {
        "CAR-2026-001": (23, "low", "approve"),
        "CAR-2026-002": (60, "medium", "manual_review"),
        "CAR-2026-003": (77, "high", "reject"),
        "CAR-2026-004": (60, "medium", "manual_review"),
        "CAR-2026-005": (23, "low", "approve"),
    }
    for application_id, expected in expected_risk.items():
        assessment = by_id[application_id]["riskAssessment"]
        assert assessment is not None
        assert (
            assessment["score"],
            assessment["level"],
            assessment["recommendation"],
        ) == expected
        duplicate_factor = any(
            factor["id"] == "DUP" for factor in assessment["factors"]
        )
        assert duplicate_factor is (
            application_id in {"CAR-2026-002", "CAR-2026-004"}
        )

    assert "second application" in by_id["CAR-2026-004"]["name"].lower()
    assert by_id["CAR-2026-004"]["needInfoReason"] == (
        "Please provide complete bank statements for the last three months."
    )
    expected_lifecycle_actions = {
        "CAR-2026-001": {"submitted", "risk_assessed", "approved"},
        "CAR-2026-002": {"submitted", "risk_assessed"},
        "CAR-2026-003": {"submitted", "risk_assessed", "rejected"},
        "CAR-2026-004": {
            "submitted",
            "risk_assessed",
            "information_requested",
        },
        "CAR-2026-005": {"submitted", "risk_assessed"},
    }
    for application_id, expected_actions in expected_lifecycle_actions.items():
        audit = client.get(
            "/audit-logs",
            params={"applicationId": application_id},
            headers=officer_headers,
        )
        assert audit.status_code == 200
        actions = {item["actionCode"] for item in audit.json()["items"]}
        assert expected_actions.issubset(actions)
    assert PRESETS["low"]["name"] == "Amelia Tan"
    assert PRESETS["low"]["carModel"] == "Toyota Corolla Altis 1.6"
    assert PRESETS["medium"]["carModel"] == "Honda Civic 1.5 Turbo"
    assert PRESETS["high"]["carModel"] == "Mazda 3 1.5"


def test_explicit_blank_residency_create_keeps_other_new_draft_defaults(
    client: TestClient,
) -> None:
    applicant_headers = auth_header(token(client, "applicant"))
    response = client.post(
        "/applications",
        json={"residency": ""},
        headers=applicant_headers,
    )
    assert response.status_code == 201
    application = response.json()
    assert application["residency"] == ""
    assert {
        field: application[field]
        for field in ("name", "nric", "phone", "education", "marital")
    } == {
        "name": "",
        "nric": "",
        "phone": "",
        "education": "",
        "marital": "",
    }
    assert application["age"] is None
    assert application["myinfoPulled"] is False
    assert application["consent"] is False


def test_complete_submit_review_supplement_approve_flow(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")

    create_response = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    )
    assert create_response.status_code == 201
    application_id = create_response.json()["id"]

    submit_response = client.post(
        f"/applications/{application_id}/submit",
        headers=auth_header(applicant_token),
    )
    assert submit_response.status_code == 200
    submitted = submit_response.json()
    assert submitted["status"] == "reviewing"
    assert submitted["riskAssessment"]["score"] == 23
    assert submitted["riskAssessment"]["recommendation"] == "approve"

    request_info_response = client.post(
        f"/applications/{application_id}/decision",
        json={
            "decision": "request_info",
            "note": "Please provide three months of bank statements.",
        },
        headers=auth_header(officer_token),
    )
    assert request_info_response.status_code == 200
    assert request_info_response.json()["status"] == "need_info"

    supplement_response = client.post(
        f"/applications/{application_id}/supplements",
        json={
            "note": "Statements attached.",
            "files": [
                {
                    "name": "bank_statement_2026Q2.pdf",
                    "size": 143000,
                    "contentType": "application/pdf",
                }
            ],
        },
        headers=auth_header(applicant_token),
    )
    assert supplement_response.status_code == 201
    supplemented = supplement_response.json()
    assert supplemented["status"] == "reviewing"
    assert supplemented["supplementNote"] == "Statements attached."
    assert supplemented["supplementFiles"] == [
        {
            "name": "bank_statement_2026Q2.pdf",
            "size": 143000,
            "contentType": "application/pdf",
        }
    ]

    approve_response = client.post(
        f"/applications/{application_id}/decision",
        json={"decision": "approve", "note": "Income evidence verified."},
        headers=auth_header(officer_token),
    )
    assert approve_response.status_code == 200
    approved = approve_response.json()
    assert approved["status"] == "approved"
    assert approved["decision"] == "Approve"

    audit_response = client.get(
        "/audit-logs",
        params={"applicationId": application_id},
        headers=auth_header(officer_token),
    )
    assert audit_response.status_code == 200
    items = audit_response.json()["items"]
    actions = {item["actionCode"] for item in items}
    assert {
        "draft_created",
        "submitted",
        "risk_assessed",
        "information_requested",
        "information_submitted",
        "approved",
    }.issubset(actions)
    submitted_audit = next(item for item in items if item["actionCode"] == "submitted")
    assert submitted_audit["applicationId"] == application_id
    assert submitted_audit["appId"] == application_id
    assert submitted_audit["action"] == "Submitted"
    assert isinstance(submitted_audit["ts"], int)
    assert submitted_audit["metadata"] == submitted_audit["metadataJson"]


def test_role_and_state_guards(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")

    forbidden = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(officer_token),
    )
    assert forbidden.status_code == 403

    create_response = client.post(
        "/applications",
        json={**LOW_PAYLOAD, "consent": False},
        headers=auth_header(applicant_token),
    )
    application_id = create_response.json()["id"]
    submit_response = client.post(
        f"/applications/{application_id}/submit",
        headers=auth_header(applicant_token),
    )
    assert submit_response.status_code == 422
    assert submit_response.json()["detail"]["code"] == "consent_required"


@pytest.mark.parametrize("employer", ["", "   "])
def test_submit_rejects_blank_employer_without_side_effects(
    client: TestClient, employer: str
) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")
    applicant_headers = auth_header(applicant_token)
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=applicant_headers,
    ).json()["id"]

    cleared = client.patch(
        f"/applications/{application_id}",
        json={"employer": employer},
        headers=applicant_headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["employer"] == employer

    audit_before = client.get(
        "/audit-logs",
        params={"applicationId": application_id},
        headers=auth_header(officer_token),
    ).json()
    rejected = client.post(
        f"/applications/{application_id}/submit",
        headers=applicant_headers,
    )
    audit_after = client.get(
        "/audit-logs",
        params={"applicationId": application_id},
        headers=auth_header(officer_token),
    ).json()
    application = client.get(
        f"/applications/{application_id}",
        headers=applicant_headers,
    ).json()

    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "required_fields_missing"
    assert "employer" in rejected.json()["detail"]["message"]
    assert application["status"] == "draft"
    assert application["submittedAt"] is None
    assert application["riskAssessment"] is None
    assert audit_after == audit_before
    assert not {
        "submitted",
        "information_retrieved",
        "risk_assessed",
    }.intersection(item["actionCode"] for item in audit_after["items"])


def test_preview_evaluation_does_not_write_audit(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    ).json()["id"]

    before = client.get(
        "/audit-logs",
        params={"applicationId": application_id},
        headers=auth_header(officer_token),
    ).json()["total"]
    preview = client.post(
        f"/applications/{application_id}/evaluate",
        json={
            "persist": False,
            "overrides": {"incomeVerified": 2500, "downPayment": 30000},
        },
        headers=auth_header(officer_token),
    )
    after = client.get(
        "/audit-logs",
        params={"applicationId": application_id},
        headers=auth_header(officer_token),
    ).json()["total"]

    assert preview.status_code == 200
    assert preview.json()["score"] > 23
    assert before == after


def test_patch_handles_explicit_null_without_database_error(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    ).json()["id"]

    nullable_response = client.patch(
        f"/applications/{application_id}",
        json={"incomeVerified": None},
        headers=auth_header(applicant_token),
    )
    assert nullable_response.status_code == 200
    assert nullable_response.json()["incomeVerified"] is None

    non_nullable_response = client.patch(
        f"/applications/{application_id}",
        json={"name": None, "cpfPulled": None},
        headers=auth_header(applicant_token),
    )
    assert non_nullable_response.status_code == 422
    assert non_nullable_response.json()["detail"]["code"] == "null_not_allowed"

    get_response = client.get(
        f"/applications/{application_id}",
        headers=auth_header(applicant_token),
    )
    assert get_response.status_code == 200
    assert get_response.json()["name"] == LOW_PAYLOAD["name"]


def test_risk_assessment_get_returns_latest_saved_result(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    ).json()["id"]

    missing = client.get(
        f"/applications/{application_id}/risk-assessment",
        headers=auth_header(applicant_token),
    )
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "risk_assessment_not_found"

    submitted = client.post(
        f"/applications/{application_id}/submit",
        headers=auth_header(applicant_token),
    ).json()
    saved_before = client.get(
        f"/applications/{application_id}/risk-assessment",
        headers=auth_header(officer_token),
    ).json()
    preview = client.post(
        f"/applications/{application_id}/evaluate",
        json={
            "persist": False,
            "overrides": {"incomeVerified": 2500, "downPayment": 30000},
        },
        headers=auth_header(officer_token),
    ).json()
    saved_after = client.get(
        f"/applications/{application_id}/risk-assessment",
        headers=auth_header(officer_token),
    ).json()

    assert submitted["status"] == "reviewing"
    assert preview["score"] > saved_before["score"]
    assert saved_after == saved_before


def test_fixed_mock_apis_are_reproducible(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    headers = auth_header(applicant_token)
    application_id = client.post("/applications", headers=headers).json()["id"]

    personas = client.get("/mock/personas", headers=headers)
    assert personas.status_code == 200
    assert personas.json()["snapshotVersion"] == "sg-synthetic-personas-v1.0.0"
    assert [item["personaId"] for item in personas.json()["items"]] == [
        "low",
        "medium",
        "high",
    ]

    first_myinfo = client.post(
        f"/applications/{application_id}/mock/myinfo",
        json={"personaId": "low"},
        headers=headers,
    )
    second_myinfo = client.post(
        f"/applications/{application_id}/mock/myinfo",
        json={"personaId": "low"},
        headers=headers,
    )
    employment = {
        "employer": "Applicant Entered Employer",
        "title": "Applicant Entered Title",
        "empType": "Contract employee",
        "empMonths": 14,
        "incomeDeclared": 5100,
    }
    saved_employment = client.patch(
        f"/applications/{application_id}",
        json=employment,
        headers=headers,
    )
    cpf = client.post(
        f"/applications/{application_id}/mock/cpf",
        json={"personaId": "low"},
        headers=headers,
    )
    credit = client.post(
        f"/applications/{application_id}/mock/credit-report",
        json={"personaId": "low"},
        headers=headers,
    )

    assert first_myinfo.status_code == 200
    assert first_myinfo.json()["application"]["name"] == "Amelia Tan"
    assert first_myinfo.json()["application"]["consent"] is True
    assert (
        second_myinfo.json()["application"]["nric"]
        == first_myinfo.json()["application"]["nric"]
    )
    assert saved_employment.status_code == 200
    assert cpf.json()["application"]["incomeVerified"] == 6000
    assert cpf.json()["application"]["cpfPulled"] is True
    for field, value in employment.items():
        assert cpf.json()["application"][field] == value
    assert credit.json()["application"]["existingMonthly"] == 500
    assert credit.json()["application"]["creditPulled"] is True


def test_supplement_accepts_frontend_filename_list(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    ).json()["id"]
    client.post(
        f"/applications/{application_id}/submit",
        headers=auth_header(applicant_token),
    )
    client.post(
        f"/applications/{application_id}/decision",
        json={"decision": "request_info", "note": "Provide a bank statement."},
        headers=auth_header(officer_token),
    )

    response = client.post(
        f"/applications/{application_id}/supplements",
        json={"note": "Attached.", "files": ["bank_statement_1.pdf"]},
        headers=auth_header(applicant_token),
    )
    assert response.status_code == 201
    assert response.json()["supplementFiles"] == [
        {
            "name": "bank_statement_1.pdf",
            "size": 0,
            "contentType": "application/pdf",
        }
    ]


def test_officer_decision_requires_reviewing_status(client: TestClient) -> None:
    applicant_token = token(client, "applicant")
    officer_token = token(client, "officer")
    application_id = client.post(
        "/applications",
        json=LOW_PAYLOAD,
        headers=auth_header(applicant_token),
    ).json()["id"]

    response = client.post(
        f"/applications/{application_id}/decision",
        json={"decision": "approve", "note": "Should not be accepted while draft."},
        headers=auth_header(officer_token),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "invalid_status_transition"
