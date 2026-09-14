"""Application factory.

`create_app(repository)` wires storage → service → routes. The module-level
`app` uses the in-memory mock database; tests build their own app per test.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import register_error_handlers
from app.repository import InMemoryRepository, Repository
from app.routes import router
from app.service import GroupService

DEFAULT_CORS_ORIGINS = "http://localhost:5173"


def cors_origins() -> list[str]:
    """Allowed browser origins: comma-separated PRORATA_CORS_ORIGINS, or the Vite dev server."""
    raw = os.environ.get("PRORATA_CORS_ORIGINS") or DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app(repository: Repository | None = None) -> FastAPI:
    app = FastAPI(
        title="ProRata API",
        version="1.0.0",
        summary="Backend for ProRata, the no-account expense splitter.",
    )
    app.state.service = GroupService(repository if repository is not None else InMemoryRepository())

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
