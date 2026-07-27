# AI Car Loan Approval & Risk Agent — Backend

## Project status

This backend provides the working API and persistence layer for the AI Car Loan Approval & Risk Agent demonstration.

It is implemented with FastAPI, SQLAlchemy, Pydantic, and SQLite. The current version supports the main end-to-end workflow:

```text
Applicant creates and submits an application
→ backend validation and deterministic risk assessment
→ loan officer reviews the case
→ officer approves, rejects, or requests information
→ applicant submits supplementary information
→ status and audit records are updated
```

The backend is suitable for local demonstration and frontend integration. It is not yet a production banking system.

## Implemented features

- Fixed demo-account login.
- Applicant and loan-officer role enforcement.
- Applicant data isolation.
- Application creation, retrieval, draft updates, and submission.
- Application status machine:
  - `draft`
  - `submitted`
  - `reviewing`
  - `need_info`
  - `approved`
  - `rejected`
- Deterministic risk scoring.
- LTV, DSR, down-payment, income-gap, employment-duration, late-payment, vehicle-age, and duplicate-application checks.
- Hard-rule handling.
- Persisted risk score, level, recommendation, metrics, factors, rules, questions, and model/rules versions.
- Officer sensitivity testing without changing the stored case.
- Officer approve, reject, and request-information decisions.
- Required officer notes for final actions.
- Supplementary notes and file metadata.
- Append-only audit records.
- Five seeded demonstration applications.
- Swagger UI and OpenAPI JSON.
- Officer-only demonstration reset.

## Technology

| Component | Current implementation |
|---|---|
| API framework | FastAPI `0.116.1` |
| Server | Uvicorn `0.35.0` |
| ORM | SQLAlchemy `2.0.41` |
| Validation | Pydantic `2.11.7` |
| Local database | SQLite |
| Authentication | Fixed demonstration bearer tokens |
| Risk model | Deterministic rules engine |

## Folder structure

```text
backend/
  app/
    __init__.py
    auth.py
    config.py
    database.py
    main.py
    models.py
    risk_engine.py
    schemas.py
    seed.py
    service.py
  tests/
    test_api.py
    test_risk_engine.py
  .env.example
  openapi.json
  pytest.ini
  requirements.txt
  requirements-dev.txt
  run.ps1
```

## Run locally on Windows

Open PowerShell in the `backend` directory:

```powershell
.\run.ps1
```

The script:

1. creates `.venv` if necessary;
2. installs packages from `requirements.txt`;
3. starts the FastAPI application.

Local addresses:

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`
- Health check: `http://127.0.0.1:8000/health`

## Manual startup

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Configuration

Copy `.env.example` values into the deployment environment as needed:

```env
CAR_LOAN_DATABASE_URL=sqlite:///./car_loan_agent.db
CAR_LOAN_CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000
CAR_LOAN_SEED_DEMO=true
```

For production deployment:

- replace SQLite with managed PostgreSQL;
- set only the actual frontend origin in CORS;
- use deployment secrets rather than committed credentials;
- disable unrestricted demonstration reset;
- replace demo tokens with proper authentication.

## Demo accounts

| Role | Account | Password | Demo token |
|---|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` | `demo-applicant-token` |
| Loan officer | `officer@demo.com` or `Officer01` | `demo123` | `demo-officer-token` |

Example:

```http
Authorization: Bearer demo-applicant-token
```

`X-Demo-Role` is available only for local integration convenience and must not be used as production authentication.

## API endpoints

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Health and model-version check |
| `POST` | `/auth/login` | Public | Demo login |
| `GET` | `/auth/me` | Authenticated | Current user |
| `POST` | `/applications` | Applicant | Create an application |
| `GET` | `/applications` | Both | Applicant list or officer queue |
| `GET` | `/applications/{id}` | Both | Application details |
| `PATCH` | `/applications/{id}` | Applicant | Save a draft |
| `POST` | `/applications/{id}/submit` | Applicant | Validate, submit, and evaluate |
| `GET` | `/applications/{id}/risk-assessment` | Both | Get a current assessment |
| `POST` | `/applications/{id}/evaluate` | Officer | Persist an assessment or run a non-persistent sensitivity test |
| `POST` | `/applications/{id}/decision` | Officer | Approve, reject, or request information |
| `POST` | `/applications/{id}/supplements` | Applicant | Submit notes and file metadata |
| `GET` | `/audit-logs` | Both | Query visible audit records |
| `POST` | `/demo/reset` | Officer | Restore seeded demonstration data |

`GET /applications` supports:

- `status`
- `riskLevel`
- `search`

`GET /audit-logs` supports:

- `applicationId`

## Example login

Request:

```http
POST /auth/login
Content-Type: application/json

