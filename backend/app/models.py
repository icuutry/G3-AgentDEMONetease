from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    applicantId: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(24), default="draft", index=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )
    submittedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    myinfoPulled: Mapped[bool] = mapped_column(Boolean, default=False)
    creditPulled: Mapped[bool] = mapped_column(Boolean, default=False)

    name: Mapped[str] = mapped_column(String(120), default="")
    nric: Mapped[str] = mapped_column(String(40), default="")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    residency: Mapped[str] = mapped_column(String(40), default="Singapore Citizen")
    phone: Mapped[str] = mapped_column(String(40), default="")
    empType: Mapped[str] = mapped_column(String(60), default="Full-time employee")
    employer: Mapped[str] = mapped_column(String(160), default="")
    title: Mapped[str] = mapped_column(String(100), default="")
    empMonths: Mapped[int | None] = mapped_column(Integer, nullable=True)
    incomeDeclared: Mapped[float | None] = mapped_column(Float, nullable=True)
    incomeVerified: Mapped[float | None] = mapped_column(Float, nullable=True)
    education: Mapped[str] = mapped_column(String(80), default="")
    marital: Mapped[str] = mapped_column(String(40), default="")

    existingMonthly: Mapped[float | None] = mapped_column(Float, nullable=True)
    outstanding: Mapped[float | None] = mapped_column(Float, nullable=True)
    latePayments: Mapped[int | None] = mapped_column(Integer, nullable=True)
    otherLoans: Mapped[int | None] = mapped_column(Integer, nullable=True)

    carModel: Mapped[str] = mapped_column(String(160), default="")
    carPrice: Mapped[float | None] = mapped_column(Float, nullable=True)
    omv: Mapped[float | None] = mapped_column(Float, nullable=True)
    carAge: Mapped[int | None] = mapped_column(Integer, nullable=True)
    downPayment: Mapped[float | None] = mapped_column(Float, nullable=True)
    loanAmount: Mapped[float | None] = mapped_column(Float, nullable=True)
    tenureYears: Mapped[int] = mapped_column(Integer, default=5)

    decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    officerNote: Mapped[str] = mapped_column(Text, default="")
    needInfoReason: Mapped[str] = mapped_column(Text, default="")
    supplementNote: Mapped[str] = mapped_column(Text, default="")

    evaluations: Mapped[list["RiskEvaluation"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    supplements: Mapped[list["Supplement"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )
    audits: Mapped[list["AuditLog"]] = relationship(
        back_populates="application", cascade="all, delete-orphan"
    )


class RiskEvaluation(Base):
    __tablename__ = "risk_evaluations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    applicationId: Mapped[str] = mapped_column(
        ForeignKey("applications.id"), index=True
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    score: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(16))
    recommendation: Mapped[str] = mapped_column(String(32))
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    factors: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    rules: Mapped[list[str]] = mapped_column(JSON)
    questions: Mapped[list[str]] = mapped_column(JSON)
    hardRules: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    rulesVersion: Mapped[str] = mapped_column(String(40))
    modelVersion: Mapped[str] = mapped_column(String(40))

    application: Mapped[Application] = relationship(back_populates="evaluations")


class Supplement(Base):
    __tablename__ = "supplements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    applicationId: Mapped[str] = mapped_column(
        ForeignKey("applications.id"), index=True
    )
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    note: Mapped[str] = mapped_column(Text, default="")
    files: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    application: Mapped[Application] = relationship(back_populates="supplements")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    applicationId: Mapped[str] = mapped_column(
        ForeignKey("applications.id"), index=True
    )
    action: Mapped[str] = mapped_column(String(64), index=True)
    actor: Mapped[str] = mapped_column(String(64))
    actorRole: Mapped[str] = mapped_column(String(24))
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    note: Mapped[str] = mapped_column(Text, default="")
    modelVersion: Mapped[str] = mapped_column(String(40))
    metadataJson: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    application: Mapped[Application] = relationship(back_populates="audits")
