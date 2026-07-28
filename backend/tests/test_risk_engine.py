from types import SimpleNamespace

from app.risk_engine import evaluate


LOW = dict(
    id="LOW",
    name="Low",
    nric="S8••••21F",
    employer="Employer",
    empMonths=20,
    incomeDeclared=6000,
    incomeVerified=6000,
    existingMonthly=500,
    outstanding=12000,
    latePayments=0,
    carPrice=115000,
    omv=17000,
    carAge=1,
    downPayment=43700,
    loanAmount=71300,
    tenureYears=5,
)

MEDIUM = dict(
    id="MEDIUM",
    name="Medium",
    nric="S9••••07D",
    employer="Employer",
    empMonths=10,
    incomeDeclared=5000,
    incomeVerified=4300,
    existingMonthly=1000,
    outstanding=48000,
    latePayments=1,
    carPrice=150000,
    omv=25000,
    carAge=4,
    downPayment=60000,
    loanAmount=90000,
    tenureYears=7,
)

HIGH = dict(
    id="HIGH",
    name="High",
    nric="S9••••55A",
    employer="Employer",
    empMonths=5,
    incomeDeclared=4200,
    incomeVerified=2900,
    existingMonthly=1200,
    outstanding=71000,
    latePayments=3,
    carPrice=130000,
    omv=18000,
    carAge=3,
    downPayment=39000,
    loanAmount=91000,
    tenureYears=7,
)


def snapshot(values: dict) -> SimpleNamespace:
    return SimpleNamespace(**values)


def test_expected_demo_risk_bands() -> None:
    low = snapshot(LOW)
    medium = snapshot(MEDIUM)
    medium_duplicate = snapshot({**MEDIUM, "id": "MEDIUM-2"})
    high = snapshot(HIGH)

    low_result = evaluate(low, [low])
    medium_result = evaluate(medium, [medium])
    medium_with_duplicate = evaluate(medium, [medium, medium_duplicate])
    high_result = evaluate(high, [high])

    assert (low_result["score"], low_result["recommendation"]) == (23, "approve")
    assert (medium_result["score"], medium_result["recommendation"]) == (
        54,
        "manual_review",
    )
    assert medium_with_duplicate["score"] == 60
    assert (high_result["score"], high_result["recommendation"]) == (77, "reject")


def test_hard_ltv_rule_overrides_low_score() -> None:
    application = snapshot(
        {
            **LOW,
            "id": "OVER-LTV",
            "loanAmount": 100000,
            "downPayment": 15000,
        }
    )
    result = evaluate(application, [application])

    assert result["recommendation"] == "reject"
    assert any(rule["rule"] == "MAS-LTV-01" for rule in result["hardRules"])
