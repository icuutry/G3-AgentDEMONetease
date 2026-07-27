# AI Car Loan Approval & Risk Agent — Frontend

## Project status

The latest frontend is an English-only, dependency-free web application that demonstrates an end-to-end car-loan workflow for applicants and loan officers.

The visual interface and page structure are complete. The current modular frontend still uses browser `localStorage` as its data source. Backend integration has been proven separately in `index_api.html`, but that proof-of-integration file has not yet been merged into the latest modular frontend.

All applicants, employers, financial records, authorizations, risk results, and decisions used in this project are synthetic test data.

## Current folder structure

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
- `js/app.js` coordinates routing, authentication state, events, startup, and rendering.
- `js/views.js` contains page and section templates.
- `js/store.js` manages the current in-browser state and `localStorage`.
- `js/api.js` is the asynchronous adapter that will be changed to call the backend.
- `js/risk-engine.js` contains the current deterministic browser-side risk calculations.
- `js/demo-data.js` contains synthetic records, presets, and status values.

## Available user journeys

### Applicant

- Sign in with a demo applicant account.
- Create and edit a five-step loan application.
- Use simulated MyInfo, CPF, and credit-report retrieval.
- Submit an application.
- View status and timeline information.
- Submit supplementary information and file metadata.

### Loan officer

- Sign in with a demo officer account.
- View and filter the application queue.
- Open a three-column case-review workspace.
- Review risk score, factors, hard rules, metrics, and recommendation.
- Approve, reject, or request additional information.
- Review and export audit records.
- Reset the synthetic demonstration dataset.

## Frontend routes

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
| `#/case/:applicationId` | Officer case-review workspace |
| `#/audit` | Audit-record list and CSV export |

## Run the current frontend locally

The frontend uses JavaScript ES modules and must be served over HTTP.

1. Open the repository in VS Code.
2. Install the **Live Server** extension.
3. Right-click `frontend/index.html`.
4. Select **Open with Live Server**.

Do not open the file through a `file://` URL.

## Demo accounts

| Role | Account | Password |
|---|---|---|
| Applicant | `applicant@demo.com` | `demo123` |
| Loan officer | `officer@demo.com` or `Officer01` | `demo123` |

## Risk-engine alignment

The frontend presets and backend rule engine are calibrated to the same baseline:

| Persona | Score | Recommendation |
|---|---:|---|
| Low risk | 23 | `Approve` |
| Medium risk | 54 | `Manual Review` |
| High risk | 77 | `Reject` |

The browser-side engine is useful for offline UI development. After backend integration, persisted and trusted decisions must use the backend risk result.

## Backend integration status

A separate `index_api.html` proof of integration already demonstrates:

- API login and bearer-token handling;
- application creation, retrieval, update, and submission;
- backend risk assessment and sensitivity testing;
- officer decisions;
- supplementary-information submission;
- audit-log retrieval;
- backend demo reset;
- removal of business-data persistence from `localStorage`.

The final integration should keep the latest `index.html`, CSS, and view modules unchanged. The proven request logic should be moved into `js/api.js`, with only small authentication and startup changes in `js/app.js`.

## API adapter contract

`js/api.js` should preserve these exported functions:

```text
listApplications()
getApplication(applicationId)
createApplication(payload)
updateApplication(applicationId, payload)
submitApplication(applicationId)
getRiskAssessment(applicationId)
approveApplication(applicationId, payload)
rejectApplication(applicationId, payload)
requestSupplement(applicationId, payload)
submitSupplement(applicationId, payload)
getAuditLogs(applicationId)
```

Recommended additional functions:

```text
login(credentials)
getCurrentUser()
resetDemo()
authorizeMyInfo(personaId)
getCpfRecord(personaId)
getCreditReport(personaId)
```

The adapter should:

- send and receive JSON;
- store the demo access token in `sessionStorage`;
- add `Authorization: Bearer <token>` to authenticated requests;
- convert backend errors into rejected promises;
- map backend list envelopes such as `{ "items": [], "total": 0 }` to the shapes expected by the UI;
- send only supported application fields;
- convert backend risk codes to the display values expected by the views.

## Backend endpoint mapping

| Frontend action | Backend endpoint |
|---|---|
| Login | `POST /auth/login` |
| Restore login | `GET /auth/me` |
| List applications | `GET /applications` |
| Get application | `GET /applications/{id}` |
| Create application | `POST /applications` |
| Save draft | `PATCH /applications/{id}` |
| Submit application | `POST /applications/{id}/submit` |
| Get risk assessment | `GET /applications/{id}/risk-assessment` |
| Run officer sensitivity test | `POST /applications/{id}/evaluate` |
| Approve/reject/request information | `POST /applications/{id}/decision` |
| Submit supplementary information | `POST /applications/{id}/supplements` |
| Get audit records | `GET /audit-logs?applicationId={id}` |
| Reset demo data | `POST /demo/reset` |

## Remaining frontend work

1. Replace the local-store implementation inside `js/api.js` with `fetch()` requests.
2. Add login, token restoration, logout, and expired-session handling.
3. Stop initializing `store.js` after all reads and writes use the backend.
4. Replace local MyInfo, CPF, and credit-report generation with backend Mock API calls.
5. Keep `views.js` independent of storage and transport details.
6. Display loading, validation, authorization, network, and server errors clearly.
7. Configure the API base URL for local development and deployment.
8. Run applicant-to-officer browser tests against the deployed backend.

## Mock-data requirements

The final demonstration should use a frozen, versioned set of synthetic personas. Mock retrieval must be stable and reproducible; the application must not ask a language model to invent new personal data on every request.

The interface should clearly display:

> Simulated authorization · Test data

No real personal, credit, CPF, Singpass, or MyInfo information is used in the current version.

## Recommended deployment

For the final submission, serve the frontend and API from the same HTTPS origin where practical:

```text
https://demo.example.com/
https://demo.example.com/applications
```

Same-origin deployment avoids most CORS and API-base configuration problems. If the frontend and backend use different domains, the backend must explicitly allow the deployed frontend origin.

## Final acceptance criteria

- The latest English `index.html` and its visual design are preserved.
- The browser no longer uses `localStorage` as the source of truth.
- Refreshing the page reloads persisted applications from the backend.
- Applicant and officer permissions are enforced by the server.
- The three reference personas return scores 23, 54, and 77.
- MyInfo, CPF, and credit-report buttons call stable backend Mock APIs.
- Decisions and supplementary submissions appear in the audit log.
- The deployed HTTPS URL can be opened without running a local command.

