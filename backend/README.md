# AI Car Loan Approval & Risk Agent — Backend

## Overview

This FastAPI service is the backend contract for the latest modular English frontend in `../frontend`.

It implements the complete demonstration workflow:

```text
Applicant creates a draft
→ retrieves frozen synthetic MyInfo, CPF, and credit data
→ saves and submits the application
→ backend validates and stores a deterministic risk assessment
→ loan officer approves, rejects, or requests information
→ applicant submits supplementary information
→ status and audit records are updated
```

All identities, employers, financial records, authorizations, and decisions are synthetic test data. No external Singpass, MyInfo, CPF, or credit-bureau service is contacted.

## Current release

API version: `1.1.0`

This release includes the frontend-integration fixes requested before formal integration:

- one consistent `submitted → reviewing` workflow;
- controlled handling of explicit `null` values in PATCH requests;
- documented saved-result behavior for `GET /risk-assessment`;
- `cpfPulled` support in persistence and API schemas;
- frontend-compatible supplementary-information responses;
- frontend-compatible audit fields;
- versioned MyInfo, CPF, and Credit Report Mock APIs;
- additive SQLite migration for existing databases;
- updated automated tests and `openapi.json`;
- English-only backend comments and documentation.

## Technology

| Component | Implementation |
|---|---|
| API | FastAPI `0.116.1` |
| Server | Uvicorn `0.35.0` |
| ORM | SQLAlchemy `2.0.41` |
| Validation | Pydantic `2.11.7` |
| Local database | SQLite |
| Authentication | Fixed demo bearer tokens |
| Risk model | Deterministic rules engine |

## Folder structure

```text
backend/
  app/
    mock_data/
      frozen_personas_v1.json
    auth.py
    config.py
    database.py
    main.py
    migrations.py
    mock_provider.py
    models.py
    risk_engine.py
    schemas.py
    seed.py
    service.py
  tests/
    test_api.py
    test_risk_engine.py
  scripts/
    export_openapi.py
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

The script creates `.venv` when necessary, installs runtime dependencies, and starts the API.

Local addresses:

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`
- Health check: `http://127.0.0.1:8000/health`

Manual startup:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Configuration

Default values are shown in `.env.example`:

```env
CAR_LOAN_DATABASE_URL=sqlite:///./car_loan_agent.db
CAR_LOAN_CORS_ORIGINS=http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:3000,http://localhost:3000
CAR_LOAN_SEED_DEMO=true
```

## Demo accounts

| Role | Account | Password | Token |
|---|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` | `demo-applicant-token` |
| Loan officer | `officer@demo.com` or `Officer01` | `demo123` | `demo-officer-token` |

Authenticated requests use:

```http
Authorization: Bearer demo-applicant-token
```

## Status workflow

The stable state transitions are:

```text
draft → submitted → reviewing → approved
                            ↘ rejected
                            ↘ need_info → reviewing
```

The submission endpoint performs validation, the `submitted` transition, risk persistence, and the transition to `reviewing` in one database transaction. A successful `POST /applications/{id}/submit` therefore returns the application with:

```json
{
  "status": "reviewing"
}
```

`submitted` is the internal submission milestone and audit event. Officer decisions are accepted only when the application is in `reviewing`.

## Core endpoints

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Health and version information |
| `POST` | `/auth/login` | Public | Demo login |
| `GET` | `/auth/me` | Both | Current authenticated user |
| `POST` | `/applications` | Applicant | Create a draft; body may be omitted |
| `GET` | `/applications` | Both | Applicant list or officer queue |
| `GET` | `/applications/{id}` | Both | Application and latest saved assessment |
| `PATCH` | `/applications/{id}` | Applicant | Save a draft |
| `POST` | `/applications/{id}/submit` | Applicant | Validate, submit, assess, and enter review |
| `GET` | `/applications/{id}/risk-assessment` | Both | Return the latest saved assessment |
| `POST` | `/applications/{id}/evaluate` | Officer | Run a saved evaluation or non-persistent preview |
| `POST` | `/applications/{id}/decision` | Officer | Approve, reject, or request information |
| `POST` | `/applications/{id}/supplements` | Applicant | Submit supplementary note and file metadata |
| `GET` | `/audit-logs` | Both | Query visible audit records |
| `POST` | `/demo/reset` | Officer | Restore seeded demo data |

`GET /applications` supports `status`, `riskLevel`, and `search`.

`GET /audit-logs` supports `applicationId`.

## PATCH null behavior

Nullable numeric fields may be explicitly cleared:

```json
{
  "incomeVerified": null
}
```

Non-nullable fields such as `name`, `consent`, `cpfPulled`, and `tenureYears` reject explicit `null` with HTTP 422:

```json
{
  "detail": {
    "code": "null_not_allowed",
    "message": "Explicit null is not allowed for: name"
  }
}
```

This prevents database integrity errors while preserving the distinction between an omitted field and an explicit null.

## Risk-assessment semantics

`GET /applications/{id}/risk-assessment` returns the latest persisted risk assessment. It does not silently recalculate.

If the application has never been assessed, the endpoint returns HTTP 404 with `risk_assessment_not_found`.

Use `POST /applications/{id}/evaluate` for explicit recalculation:

```json
{
  "persist": false,
  "overrides": {
    "incomeVerified": 2500,
    "downPayment": 30000
  }
}
```

- `persist: false` returns a sensitivity-test preview and does not change the case or audit log.
- `persist: true` stores a new assessment and creates a `risk_assessed` audit event.

The seeded reference results are:

| Persona | Score | Recommendation |
|---|---:|---|
| Low | 23 | `approve` |
| Medium | 54 | `manual_review` |
| High | 77 | `reject` |

## Fixed Mock APIs

The dataset is stored in:

```text
app/mock_data/frozen_personas_v1.json
```

Current snapshot:

```text
sg-synthetic-personas-v1.0.0
```

Available personas:

- `low`
- `medium`
- `high`

List personas:

```http
GET /mock/personas
```

Retrieve MyInfo data:

```http
POST /applications/{id}/mock/myinfo
Content-Type: application/json

