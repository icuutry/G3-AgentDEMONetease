from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .models import Application, AuditLog, RiskEvaluation, Supplement
from .risk_engine import MODEL_VERSION, evaluate
from .service import add_audit, persist_evaluation


PRESETS = {
    "low": dict(
        name="Amelia Tan",
        nric="S8••••21F",
        age=38,
        residency="Singapore Citizen",
        phone="9•••4412",
        empType="Full-time employee",
        employer="Northstar Logistics Pte. Ltd.",
        title="Operations Supervisor",
        empMonths=20,
        incomeDeclared=6000,
        incomeVerified=6000,
        education="Bachelor's degree",
        marital="Married",
        existingMonthly=500,
        outstanding=12000,
        latePayments=0,
        otherLoans=1,
        carModel="Toyota Corolla Altis 1.6",
        carPrice=115000,
        omv=17000,
        carAge=1,
        downPayment=43700,
        loanAmount=71300,
        tenureYears=5,
    ),
    "medium": dict(
        name="Daniel Lim",
        nric="S9••••07D",
        age=31,
        residency="Permanent Resident",
        phone="8•••7730",
        empType="Full-time employee",
        employer="Harbourline Engineering Pte. Ltd.",
        title="Project Coordinator",
        empMonths=10,
        incomeDeclared=5000,
        incomeVerified=4300,
        education="Diploma",
        marital="Single",
        existingMonthly=1000,
        outstanding=48000,
        latePayments=1,
        otherLoans=2,
        carModel="Honda Civic 1.5 Turbo",
        carPrice=150000,
        omv=25000,
        carAge=4,
        downPayment=60000,
        loanAmount=90000,
        tenureYears=7,
    ),
    "high": dict(
        name="Marcus Wong",
        nric="S9••••55A",
        age=27,
        residency="Work Pass Holder",
        phone="9•••2038",
        empType="Self-employed / part-time",
        employer="Independent ride-hailing operator",
        title="Self-employed Driver",
        empMonths=5,
        incomeDeclared=4200,
        incomeVerified=2900,
        education="Secondary school",
        marital="Single",
        existingMonthly=1200,
        outstanding=71000,
        latePayments=3,
        otherLoans=3,
        carModel="Mazda 3 1.5",
        carPrice=130000,
        omv=18000,
        carAge=3,
        downPayment=39000,
        loanAmount=91000,
        tenureYears=7,
    ),
}


def seed_demo(db: Session, force: bool = False) -> None:
    count = db.scalar(select(func.count(Application.id))) or 0
    if count and not force:
        return
    if force:
        db.execute(delete(AuditLog))
        db.execute(delete(Supplement))
        db.execute(delete(RiskEvaluation))
        db.execute(delete(Application))
        db.commit()

    definitions = [
        ("low", "approved", "Approve", "Stable verified income and low debt."),
        ("medium", "reviewing", None, ""),
        ("high", "rejected", "Reject", "Material income gap and payment arrears."),
        ("medium", "need_info", None, ""),
        ("low", "reviewing", None, ""),
    ]
    now = datetime.now(UTC).replace(tzinfo=None)
    applications = []
    for index, (preset, app_status, decision, officer_note) in enumerate(
        definitions, start=1
    ):
        created = now - timedelta(days=7 - index)
        application = Application(
            id=f"CAR-2026-{index:03d}",
            applicantId="applicant-demo",
            status=app_status,
            createdAt=created,
            updatedAt=created + timedelta(hours=2),
            submittedAt=created + timedelta(hours=1),
            consent=True,
            myinfoPulled=True,
            cpfPulled=True,
            creditPulled=True,
            decision=decision,
            officerNote=officer_note,
            **PRESETS[preset],
        )
        if index == 4:
            application.name += " (second application)"
            application.nric = PRESETS["medium"]["nric"]
            application.needInfoReason = (
                "Please provide complete bank statements for the last three months."
            )
        db.add(application)
        applications.append(application)
    db.flush()

    for application in applications:
        add_audit(db, application, "submitted", None, "Demo application submitted")
        result = evaluate(application, applications)
        evaluation = persist_evaluation(db, application, result)
        add_audit(
            db,
            application,
            "risk_assessed",
            None,
            "Demo risk assessment completed",
            {
                "evaluationId": evaluation.id,
                "score": result["score"],
                "level": result["level"],
                "recommendation": result["recommendation"],
            },
        )
        if application.status == "approved":
            add_audit(db, application, "approved", None, application.officerNote)
        elif application.status == "rejected":
            add_audit(db, application, "rejected", None, application.officerNote)
        elif application.status == "need_info":
            add_audit(
                db,
                application,
                "information_requested",
                None,
                application.needInfoReason,
            )
    db.commit()
