"""SPA static files never join the request path onto the filesystem in our code."""

import os

os.environ.setdefault("AWS_ENDPOINT_URL", "http://localhost:4566")

import pytest
from fastapi.testclient import TestClient

from backend.main import UI_DIST, app

client = TestClient(app)
UI_BUILT = (UI_DIST / "index.html").is_file()


@pytest.mark.skipif(not UI_BUILT, reason="UI dist not built; run scripts/build-stackport-ui.sh")
def test_unknown_client_route_returns_index():
    resp = client.get("/resources/s3")
    assert resp.status_code == 200
    assert b"StackPort" in resp.content or b'id="root"' in resp.content


@pytest.mark.skipif(not UI_BUILT, reason="UI dist not built; run scripts/build-stackport-ui.sh")
def test_favicon_is_served():
    resp = client.get("/favicon.svg")
    assert resp.status_code == 200
    assert "svg" in resp.headers.get("content-type", "")


@pytest.mark.skipif(not UI_BUILT, reason="UI dist not built; run scripts/build-stackport-ui.sh")
def test_aws_icon_is_served():
    resp = client.get("/aws-icons/s3.svg")
    assert resp.status_code == 200


def test_relative_traversal_does_not_leak_backend():
    resp = client.get("/../backend/config.py")
    assert resp.status_code in (200, 404)
    assert b"STACKPORT_ALLOW_WRITES" not in resp.content


def test_encoded_traversal_does_not_leak_backend():
    resp = client.get("/%2e%2e/%2e%2e/backend/config.py")
    assert resp.status_code in (200, 404)
    assert b"STACKPORT_ALLOW_WRITES" not in resp.content


@pytest.mark.skipif(not UI_BUILT, reason="UI dist not built; run scripts/build-stackport-ui.sh")
def test_assets_dir_exists():
    assert (UI_DIST / "index.html").is_file()
