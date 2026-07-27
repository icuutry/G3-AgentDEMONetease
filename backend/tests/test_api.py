from __future__ import annotations

import os

os.environ["CAR_LOAN_DATABASE_URL"] = "sqlite:///./test_car_loan_agent.db"
os.environ["CAR_LOAN_SEED_DEMO"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app


LOW_PAYLOAD = {
    "consent": True,
    "myinfoPulled": True,
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
    actions = {item["action"] for item in audit_response.json()["items"]}
    assert {
        "draft_created",
        "submitted",
        "risk_assessed",
        "information_requested",
        "information_submitted",
        "approved",
    }.issubset(actions)


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

