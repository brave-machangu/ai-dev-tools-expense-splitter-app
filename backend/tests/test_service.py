"""Service endpoints: the API root and the health check."""

from fastapi.testclient import TestClient

from tests.helpers import assert_matches_schema


def test_root_describes_the_api(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert_matches_schema(body, "ServiceInfo")
    assert body == {
        "name": "ProRata API",
        "version": "1.0.0",
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
    }


def test_root_links_point_at_real_pages(client: TestClient) -> None:
    body = client.get("/").json()

    for key in ("docs", "openapi", "health"):
        assert client.get(body[key]).status_code == 200, key


def test_health_reports_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert_matches_schema(body, "HealthStatus")
    assert body == {"status": "ok"}


def test_health_is_readable_from_the_frontend_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
