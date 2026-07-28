from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import DemoAccount, current_user, login, require_role
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .migrations import ensure_schema_compatibility
from .mock_provider import (
    dataset_label,
    list_personas,
    provider_data,
    snapshot_version,
)
from .models import Application, AuditLog, Supplement
from .risk_engine import MODEL_VERSION, RULES_VERSION
from .schemas import (
    ApplicationCreate,
    ApplicationList,
    ApplicationOut,
    ApplicationPatch,
    AuditList,
    DecisionRequest,
    EvaluateRequest,
    HealthOut,
    LoginRequest,
    LoginResponse,
    MockPersonaList,
    MockRetrievalOut,
    MockRetrievalRequest,
    RiskAssessmentOut,
    SupplementRequest,
    UserOut,
)
from .seed import seed_demo
from .service import (
    add_audit,
    api_error,
    application_out,
    audit_out,
    change_status,
    create_application,
    evaluate_application,
    get_application,
    latest_evaluation,
    risk_out,
    submit_application,
    update_application,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema_compatibility(engine)
    if settings.seed_demo:
        with SessionLocal() as db:
            seed_demo(db)
    yield


app = FastAPI(
    title="AI Car Loan Approval & Risk Control Agent API",
    version="1.1.0",
    description=(
        "Backend contract for the English modular frontend. A successful submission "
        "is validated and assessed atomically, then returned in reviewing status. "
        "GET risk-assessment returns the latest saved assessment; POST evaluate "
        "provides explicit saved or preview evaluation behavior."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthOut, tags=["system"])
def health() -> HealthOut:
    return HealthOut(
        status="ok",
        service="car-loan-agent-api",
        rulesVersion=RULES_VERSION,
        modelVersion=MODEL_VERSION,
    )


@app.post("/auth/login", response_model=LoginResponse, tags=["auth"])
def auth_login(payload: LoginRequest) -> LoginResponse:
    return login(payload)


@app.get("/auth/me", response_model=UserOut, tags=["auth"])
def auth_me(user: DemoAccount = Depends(current_user)) -> UserOut:
    return UserOut(id=user.id, role=user.role, displayName=user.display_name)


@app.post(
    "/applications",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
    tags=["applications"],
)
def applications_create(
    payload: ApplicationCreate | None = None,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> ApplicationOut:
    return application_out(
        db,
        create_application(db, payload or ApplicationCreate(), user),
    )


@app.get("/applications", response_model=ApplicationList, tags=["applications"])
def applications_list(
    status_filter: str | None = Query(default=None, alias="status"),
    risk_level: str | None = Query(default=None, alias="riskLevel"),
    search: str | None = None,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(current_user),
) -> ApplicationList:
    statement = select(Application)
    if user.role == "applicant":
        statement = statement.where(Application.applicantId == user.id)
    if status_filter:
        statement = statement.where(Application.status == status_filter)
    rows = list(db.scalars(statement.order_by(Application.createdAt.desc())).all())
    items = [application_out(db, row) for row in rows]
    if risk_level:
        items = [
            item
            for item in items
            if item.riskAssessment and item.riskAssessment.level == risk_level.lower()
        ]
    if search:
        needle = search.lower()
        items = [
            item
            for item in items
            if needle in item.id.lower() or needle in item.name.lower()
        ]
    return ApplicationList(items=items, total=len(items))


@app.get(
    "/applications/{application_id}",
    response_model=ApplicationOut,
    tags=["applications"],
)
def applications_get(
    application_id: str,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(current_user),
) -> ApplicationOut:
    return application_out(db, get_application(db, application_id, user))


@app.patch(
    "/applications/{application_id}",
    response_model=ApplicationOut,
    tags=["applications"],
)
def applications_patch(
    application_id: str,
    payload: ApplicationPatch,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> ApplicationOut:
    application = get_application(db, application_id, user)
    return application_out(db, update_application(db, application, payload, user))


@app.post(
    "/applications/{application_id}/submit",
    response_model=ApplicationOut,
    tags=["applications"],
)
def applications_submit(
    application_id: str,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> ApplicationOut:
    application = get_application(db, application_id, user)
    return application_out(db, submit_application(db, application, user))


@app.post(
    "/applications/{application_id}/evaluate",
    response_model=RiskAssessmentOut,
    tags=["risk"],
)
def applications_evaluate(
    application_id: str,
    payload: EvaluateRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("officer")),
) -> RiskAssessmentOut:
    application = get_application(db, application_id, user)
    result = evaluate_application(
        db,
        application,
        overrides=payload.overrides,
        persist=payload.persist,
        user=user if payload.persist else None,
    )
    return RiskAssessmentOut(**result)


@app.get(
    "/applications/{application_id}/risk-assessment",
    response_model=RiskAssessmentOut,
    tags=["risk"],
)
def applications_risk(
    application_id: str,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(current_user),
) -> RiskAssessmentOut:
    application = get_application(db, application_id, user)
    saved = latest_evaluation(db, application.id)
    if saved is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "risk_assessment_not_found",
            "No saved risk assessment exists for this application",
        )
    result = risk_out(saved)
    assert result is not None
    return result


def _make_decision(
    application_id: str,
    payload: DecisionRequest,
    db: Session,
    user: DemoAccount,
) -> ApplicationOut:
    application = get_application(db, application_id, user)
    if application.status != "reviewing":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            "Only applications under review can receive an officer decision",
        )
    mapping = {
        "approve": ("approved", "Approve", "approved"),
        "reject": ("rejected", "Reject", "rejected"),
        "request_info": ("need_info", None, "information_requested"),
    }
    target, final_decision, action = mapping[payload.decision]
    change_status(application, target)
    application.officerNote = payload.note
    application.decision = final_decision
    application.updatedAt = datetime.now(UTC).replace(tzinfo=None)
    if payload.decision == "request_info":
        application.needInfoReason = payload.note
    add_audit(
        db,
        application,
        action,
        user,
        payload.note,
        {"humanDecision": payload.decision},
    )
    db.commit()
    db.refresh(application)
    return application_out(db, application)


@app.post(
    "/applications/{application_id}/decision",
    response_model=ApplicationOut,
    tags=["decisions"],
)
def applications_decision(
    application_id: str,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("officer")),
) -> ApplicationOut:
    return _make_decision(application_id, payload, db, user)


@app.post(
    "/applications/{application_id}/decisions",
    response_model=ApplicationOut,
    include_in_schema=False,
)
def applications_decisions_alias(
    application_id: str,
    payload: DecisionRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("officer")),
) -> ApplicationOut:
    return _make_decision(application_id, payload, db, user)


