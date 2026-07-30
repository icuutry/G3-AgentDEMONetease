# AI Car Loan Approval & Risk Agent

## Overview

This English-only educational prototype demonstrates an integrated car-loan workflow with a browser frontend, FastAPI backend, and SQLite demo database. It includes:

- Applicant car-loan application flow
- Simulated MyInfo, CPF, and credit-data retrieval
- Deterministic risk assessment
- Loan-officer human review
- Explainable decisions
- Audit history
- Synthetic data only

This project does not represent a real financial institution and does not make binding lending decisions.

## Current features

Applicant:

- Application dashboard
- Five-step application form
- Draft saving and required-field validation
- Simulated MyInfo, CPF contribution, and credit-report retrieval
- Submission status and timeline
- Supplementary-information flow

Loan officer:

- Application review queue
- Explainable risk evidence
- Approve, reject, or request-information decisions
- Audit records

## Run locally

The Windows workflow uses the repository-root `run-demo.ps1` launcher. Install Python 3.10 and prepare the existing backend virtual environment:

```powershell
git clone <repository-url>
cd G3-AgentDEMONetease

cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

For judging, presentations, final verification, or a clean demo, use:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-demo.ps1 -FreshDemo
```

`-FreshDemo`:

- Starts the backend at `http://127.0.0.1:8000`.
- Starts the frontend at `http://127.0.0.1:5510`.
- Logs in through the normal Officer Bearer-token flow and calls `POST /demo/reset`.
- Validates exactly five current seeded applications and confirms that `CAR-2026-006` is absent before opening the browser.
- Serves every frontend file with explicit no-cache response headers.
- Opens Chrome with a temporary isolated profile when Chrome is available, avoiding cached assets and previous browser-session state.
- Removes the temporary Chrome profile when the launcher stops.

To preserve the current local demo records, use the normal launch:

```powershell
.\run-demo.ps1
```

Normal launch does not automatically reset the database. Both modes use ports `8000` and `5510`, and write runtime logs to `demo-logs/`. Press Enter in the launcher console to stop the backend, frontend, and only the isolated Chrome process created by that launcher.

> **Runtime database warning:** `backend/car_loan_agent.db` is a tracked demo runtime artifact. Local demo use may modify it; runtime database modifications must not be staged or committed.

See [frontend/README.md](frontend/README.md) for demo accounts, routes, and integration details.
