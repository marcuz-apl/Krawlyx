"""Email template API and rendering tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from tests._helpers import auth_as, email_plain

URL = "/api/settings/email-templates"


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_templates_default_override_and_reset(client: TestClient) -> None:
    csrf = auth_as(client, "tpl-admin1", "admin")
    body = client.get(URL).json()
    assert set(body["defaults"]) == set(body["templates"])
    assert body["templates"]["welcome"]["subject"] == "Your Krawlyx account"

    payload = {"templates": {"welcome": {"subject": "Hello {username}", "body": "PW: {password}"}}}
    r = client.patch(URL, json=payload, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.json()["templates"]["welcome"]["subject"] == "Hello {username}"
    assert client.get(URL).json()["templates"]["welcome"]["body"] == "PW: {password}"

    r = client.patch(URL, json={"templates": None}, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    assert r.json()["templates"]["welcome"]["subject"] == "Your Krawlyx account"


def test_templates_require_admin_and_csrf(client: TestClient) -> None:
    csrf = auth_as(client, "tpl-runner", "runner")
    assert client.get(URL).status_code == 403
    assert (
        client.patch(URL, json={"templates": None}, headers={"X-CSRF-Token": csrf}).status_code
        == 403
    )


def test_unknown_template_key_rejected(client: TestClient) -> None:
    csrf = auth_as(client, "tpl-admin2", "admin")
    r = client.patch(
        URL,
        json={"templates": {"bogus": {"subject": "s", "body": "b"}}},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 422


def test_mailer_sends_multipart_with_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import mailer

    monkeypatch.setenv("MYKRAWL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MYKRAWL_SMTP_FROM", "noreply@example.com")
    with (
        patch("app.services.mailer.get_settings", return_value=Settings()),
        patch("smtplib.SMTP") as smtp,
    ):
        ok = mailer.send_email(
            "user@example.com",
            "Subject",
            "Hello **bold**\n\n- one\n- two\n\n[site](https://example.com)",
        )
    assert ok is True
    msg = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
    parts = {part.get_content_type(): part.get_content() for part in msg.iter_parts()}
    assert "text/plain" in parts and "text/html" in parts
    html = parts["text/html"]
    assert "<strong>bold</strong>" in html
    assert "<li" in html and "one" in html
    assert 'href="https://example.com"' in html
    for marker in ("Krawlyx Team", "info@alfazen.org", "www.alfazen.org"):
        assert marker in html
        assert marker in parts["text/plain"]


def test_markdown_escapes_html() -> None:
    from app.services.email_render import markdown_to_html

    out = markdown_to_html("Hi <script>alert(1)</script> and **ok**")
    assert "<script>" not in out
    assert "&lt;script&gt;" in out
    assert "<strong>ok</strong>" in out


def test_welcome_email_uses_override(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MYKRAWL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MYKRAWL_SMTP_FROM", "noreply@example.com")
    csrf = auth_as(client, "tpl-admin3", "admin")
    r = client.patch(
        URL,
        json={
            "templates": {
                "welcome": {
                    "subject": "Welcome aboard {username}",
                    "body": "Your password is {password}",
                }
            }
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    with (
        patch("app.services.mailer.get_settings", return_value=Settings()),
        patch("smtplib.SMTP") as smtp,
    ):
        r = client.post(
            "/api/users",
            json={
                "username": "tpluser",
                "password": "tplpass-12",
                "role": "runner",
                "email": "tpl@example.com",
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert r.status_code == 201, r.text
    msg = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
    assert msg["Subject"] == "Welcome aboard tpluser"
    assert "Your password is tplpass-12" in email_plain(msg)
