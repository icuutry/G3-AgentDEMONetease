from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


RULES_VERSION = "rules-v1.0.0"
MODEL_VERSION = "deterministic-score-v1.0.0"
FLAT_RATE = 0.0278

REQUIRED_FIELDS = {
    "name": {"code": "name", "kind": "text"},
    "nric": {"code": "identity_number", "kind": "text"},
    "employer": {"code": "employer", "kind": "text"},
    "empMonths": {"code": "employment_months", "kind": "number", "minimum": 0},
    "incomeDeclared": {"code": "declared_income", "kind": "number", "minimum": 0},
    "carPrice": {"code": "car_price", "kind": "number", "minimum_exclusive": 0},
    "loanAmount": {"code": "loan_amount", "kind": "number", "minimum_exclusive": 0},
    "downPayment": {"code": "down_payment", "kind": "number", "minimum": 0},
}


def number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def ltv_cap(omv: Any) -> float:
    return 0.70 if number(omv) <= 20_000 else 0.60


def monthly_payment(loan: Any, years: Any) -> float:
    principal = number(loan)
    term = number(years) or 1.0
    return (principal + principal * FLAT_RATE * term) / (term * 12)


def required_missing(application: Any) -> list[str]:
    missing = []
    for field, definition in REQUIRED_FIELDS.items():
        value = getattr(application, field, None)
        is_missing = value is None
        if isinstance(value, str):
            is_missing = not value.strip()
        if not is_missing and definition["kind"] == "number":
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                is_missing = True
            else:
                if "minimum" in definition:
                    is_missing = numeric < definition["minimum"]
                if "minimum_exclusive" in definition:
                    is_missing = numeric <= definition["minimum_exclusive"]
        if is_missing:
            missing.append(definition["code"])
    return missing


def band(value: float, table: list[tuple[float, int, str]]) -> tuple[int, str]:
    for upper_bound, score, code in table:
        if value < upper_bound:
            return score, code
    return 0, ""


@dataclass
class ApplicationSnapshot:
    id: str | None = None
    nric: str = ""
    carPrice: float | None = None
    loanAmount: float | None = None
    omv: float | None = None
    tenureYears: int = 5
    incomeVerified: float | None = None
    incomeDeclared: float | None = None
    existingMonthly: float | None = None
    downPayment: float | None = None
    empMonths: int | None = None
    latePayments: int | None = None
    carAge: int | None = None
    name: str = ""
    employer: str = ""


