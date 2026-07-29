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

The recommended Windows workflow uses the repository-root `run-demo.ps1` launcher. Install Python 3.10, then run:

```powershell
git clone <repository-url>
cd G3-AgentDEMONetease

cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\run-demo.ps1
```

The launcher starts the API at `http://127.0.0.1:8000`, serves the frontend at `http://127.0.0.1:5510/`, and opens the demo in Chrome when available or the system default browser otherwise. Press Enter in the launcher console to stop both services. Runtime logs are written to `demo-logs/`.

See [frontend/README.md](frontend/README.md) for demo accounts, routes, and integration details.