{
  "role": "applicant",
  "email": "applicant@demo.com",
  "password": "demo123"
}
```

Response:

```json
{
  "accessToken": "demo-applicant-token",
  "tokenType": "bearer",
  "user": {
    "id": "demo-applicant",
    "role": "applicant",
    "displayName": "Demo Applicant"
  }
}
```

## Example application payload

```json
{
  "consent": true,
  "myinfoPulled": true,
  "creditPulled": true,
  "name": "Synthetic Applicant",
  "nric": "S8••••99Z",
  "age": 36,
  "residency": "Singapore Citizen",
  "empType": "Full-time employee",
  "employer": "Demo Technology Pte Ltd",
  "empMonths": 48,
  "incomeDeclared": 6000,
  "incomeVerified": 6000,
  "existingMonthly": 500,
  "outstanding": 12000,
  "latePayments": 0,
  "otherLoans": 1,
  "carModel": "Synthetic EV",
  "carPrice": 115000,
  "omv": 17000,
  "carAge": 1,
  "downPayment": 43700,
  "loanAmount": 71300,
  "tenureYears": 5
}
```

## Risk-assessment response

The backend returns stable machine-readable codes. The frontend is responsible for display labels.

```json
{
  "score": 23,
  "level": "low",
  "recommendation": "approve",
  "metrics": {
    "ltv": 0.62,
    "cap": 0.7,
    "dsr": 0.32,
    "downPaymentRatio": 0.38,
    "incomeGap": 0,
    "monthlyPayment": 1424.91
  },
  "factors": [],
  "rules": [],
  "questions": [],
  "hardRules": [],
  "rulesVersion": "rules-v1.0.0",
  "modelVersion": "deterministic-score-v1.0.0"
}
```

Reference personas are calibrated to:

| Persona | Score | Recommendation |
|---|---:|---|
| Low risk | 23 | `approve` |
| Medium risk | 54 | `manual_review` |
| High risk | 77 | `reject` |

## Officer decisions

Endpoint:

```http
POST /applications/{id}/decision
```

Approve:

```json
{
  "decision": "approve",
  "note": "Verified information is consistent."
}
```

Reject:

```json
{
  "decision": "reject",
  "note": "The case exceeds the configured risk limits."
}
```

Request information:

```json
{
  "decision": "request_info",
  "note": "Please provide the latest income document."
}
```

## Supplementary information

The current version stores file metadata only. It does not upload or scan file contents.

```json
{
  "note": "Latest income document supplied.",
  "files": [
    {
      "name": "income-document.pdf",
      "size": 123456,
      "contentType": "application/pdf"
    }
  ]
}
```

## Test commands

Install development dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Run tests:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

The tests cover:

- reference risk scores;
- LTV hard rules;
- authentication and authorization;
- application submission;
- officer decisions;
- supplementary information;
- audit records;
- non-persistent sensitivity testing.

## Remaining backend work

### Required for the final public demonstration

1. Add frozen, versioned synthetic persona files.
2. Add stable Mock APIs:

   ```text
   POST /mock/myinfo/authorize
   GET  /mock/myinfo/personas/{personaId}
   GET  /mock/cpf/{personaId}
   GET  /mock/credit-report/{personaId}
   ```

3. Store data-source metadata such as:

   - `source`
   - `retrievedAt`
   - `verified`
   - `snapshotVersion`
   - consent scope and consent time

4. Move the deployed database from SQLite to PostgreSQL.
5. Add a Dockerfile and hosting-platform configuration.
6. Serve the frontend and API from the same HTTPS origin where practical.
7. Restrict or remove `X-Demo-Role`.
8. Protect or disable `/demo/reset` outside the controlled demonstration environment.
9. Run API and browser end-to-end tests after deployment.

### Future real Singpass/MyInfo integration

The first project phase does not require a real Singpass/MyInfo connection. The Mock Provider should be implemented behind a provider interface so it can later be replaced without changing the application workflow.

A real integration will require official onboarding, approved scopes and redirect URIs, secure key management, consent handling, data minimization, token validation, encrypted responses, and a manual data-entry alternative.

## Deployment recommendation

A traditional virtual private server is not required. A managed web-service platform with managed PostgreSQL is simpler for this demonstration.

The final submission should provide:

- one public HTTPS URL;
- startup and deployment instructions;
- environment-variable documentation;
- demo accounts;
- frozen synthetic personas;
- Mock API documentation;
- risk-rule and model-version documentation;
- source code;
- audit and reset instructions.

## Scope and disclaimer

This is an educational demonstration. All data is synthetic, and all integrations are simulated. The risk rules and recommendations do not represent the policy of any real financial institution.
