# AI Car Loan Approval & Risk Agent

## Overview

This frontend is an English-only, dependency-free demonstration of an end-to-end car-loan workflow. Applicants can create and submit applications, use simulated MyInfo, CPF, and credit-report retrieval, track progress, and provide supplementary documents. Loan officers can review a prioritized queue, inspect an explainable deterministic risk assessment, approve or reject a case, request information, and export audit records.

All people, employers, records, authorizations, and decisions are synthetic. The application does not contact external services.

## Folder structure

```text
frontend/
  index.html
  README.md
  css/
    styles.css
  js/
    app.js
    views.js
    store.js
    api.js
    risk-engine.js
    demo-data.js
```

- `index.html` contains the static application shell.
- `css/styles.css` contains the complete visual design and responsive rules.
- `js/app.js` coordinates routing, role checks, events, startup, and rendering.
- `js/views.js` contains page and section templates.
- `js/store.js` owns application state, localStorage persistence, mutations, lookups, and audit records.
- `js/api.js` is the asynchronous boundary intended for future backend integration.
- `js/risk-engine.js` contains deterministic calculations, validations, hard rules, and recommendations.
- `js/demo-data.js` contains presets, statuses, and initial synthetic records.

## Run with VS Code Live Server

1. Open the repository folder in VS Code.
2. Install the **Live Server** extension if it is not already available.
3. Right-click `frontend/index.html`.
4. Select **Open with Live Server**.

Do not open `index.html` directly with a `file://` URL because the application uses JavaScript ES modules.

## Demo accounts

| Role | Account | Password |
|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` |
| Loan officer | `officer@demo.com` | `demo123` |

The login page can fill either account automatically.

## Routes

| Route | Purpose |
|---|---|
| `#/` | Role selection |
| `#/login/applicant` | Applicant sign-in |
| `#/login/officer` | Loan-officer sign-in |
| `#/apply-home` | Applicant application list |
| `#/form/:applicationId` | Five-step application form |
| `#/status/:applicationId` | Application status and timeline |
| `#/supplement/:applicationId` | Supplementary-information submission |
| `#/queue` | Officer case queue |
| `#/case/:applicationId` | Three-column case-review workspace |
| `#/audit` | Audit-record list and CSV export |

## Current architecture

The application uses one in-memory state object backed by browser `localStorage` under the key `carloan_demo_v2`. `store.js` is the only module that reads or writes localStorage. Views receive prepared data and never access browser storage directly.

The risk engine is deterministic: identical application data and the same set of applications produce the same score, risk band, factors, hard-rule results, and recommendation. The supplied presets remain calibrated to:

- Low: score 23, recommendation `Approve`
- Medium: score 54, recommendation `Manual Review`
- High: score 77, recommendation `Reject`

Use **Reset demo** in the navigation bar to restore the initial synthetic dataset.

## Backend API boundary

`js/api.js` currently delegates to the local store while exposing asynchronous functions:

- `listApplications()`
- `getApplication(applicationId)`
- `createApplication(payload)`
- `updateApplication(applicationId, payload)`
- `submitApplication(applicationId)`
- `getRiskAssessment(applicationId)`
- `approveApplication(applicationId, payload)`
- `rejectApplication(applicationId, payload)`
- `requestSupplement(applicationId, payload)`
- `submitSupplement(applicationId, payload)`
- `getAuditLogs(applicationId)`

## Replacing the local adapter

To connect a real backend:

1. Keep the exported function names and return shapes in `js/api.js`.
2. Replace calls to `store.js` with `fetch()` calls to the corresponding backend endpoints.
3. Send and receive JSON, map backend errors to rejected promises, and handle those errors in `app.js`.
4. Move authentication and authorization enforcement to the server.
5. Stop initializing the local store in `app.js` after all reads and mutations use the backend.
6. Keep `views.js` storage-independent; it should continue to receive data from the application coordinator.

No framework, package manager, bundler, external library, font, or API is required for the current version.

## API configuration

The API adapter uses `window.CAR_LOAN_API_BASE`, falling back to `http://127.0.0.1:8000`; set the global before loading `js/app.js` when a different origin is required. Authentication tokens are kept in `sessionStorage`. After `submitSupplement()`, callers must refetch the application because the backend returns the created supplement rather than the updated application.