@app.post(
    "/applications/{application_id}/supplements",
    response_model=ApplicationOut,
    status_code=status.HTTP_201_CREATED,
    tags=["supplements"],
)
def applications_supplement(
    application_id: str,
    payload: SupplementRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> ApplicationOut:
    application = get_application(db, application_id, user)
    if application.status != "need_info":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            "Supplements are accepted only when information is requested",
        )
    files = [
        {
            "name": item,
            "size": 0,
            "contentType": "application/pdf",
        }
        if isinstance(item, str)
        else item.model_dump()
        for item in payload.files
    ]
    row = Supplement(
        applicationId=application.id,
        note=payload.note.strip(),
        files=files,
    )
    db.add(row)
    application.supplementNote = payload.note.strip()
    change_status(application, "reviewing")
    application.updatedAt = datetime.now(UTC).replace(tzinfo=None)
    add_audit(
        db,
        application,
        "information_submitted",
        user,
        payload.note.strip() or "Supplement metadata submitted",
        {"files": files},
    )
    db.commit()
    db.refresh(application)
    return application_out(db, application)


@app.get("/audit-logs", response_model=AuditList, tags=["audit"])
def audit_logs(
    application_id: str | None = Query(default=None, alias="applicationId"),
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(current_user),
) -> AuditList:
    statement = select(AuditLog).join(Application)
    if user.role == "applicant":
        statement = statement.where(Application.applicantId == user.id)
    if application_id:
        statement = statement.where(AuditLog.applicationId == application_id)
    rows = list(db.scalars(statement.order_by(AuditLog.createdAt.desc())).all())
    return AuditList(items=[audit_out(row) for row in rows], total=len(rows))