{
  "personaId": "low"
}
```

Retrieve CPF data:

```http
POST /applications/{id}/mock/cpf
Content-Type: application/json

{
  "personaId": "low"
}
```

Retrieve Credit Report data:

```http
POST /applications/{id}/mock/credit-report
Content-Type: application/json

{
  "personaId": "low"
}
```

Mock retrieval is available only for draft applications. Each request:

- returns the same frozen fields for the same persona and snapshot;
- updates the relevant application fields;
- sets `myinfoPulled`, `cpfPulled`, or `creditPulled`;
- records a source-specific audit event;
- returns provenance and the updated application;
- displays the label `Simulated authorization · Test data`.

Example response envelope:

```json
{
  "provider": "cpf_sandbox",
  "personaId": "low",
  "snapshotVersion": "sg-synthetic-personas-v1.0.0",
  "label": "Simulated authorization · Test data",
  "retrievedAt": "2026-07-28T10:00:00",
  "verified": true,
  "application": {
    "id": "CAR-2026-006",
    "cpfPulled": true,
    "incomeVerified": 6000
  }
}
```

## Supplement contract

The endpoint accepts either structured metadata:

```json
{
  "note": "Latest bank statement supplied.",
  "files": [
    {
      "name": "bank_statement.pdf",
      "size": 143000,
      "contentType": "application/pdf"
    }
  ]
}
```

or the latest frontend's filename-only array:

```json
{
  "note": "Latest bank statement supplied.",
  "files": ["bank_statement.pdf"]
}
```

Filename-only entries are normalized to `size: 0` and `contentType: application/pdf`.

The response is the updated `ApplicationOut`, including:

```json
{
  "status": "reviewing",
  "supplementNote": "Latest bank statement supplied.",
  "supplementFiles": [
    {
      "name": "bank_statement.pdf",
      "size": 0,
      "contentType": "application/pdf"
    }
  ]
}
```

## Audit contract

Each audit item includes frontend-ready fields and stable machine fields:

```json
{
  "id": 10,
  "applicationId": "CAR-2026-006",
  "appId": "CAR-2026-006",
  "action": "Risk Assessed",
  "actionCode": "risk_assessed",
  "actor": "System",
  "actorRole": "system",
  "createdAt": "2026-07-28T10:00:00",
  "ts": 1785213600000,
  "note": "Risk assessment completed",
  "modelVersion": "deterministic-score-v1.0.0",
  "metadata": {},
  "metadataJson": {}
}
```

- The latest frontend can use `appId`, `action`, and millisecond timestamp `ts`.
- Integrations should use `actionCode` for stable logic.
- `applicationId`, `createdAt`, and `metadataJson` remain available for backward compatibility.

## SQLite compatibility migration

Existing demo databases do not need to be deleted. At startup, `migrations.py` detects an older `applications` table and adds the non-null `cpfPulled` column with a safe default.

For future production deployment, replace this lightweight compatibility step with a formal migration tool such as Alembic.

## Frontend adapter notes

The latest frontend should keep its `index.html`, CSS, and view modules. Its `js/api.js` should replace local-store calls with these endpoints.

The API adapter must:

- store the bearer token in `sessionStorage`;
- add the bearer token to authenticated requests;
- unwrap `{ "items": [], "total": 0 }` list responses;
- replace local application objects with returned `ApplicationOut` objects;
- unwrap `.application` from Mock API responses;
- use backend `riskAssessment` for trusted persisted decisions;
- map server errors to rejected promises.

The current frontend still requires a small API-adapter change. Backend changes alone cannot make a browser that never sends HTTP requests use the server.

## Tests

Install test dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Regenerate the checked-in API contract:

```powershell
.\.venv\Scripts\python.exe scripts\export_openapi.py
```

The suite covers:

- reference scores and LTV hard rules;
- authentication and role checks;
- the complete submit/review/supplement/approve workflow;
- atomic reviewing status after submission;
- PATCH null behavior;
- saved-versus-preview risk semantics;
- reproducible Mock APIs;
- `cpfPulled`;
- filename-only and structured supplement payloads;
- frontend-ready audit fields.

## Production limitations

The current version is for teaching and demonstration. Before production use:

- replace SQLite with managed PostgreSQL;
- replace demo tokens with production authentication;
- configure secrets and exact CORS origins;
- disable or strictly protect `/demo/reset`;
- use real object storage and malware scanning for uploaded files;
- add rate limiting, monitoring, backups, and formal database migrations;
- complete official onboarding before any real Singpass/MyInfo integration.
