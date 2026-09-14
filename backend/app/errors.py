"""Domain errors and their HTTP mapping (spec §9: 404 / 409 / 422).

The service raises these without knowing about HTTP; `register_error_handlers`
turns them into `{"detail": "..."}` JSON responses.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    """Unknown group code, or no such member/expense/settlement in the group."""

    status_code = 404


class ConflictError(DomainError):
    """The change conflicts with existing data (a referenced member)."""

    status_code = 409


class RuleViolationError(DomainError):
    """A business rule that needs stored data to check was broken."""

    status_code = 422


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
