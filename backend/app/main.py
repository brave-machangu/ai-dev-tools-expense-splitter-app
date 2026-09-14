"""Application factory.

`create_app(repository)` wires storage → service → routes. Without a repository
the app uses the SQL database named by DATABASE_URL (see app/database.py) and
creates any missing tables at startup. Tests pass their own repository.
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_schema, database_url, make_engine
from app.errors import register_error_handlers
from app.repository import Repository
from app.routes import router, service_router
from app.service import GroupService
from app.sqlalchemy_repository import SqlAlchemyRepository

DEFAULT_CORS_ORIGINS = "http://localhost:5173"


def cors_origins() -> list[str]:
    """Allowed browser origins: comma-separated PRORATA_CORS_ORIGINS, or the Vite dev server."""
    raw = os.environ.get("PRORATA_CORS_ORIGINS") or DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app(repository: Repository | None = None) -> FastAPI:
    engine = None
    if repository is None:
        # Creating an engine doesn't connect, so importing this module (as the
        # tests do) never touches the database.
        engine = make_engine(database_url())
        repository = SqlAlchemyRepository(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if engine is not None:
            create_schema(engine)
        yield
        if engine is not None:
            engine.dispose()

    app = FastAPI(
        title="ProRata API",
        version="1.0.0",
        summary="Backend for ProRata, the no-account expense splitter.",
        lifespan=lifespan,
    )
    app.state.service = GroupService(repository)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )
    register_error_handlers(app)
    app.include_router(service_router)
    app.include_router(router)
    return app


app = create_app()
