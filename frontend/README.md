# AI Car Loan Approval & Risk Agent — Frontend

## Overview

This directory contains the English-only browser frontend for the integrated educational prototype. It is a static HTML, CSS, and JavaScript application that communicates with the FastAPI backend through `fetch()`.

The backend and its SQLite database are the authoritative data layer. The frontend keeps transient UI state in memory and stores only the demo authentication token in `sessionStorage`. All identities, financial records, authorizations, and decisions are synthetic.

The prototype does not represent a real financial institution and does not make binding lending decisions.

## Run the integrated demo

Use the repository-root Windows launcher rather than opening `index.html` directly or using Live Server:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-demo.ps1
.\run-demo.ps1 -FreshDemo
```

The backend virtual environment and runtime dependencies must already be installed as described in the root [README](../README.md).

Normal launch preserves the current local demo records and does not reset the database automatically. `-FreshDemo` is recommended for judging, presentations, final verification, and clean screenshots: it restores and validates the five current seeded applications before opening the browser.

Local addresses:

- Frontend: `http://127.0.0.1:5510/`
- Backend API: `http://127.0.0.1:8000`
- API health check: `http://127.0.0.1:8000/health`
- Swagger UI: `http://127.0.0.1:8000/docs`

The active frontend server is `scripts/serve_frontend_no_cache.py`, a Python standard-library static server. Every frontend response includes:

```http
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

The current frontend build marker is `20260730-ui-final-2`. `index.html` references `styles.css` and `app.js` with that asset version, `app.js` imports `views.js` with the same version, and `document.documentElement` exposes the current build through its `data-app-build` attribute.

The launcher refuses to reuse occupied ports, starts both services as background child processes, and waits for readiness. When Chrome is available, it opens the demo with a temporary isolated Chrome profile. The isolated profile and explicit no-cache responses avoid stale assets and previous browser-session state. Pressing Enter stops the backend, frontend, and only the isolated Chrome process created by the launcher, then removes its temporary profile. Logs are written to the repository-root `demo-logs/` directory.

## Demo accounts

| Role | Account | Password |
|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` |
| Loan officer | `officer@demo.com` or `Officer01` | `demo123` |

The login screens can fill the corresponding demo account automatically.

## Frontend routes

The application uses hash-based client-side routes:

| Route | Purpose |
|---|---|
| `#/` | Portal selection |
| `#/login/applicant` | Applicant sign-in |
| `#/login/officer` | Loan-officer sign-in |
| `#/apply-home` | Applicant dashboard and application list |
| `#/form/:applicationId` | Five-step application form |
| `#/status/:applicationId` | Submission status, progress, and decision details |
| `#/supplement/:applicationId` | Supplementary-information submission |
| `#/queue` | Loan-officer review queue |
| `#/case/:applicationId` | Loan-officer case review |
| `#/audit` | Audit records |

`app.js` enforces the corresponding Applicant or Officer view access, while the backend independently enforces authentication and role permissions.

## Folder structure

```text
frontend/
  index.html
  README.md
  css/
    styles.css
  js/
    api.js
    api-mappers.js
    app.js
    csv.js
    decision-state.js
    demo-data.js
    provenance.js
    risk-engine.js
    supplement-state.js
    views.js
```

- `index.html` provides the application shell and global-header controls.
- `css/styles.css` contains global, page-specific, responsive, and accessibility styles.
- `js/api.js` is the active `fetch()` adapter for the FastAPI backend.
- `js/api-mappers.js` serializes frontend application payloads and normalizes backend responses.
- `js/app.js` coordinates startup, routing, sessions, event handling, API calls, and rendering.
- `js/csv.js` safely serializes audit exports, including protection against spreadsheet-formula injection.
- `js/decision-state.js` keeps temporary Officer decision state bound to the current application.
- `js/demo-data.js` contains frontend labels, statuses, rules-version metadata, and demo form presets.
- `js/provenance.js` tracks simulated provider retrieval and invalidates provider status when retrieved fields are manually edited.
- `js/risk-engine.js` provides deterministic client-side calculations, previews, and form validation.
- `js/supplement-state.js` preserves temporary supplementary-note state across simulated file rerenders.
- `js/views.js` renders Applicant, Officer, authentication, status, supplement, and audit views.

Repository-level launcher support:

```text
scripts/
  serve_frontend_no_cache.py
  test_cache_launcher.py
```

- `scripts/serve_frontend_no_cache.py` is the standard-library static server that serves the frontend with explicit no-cache headers.
- `scripts/test_cache_launcher.py` contains focused tests for build-version references, no-cache serving, and launcher behavior.

## Current architecture

```text
Browser views
  → app.js routing and event delegation
  → api.js fetch adapter
  → FastAPI at 127.0.0.1:8000
  → SQLAlchemy and SQLite
```

The active data flow is:

1. `app.js` restores a session, loads the current route, and requests data through `api.js`.
2. `api.js` sends JSON requests and bearer authentication to the backend.
3. `api-mappers.js` converts application payloads and normalizes application, assessment, audit, supplement, and mock-retrieval responses.
4. `views.js` receives prepared data and returns the current page markup.
5. User actions are handled through the existing delegated `data-action` controls.

Application records, saved risk assessments, supplements, decisions, and audit entries are persisted by the backend in SQLite. Refreshing the browser does not make localStorage the source of truth.

## Authentication

`api.js` stores the demo access token in `sessionStorage` under:

```text
car_loan_agent_access_token
```

Authenticated requests include:

```http
Authorization: Bearer <demo-token>
```

The token is cleared on logout, portal switching, or an unauthorized API response. The implementation uses fixed demo accounts and tokens and is not production authentication.

## Backend API integration

The default API base URL is:

```text
http://127.0.0.1:8000
```

It can be overridden by defining `window.CAR_LOAN_API_BASE` before the main module loads.

The active adapter supports:

- Login and current-session retrieval
- Application creation, listing, loading, draft updates, and submission
- Saved and preview risk assessments
- Officer approve, reject, and request-information decisions
- Supplementary notes and simulated file metadata
- Synthetic MyInfo, CPF, and credit-report retrieval
- Audit-log retrieval
- Officer-only demo reset

The adapter maps structured backend errors to `ApiError`. A `401` response clears the stored token; other errors are surfaced through the existing application error handling.

## Data and workflow notes

- Successful application submission is validated and assessed by the backend before the case enters `reviewing`.
- CPF retrieval supplies verified contribution-derived income only; employment details and declared income remain applicant-entered.
- Supplementary uploads are simulated file metadata, not production document storage.
- Officer decisions and audit records are persisted by the backend.
- The deterministic rules engine produces repeatable demo results for the same inputs.
- Reset demo is visible to authenticated Officers only and restores the seeded synthetic dataset.

## Browser and runtime requirements

- Use an HTTP-served frontend; do not open `index.html` with a `file://` URL.
- The canonical frontend origin is `http://127.0.0.1:5510`.
- The backend must be available at the configured API base URL.
- No frontend package installation, bundler, or JavaScript framework is required.