def evaluate(application: Any, all_applications: Iterable[Any]) -> dict[str, Any]:
    factors: list[dict[str, Any]] = []
    rules: list[str] = []
    questions: list[str] = []
    hard_rules: list[dict[str, Any]] = []

    price = number(application.carPrice)
    loan = number(application.loanAmount)
    omv = number(application.omv)
    cap = ltv_cap(omv)
    ltv = loan / price if price > 0 else 0.0
    monthly = monthly_payment(loan, application.tenureYears)
    income = number(application.incomeVerified) or number(application.incomeDeclared)
    dsr = (number(application.existingMonthly) + monthly) / income if income else 1.0
    down_payment_ratio = number(application.downPayment) / price if price else 0.0
    income_gap = (
        abs(number(application.incomeDeclared) - number(application.incomeVerified))
        / number(application.incomeVerified)
        if number(application.incomeVerified) > 0
        else 0.0
    )

    if price > 0 and ltv > cap + 0.0001:
        hard_rules.append(
            {
                "rule": "MAS-LTV-01",
                "text": "loan_to_value_exceeds_omv_band_cap",
                "action": "reject",
            }
        )
    if number(application.tenureYears) > 7:
        hard_rules.append(
            {
                "rule": "MAS-TENURE-01",
                "text": "loan_tenure_exceeds_seven_years",
                "action": "reject",
            }
        )
    missing = required_missing(application)
    if missing:
        hard_rules.append(
            {
                "rule": "DOC-COMPLETE-01",
                "text": "required_fields_missing:" + ",".join(missing),
                "action": "manual_review",
            }
        )

    def add(
        rule_id: str,
        label: str,
        score: int,
        rule_code: str,
        fields: list[str],
    ) -> None:
        if score > 0:
            factors.append(
                {"id": rule_id, "label": label, "score": score, "fields": fields}
            )
            rules.append(f"{rule_id}:{rule_code}")

    base_score = 8

    dsr_score, dsr_code = band(
        dsr,
        [
            (0.30, 0, ""),
            (0.40, 5, "dsr_30_40"),
            (0.55, 12, "dsr_40_55"),
            (99, 22, "dsr_above_55"),
        ],
    )
    add(
        "DSR",
        "debt_service_ratio",
        dsr_score,
        dsr_code,
        ["existingMonthly", "incomeVerified", "loanAmount"],
    )
    if dsr_score >= 12:
        questions.append("verify_undeclared_installments_or_guarantees")

    down_score, down_code = band(
        down_payment_ratio,
        [
            (0.35, 10, "down_payment_below_35"),
            (0.40, 7, "down_payment_35_40"),
            (0.45, 4, "down_payment_40_45"),
            (99, 0, ""),
        ],
    )
    add(
        "DOWN",
        "down_payment_ratio",
        down_score,
        down_code,
        ["downPayment", "carPrice"],
    )

    gap_score, gap_code = band(
        income_gap,
        [
            (0.05, 0, ""),
            (0.15, 7, "income_gap_5_15"),
            (0.30, 13, "income_gap_15_30"),
            (99, 18, "income_gap_above_30"),
        ],
    )
    add(
        "INCGAP",
        "income_consistency",
        gap_score,
        gap_code,
        ["incomeDeclared", "incomeVerified"],
    )
    if gap_score >= 13:
        questions.append("request_three_month_bank_statements")

    employment_months = number(application.empMonths)
    employment_score, employment_code = band(
        employment_months,
        [
            (6, 8, "employment_below_6_months"),
            (12, 6, "employment_6_12_months"),
            (24, 3, "employment_12_24_months"),
            (9999, 0, ""),
        ],
    )
    add(
        "EMP",
        "employment_stability",
        employment_score,
        employment_code,
        ["empMonths", "employer"],
    )
    if employment_score >= 6:
        questions.append("verify_employment_and_probation_status")

    late_payments = number(application.latePayments)
    late_score, late_code = band(
        late_payments,
        [
            (1, 0, ""),
            (2, 5, "one_late_payment"),
            (4, 11, "two_or_three_late_payments"),
            (999, 15, "four_or_more_late_payments"),
        ],
    )
    add(
        "LATE",
        "payment_history",
        late_score,
        late_code,
        ["latePayments", "outstanding"],
    )
    if late_score >= 11:
        questions.append("verify_late_payment_settlement")

    vehicle_life = number(application.carAge) + number(application.tenureYears)
    add(
        "CAR",
        "vehicle_age_and_residual_value",
        6 if vehicle_life > 10 else 0,
        "vehicle_age_plus_tenure_above_10",
        ["carAge", "tenureYears"],
    )

    duplicates = [
        item
        for item in all_applications
        if getattr(item, "nric", "")
        and item.nric == application.nric
        and item.id != application.id
    ]
    if duplicates:
        factors.append(
            {
                "id": "DUP",
                "label": "duplicate_application",
                "score": 6,
                "fields": ["nric"],
            }
        )
        rules.append("DUP:same_identity_has_other_application")
        questions.append(
            "verify_duplicate_application:" + ",".join(item.id for item in duplicates)
        )

    score = max(0, min(100, round(base_score + sum(f["score"] for f in factors))))
    level = "high" if score >= 65 else "medium" if score >= 35 else "low"
    recommendation = {
        "high": "reject",
        "medium": "manual_review",
        "low": "approve",
    }[level]

    if any(item["action"] == "reject" for item in hard_rules):
        recommendation = "reject"
    elif hard_rules:
        recommendation = "manual_review"

    factors.sort(key=lambda item: item["score"], reverse=True)
    return {
        "score": score,
        "level": level,
        "recommendation": recommendation,
        "metrics": {
            "ltv": ltv,
            "cap": cap,
            "dsr": dsr,
            "downPaymentRatio": down_payment_ratio,
            "incomeGap": income_gap,
            "monthlyPayment": monthly,
        },
        "factors": factors,
        "rules": rules,
        "questions": questions,
        "hardRules": hard_rules,
        "rulesVersion": RULES_VERSION,
        "modelVersion": MODEL_VERSION,
    }

