from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ApplicationStatus = Literal[
    "draft", "submitted", "reviewing", "need_info", "approved", "rejected"
]
Role = Literal["applicant", "officer"]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class LoginRequest(ApiModel):
    role: Role
    email: str | None = None
    staffId: str | None = None
    password: str


class UserOut(ApiModel):
    id: str
    role: Role
    displayName: str


class LoginResponse(ApiModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserOut


class ApplicationFields(ApiModel):
    consent: bool = False
    myinfoPulled: bool = False
    creditPulled: bool = False

    name: str = ""
    nric: str = ""
    age: int | None = Field(default=None, ge=18, le=100)
    residency: str = "Singapore Citizen"
    phone: str = ""
    empType: str = "Full-time employee"
    employer: str = ""
    title: str = ""
    empMonths: int | None = Field(default=None, ge=0)
    incomeDeclared: float | None = Field(default=None, ge=0)
    incomeVerified: float | None = Field(default=None, ge=0)
    education: str = ""
    marital: str = ""

    existingMonthly: float | None = Field(default=None, ge=0)
    outstanding: float | None = Field(default=None, ge=0)
    latePayments: int | None = Field(default=None, ge=0)
    otherLoans: int | None = Field(default=None, ge=0)

    carModel: str = ""
    carPrice: float | None = Field(default=None, gt=0)
    omv: float | None = Field(default=None, ge=0)
    carAge: int | None = Field(default=None, ge=0)
    downPayment: float | None = Field(default=None, ge=0)
    loanAmount: float | None = Field(default=None, gt=0)
    tenureYears: int = Field(default=5, ge=1, le=20)


class ApplicationCreate(ApplicationFields):
    pass


class ApplicationPatch(ApiModel):
    consent: bool | None = None
    myinfoPulled: bool | None = None
    creditPulled: bool | None = None
    name: str | None = None
    nric: str | None = None
    age: int | None = Field(default=None, ge=18, le=100)
    residency: str | None = None
    phone: str | None = None
    empType: str | None = None
    employer: str | None = None
    title: str | None = None
    empMonths: int | None = Field(default=None, ge=0)
    incomeDeclared: float | None = Field(default=None, ge=0)
    incomeVerified: float | None = Field(default=None, ge=0)
    education: str | None = None
    marital: str | None = None
    existingMonthly: float | None = Field(default=None, ge=0)
    outstanding: float | None = Field(default=None, ge=0)
    latePayments: int | None = Field(default=None, ge=0)
    otherLoans: int | None = Field(default=None, ge=0)
    carModel: str | None = None
    carPrice: float | None = Field(default=None, gt=0)
    omv: float | None = Field(default=None, ge=0)
    carAge: int | None = Field(default=None, ge=0)
    downPayment: float | None = Field(default=None, ge=0)
    loanAmount: float | None = Field(default=None, gt=0)
    tenureYears: int | None = Field(default=None, ge=1, le=20)


class RiskFactor(ApiModel):
    id: str
    label: str
    score: int
    fields: list[str]


class HardRule(ApiModel):
    rule: str
    text: str
    action: Literal["reject", "manual_review"]


class RiskAssessmentOut(ApiModel):
    id: int | None = None
    createdAt: datetime | None = None
    score: int
    level: Literal["low", "medium", "high"]
    recommendation: Literal["approve", "manual_review", "reject"]
    metrics: dict[str, float]
    factors: list[RiskFactor]
    rules: list[str]
    questions: list[str]
    hardRules: list[HardRule]
    rulesVersion: str
    modelVersion: str


class ApplicationOut(ApplicationFields):
    id: str
    applicantId: str
    status: ApplicationStatus
    createdAt: datetime
    updatedAt: datetime
    submittedAt: datetime | None
    decision: str | None
    officerNote: str
    needInfoReason: str
    supplementNote: str
    riskAssessment: RiskAssessmentOut | None = None


class ApplicationList(ApiModel):
    items: list[ApplicationOut]
    total: int


class EvaluateRequest(ApiModel):
    overrides: ApplicationPatch | None = None
    persist: bool = True


class DecisionRequest(ApiModel):
    decision: Literal["approve", "reject", "request_info"]
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("note")
    @classmethod
    def note_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Decision note is required")
        return value


class SupplementFile(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0)
    contentType: str = Field(default="application/octet-stream", max_length=120)


class SupplementRequest(ApiModel):
    note: str = Field(default="", max_length=2000)
    files: list[SupplementFile] = Field(default_factory=list, max_length=10)


class SupplementOut(ApiModel):
    id: int
    applicationId: str
    createdAt: datetime
    note: str
    files: list[dict[str, Any]]


class AuditLogOut(ApiModel):
    id: int
    applicationId: str
    action: str
    actor: str
    actorRole: str
    createdAt: datetime
    note: str
    modelVersion: str
    metadataJson: dict[str, Any]


class AuditList(ApiModel):
    items: list[AuditLogOut]
    total: int


class HealthOut(ApiModel):
    status: Literal["ok"]
    service: str
    rulesVersion: str
    modelVersion: str

