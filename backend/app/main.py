from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import DemoAccount, current_user, login, require_role
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import Application, AuditLog, Supplement
from .risk_engine import MODEL_VERSION, RULES_VERSION
from .schemas import (
    ApplicationCreate,
    ApplicationList,
    ApplicationOut,
    ApplicationPatch,
    AuditList,
    AuditLogOut,
    DecisionRequest,
    EvaluateRequest,
    HealthOut,
    LoginRequest,
    LoginResponse,
    RiskAssessmentOut,
    SupplementOut,
    SupplementRequest,
    UserOut,
)
from .seed import seed_demo
from .service import (
    add_audit,
    api_error,
    application_out,
    change_status,
    create_application,
    evaluate_application,
    get_application,
    submit_application,
    update_application,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.seed_demo:
        with SessionLocal() as db:
            seed_demo(db)
    yield


app = FastAPI(
    title="AI Car Loan Approval & Risk Control Agent API",
    version="1.0.0",
    description=(
        "Backend for the Applicant → validation → risk evaluation → "
        "Loan Officer decision → status → audit workflow."
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
    payload: ApplicationCreate,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> ApplicationOut:
    return application_out(db, create_application(db, payload, user))


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
    result = evaluate_application(db, application, persist=False)
    return RiskAssessmentOut(**result)


def _make_decision(
    application_id: str,
    payload: DecisionRequest,
    db: Session,
    user: DemoAccount,
) -> ApplicationOut:
    application = get_application(db, application_id, user)
    if application.status not in {"submitted", "reviewing"}:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            "Only submitted or reviewing applications can be decided",
        )
    mapping = {
        "approve": ("approved", "Approve", "approved"),
        "reject": ("rejected", "Reject", "rejected"),
        "request_info": ("need_info", None, "information_requested"),
    }
    target, final_decision, action = mapping[payload.decision]
    application.status = target
    application.officerNote = payload.note
    application.decision = final_decision
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
    response_model=SupplementOut,
    status_code=status.HTTP_201_CREATED,
    tags=["supplements"],
)
def applications_supplement(
    application_id: str,
    payload: SupplementRequest,
    db: Session = Depends(get_db),
    user: DemoAccount = Depends(require_role("applicant")),
) -> SupplementOut:
    application = get_application(db, application_id, user)
    if application.status != "need_info":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            "Supplements are accepted only when information is requested",
        )
    row = Supplement(
        applicationId=application.id,
        note=payload.note.strip(),
        files=[item.model_dump() for item in payload.files],
    )
    db.add(row)
    application.supplementNote = payload.note.strip()
    change_status(application, "reviewing")
    add_audit(
        db,
        application,
        "information_submitted",
        user,
        payload.note.strip() or "Supplement metadata submitted",
        {"files": [item.model_dump() for item in payload.files]},
    )
    db.commit()
    db.refresh(row)
    return SupplementOut.model_validate(row)


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
    return AuditList(
        items=[AuditLogOut.model_validate(row) for row in rows], total=len(rows)
    )


@app.post("/demo/reset", tags=["system"])
def demo_reset(
    db: Session = Depends(get_db),
    _: DemoAccount = Depends(require_role("officer")),
) -> dict[str, str]:
    seed_demo(db, force=True)
    return {"status": "reset"}
