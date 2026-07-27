from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import DemoAccount
from .models import Application, AuditLog, RiskEvaluation, Supplement
from .risk_engine import MODEL_VERSION, evaluate, required_missing
from .schemas import ApplicationCreate, ApplicationOut, ApplicationPatch, RiskAssessmentOut


EDITABLE_FIELDS = tuple(ApplicationCreate.model_fields)
ALLOWED_TRANSITIONS = {
    "draft": {"submitted"},
    "submitted": {"reviewing"},
    "reviewing": {"approved", "rejected", "need_info"},
    "need_info": {"reviewing"},
    "approved": set(),
    "rejected": set(),
}


def api_error(http_status: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=http_status, detail={"code": code, "message": message}
    )


def next_application_id(db: Session) -> str:
    current = db.scalar(select(func.count(Application.id))) or 0
    candidate = current + 1
    while True:
        app_id = f"CAR-2026-{candidate:03d}"
        if db.get(Application, app_id) is None:
            return app_id
        candidate += 1


def assert_owner(application: Application, user: DemoAccount) -> None:
    if user.role == "applicant" and application.applicantId != user.id:
        raise api_error(status.HTTP_404_NOT_FOUND, "not_found", "Application not found")


def get_application(db: Session, app_id: str, user: DemoAccount) -> Application:
    application = db.get(Application, app_id)
    if application is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "not_found", "Application not found")
    assert_owner(application, user)
    return application


def change_status(application: Application, target: str) -> None:
    if target not in ALLOWED_TRANSITIONS.get(application.status, set()):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            f"Cannot transition from {application.status} to {target}",
        )
    application.status = target


def add_audit(
    db: Session,
    application: Application,
    action: str,
    user: DemoAccount | None,
    note: str,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    actor = user.display_name if user else "System"
    actor_role = user.role if user else "system"
    row = AuditLog(
        applicationId=application.id,
        action=action,
        actor=actor,
        actorRole=actor_role,
        note=note,
        modelVersion=MODEL_VERSION,
        metadataJson=metadata or {},
    )
    db.add(row)
    return row


def persist_evaluation(
    db: Session, application: Application, result: dict[str, Any]
) -> RiskEvaluation:
    row = RiskEvaluation(
        applicationId=application.id,
        score=result["score"],
        level=result["level"],
        recommendation=result["recommendation"],
        metrics=result["metrics"],
        factors=result["factors"],
        rules=result["rules"],
        questions=result["questions"],
        hardRules=result["hardRules"],
        rulesVersion=result["rulesVersion"],
        modelVersion=result["modelVersion"],
    )
    db.add(row)
    db.flush()
    return row


def latest_evaluation(db: Session, app_id: str) -> RiskEvaluation | None:
    return db.scalar(
        select(RiskEvaluation)
        .where(RiskEvaluation.applicationId == app_id)
        .order_by(RiskEvaluation.id.desc())
        .limit(1)
    )


def risk_out(row: RiskEvaluation | None) -> RiskAssessmentOut | None:
    if row is None:
        return None
    return RiskAssessmentOut(
        id=row.id,
        createdAt=row.createdAt,
        score=row.score,
        level=row.level,
        recommendation=row.recommendation,
        metrics=row.metrics,
        factors=row.factors,
        rules=row.rules,
        questions=row.questions,
        hardRules=row.hardRules,
        rulesVersion=row.rulesVersion,
        modelVersion=row.modelVersion,
    )


def application_out(db: Session, application: Application) -> ApplicationOut:
    data = {
        column.name: getattr(application, column.name)
        for column in Application.__table__.columns
    }
    return ApplicationOut(
        **data, riskAssessment=risk_out(latest_evaluation(db, application.id))
    )


def create_application(
    db: Session, payload: ApplicationCreate, user: DemoAccount
) -> Application:
    row = Application(
        id=next_application_id(db),
        applicantId=user.id,
        **payload.model_dump(),
    )
    db.add(row)
    db.flush()
    add_audit(db, row, "draft_created", user, "Draft application created")
    db.commit()
    db.refresh(row)
    return row


def update_application(
    db: Session,
    application: Application,
    payload: ApplicationPatch,
    user: DemoAccount,
) -> Application:
    if application.status != "draft":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "application_locked",
            "Only draft applications can be edited",
        )
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(application, field, value)
    application.updatedAt = datetime.now(UTC).replace(tzinfo=None)
    add_audit(
        db,
        application,
        "draft_saved",
        user,
        "Draft application updated",
        {"fields": sorted(changes)},
    )
    db.commit()
    db.refresh(application)
    return application


def evaluate_application(
    db: Session,
    application: Application,
    overrides: ApplicationPatch | None = None,
    persist: bool = True,
    user: DemoAccount | None = None,
) -> dict[str, Any]:
    all_applications = list(db.scalars(select(Application)).all())
    target: Any = application
    if overrides:
        values = {
            column.name: getattr(application, column.name)
            for column in Application.__table__.columns
        }
        values.update(overrides.model_dump(exclude_unset=True))
        target = SimpleNamespace(**values)

    result = evaluate(target, all_applications)
    if persist:
        row = persist_evaluation(db, application, result)
        add_audit(
            db,
            application,
            "risk_assessed",
            user,
            "Risk assessment completed",
            {
                "score": result["score"],
                "level": result["level"],
                "recommendation": result["recommendation"],
                "evaluationId": row.id,
            },
        )
        db.commit()
    return result


def submit_application(
    db: Session, application: Application, user: DemoAccount
) -> Application:
    if application.status != "draft":
        raise api_error(
            status.HTTP_409_CONFLICT,
            "invalid_status_transition",
            "Only a draft can be submitted",
        )
    if not application.consent:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "consent_required",
            "Data-use consent is required",
        )
    missing = required_missing(application)
    if missing:
        raise api_error(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "required_fields_missing",
            "Required application fields are missing: " + ", ".join(missing),
        )

    change_status(application, "submitted")
    application.submittedAt = datetime.now(UTC).replace(tzinfo=None)
    add_audit(db, application, "submitted", user, "Application submitted")
    add_audit(
        db,
        application,
        "information_retrieved",
        None,
        "Synthetic source checks completed",
        {
            "myinfoPulled": application.myinfoPulled,
            "creditPulled": application.creditPulled,
        },
    )
    db.flush()
    evaluate_application(db, application, persist=True)
    change_status(application, "reviewing")
    application.updatedAt = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(application)
    return application