@app.get("/mock/personas", response_model=MockPersonaList, tags=["mock-data"])
def mock_personas(
    _: DemoAccount = Depends(current_user),
) -> MockPersonaList:
    return MockPersonaList(
        snapshotVersion=snapshot_version(),
        label=dataset_label(),
        items=list_personas(),
    )


def _retrieve_mock_data(
    application_id: str,
    payload: MockRetrievalRequest,
    provider_key: str,
    provider_name: str,
    pulled_field: str,
    audit_action: str,
    db: Session,
    user: DemoAccount,
) -> MockRetrievalOut:
    application = get_application(db, application_id, user)
    if application.status != "draft":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "application_locked",
            "Mock data can only be retrieved for a draft application",
        )

    try:
        values = provider_data(payload.personaId, provider_key)
    except KeyError:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "persona_not_found",
            f"Unknown synthetic persona: {payload.personaId}",
        ) from None

    for field, value in values.items():
        setattr(application, field, value)
    setattr(application, pulled_field, True)
    if provider_key == "myinfo":
        application.consent = True
    retrieved_at = datetime.now(UTC).replace(tzinfo=None)
    application.updatedAt = retrieved_at
    add_audit(
        db,
        application,
        audit_action,
        user,
        f"{provider_name} returned frozen synthetic test data",
        {
            "provider": provider_name,
            "personaId": payload.personaId,
            "snapshotVersion": snapshot_version(),
            "verified": True,
        },
    )
    db.commit()
    db.refresh(application)
    return MockRetrievalOut(
        provider=provider_name,
        personaId=payload.personaId,
        snapshotVersion=snapshot_version(),
        label=dataset_label(),
        retrievedAt=retrieved_at,
        verified=True,
        application=application_out(db, application),
    )


@app.post(
    "/applications/{application_id}/mock/myinfo",
    response_model=MockRetrievalOut,
    tags=["mock-data"],
)
def mock_myinfo(
    application_id: str,
    payload: MockRetrievalRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> MockRetrievalOut:
    return _retrieve_mock_data(
        application_id,
        payload,
        "myinfo",
        "myinfo_sandbox",
        "myinfoPulled",
        "myinfo_retrieved",
        db,
        user,
    )


@app.post(
    "/applications/{application_id}/mock/cpf",
    response_model=MockRetrievalOut,
    tags=["mock-data"],
)
def mock_cpf(
    application_id: str,
    payload: MockRetrievalRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> MockRetrievalOut:
    return _retrieve_mock_data(
        application_id,
        payload,
        "cpf",
        "cpf_sandbox",
        "cpfPulled",
        "cpf_retrieved",
        db,
        user,
    )


@app.post(
    "/applications/{application_id}/mock/credit-report",
    response_model=MockRetrievalOut,
    tags=["mock-data"],
)
def mock_credit_report(
    application_id: str,
    payload: MockRetrievalRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> MockRetrievalOut:
    return _retrieve_mock_data(
        application_id,
        payload,
        "creditReport",
        "credit_report_sandbox",
        "creditPulled",
        "credit_report_retrieved",
        db,
        user,
    )


@app.post("/demo/reset", tags=["system"])
def demo_reset(
    db: Session = Depends(get_db),
    _: DemoAccount = Depends(require_role("officer")),
) -> dict[str, str]:
    seed_demo(db, force=True)
    return {"status": "reset"}
