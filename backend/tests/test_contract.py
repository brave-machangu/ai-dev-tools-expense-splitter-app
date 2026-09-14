"""The implementation must expose exactly the operations in _docs/openapi.yaml."""

import re

from fastapi.testclient import TestClient

from tests.helpers import load_openapi

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def normalise(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path)


def operations(paths: dict) -> dict[tuple[str, str], dict]:
    return {
        (normalise(path), method): operation
        for path, item in paths.items()
        for method, operation in item.items()
        if method in HTTP_METHODS
    }


def test_every_documented_operation_is_implemented(client: TestClient) -> None:
    documented = operations(load_openapi()["paths"])
    implemented = operations(client.app.openapi()["paths"])

    assert set(implemented) == set(documented)


def test_success_status_codes_match_the_spec(client: TestClient) -> None:
    documented = operations(load_openapi()["paths"])
    implemented = operations(client.app.openapi()["paths"])

    for key, operation in documented.items():
        expected = {code for code in operation["responses"] if code.startswith("2")}
        actual = {code for code in implemented[key]["responses"] if code.startswith("2")}
        assert actual == expected, key


def test_operation_ids_match_the_frontend_client(client: TestClient) -> None:
    documented = operations(load_openapi()["paths"])
    implemented = operations(client.app.openapi()["paths"])

    for key, operation in documented.items():
        assert implemented[key]["operationId"] == operation["operationId"], key
