from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import LoginRequest, LoginResponse, UserOut


@dataclass(frozen=True)
class DemoAccount:
    id: str
    role: Literal["applicant", "officer"]
    email: str
    password: str
    display_name: str
    token: str
    staff_id: str | None = None


ACCOUNTS = (
    DemoAccount(
        id="applicant-demo",
        role="applicant",
        email="applicant@demo.com",
        password="demo123",
        display_name="Demo Applicant",
        token="demo-applicant-token",
    ),
    DemoAccount(
        id="officer-01",
        role="officer",
        email="officer@demo.com",
        staff_id="Officer01",
        password="demo123",
        display_name="Loan Officer 01",
        token="demo-officer-token",
    ),
)

bearer = HTTPBearer(auto_error=False)


def login(payload: LoginRequest) -> LoginResponse:
    for account in ACCOUNTS:
        supplied_identity = payload.email or payload.staffId
        accepted_identities = {account.email, account.staff_id}
        if (
            payload.role == account.role
            and supplied_identity in accepted_identities
            and payload.password == account.password
        ):
            return LoginResponse(
                accessToken=account.token,
                user=UserOut(
                    id=account.id,
                    role=account.role,
                    displayName=account.display_name,
                ),
            )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "invalid_credentials", "message": "Invalid demo credentials"},
    )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_demo_role: str | None = Header(default=None, alias="X-Demo-Role"),
) -> DemoAccount:
    token = credentials.credentials if credentials else None
    if token:
        account = next((item for item in ACCOUNTS if item.token == token), None)
        if account:
            return account

    # This header keeps local HTML integration simple while still enforcing roles.
    if x_demo_role in {"applicant", "officer"}:
        return next(item for item in ACCOUNTS if item.role == x_demo_role)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "not_authenticated", "message": "Authentication required"},
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_role(role: Literal["applicant", "officer"]):
    def dependency(user: DemoAccount = Depends(current_user)) -> DemoAccount:
        if user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": f"{role} role required"},
            )
        return user

    return dependency

