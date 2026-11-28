from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, issue_session
from app.main import app
from app.models import ContactMessage, User
from tests._helpers import email_plain

REQUEST = {
    "name": "Example Applicant",
    "email": "applicant@example.com",
    "subject": "Krawlyx account access",
    "message": "I would like to use Krawlyx for dataset collection.",
}


@pytest.mark.asyncio
@pytest.mark.parametrize("delivery_fails", [False, True])
async def test_access_request_notifies_admin_and_requester(
    db: Session, monkeypatch: pytest.MonkeyPatch, delivery_fails: bool
) -> None:
    monkeypatch.setenv("MYKRAWL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MYKRAWL_ACCESS_REQUEST_EMAIL", "admin@example.com")

    with (
        patch("app.services.mailer.get_settings", return_value=Settings()),
        patch("app.services.access_requests.get_settings", return_value=Settings()),
        patch("smtplib.SMTP") as smtp,
    ):
        relay = smtp.return_value.__enter__.return_value
        if delivery_fails:
            relay.send_message.side_effect = OSError("Mail relay unavailable")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/messages", json=REQUEST)

    assert response.status_code == 201
    messages = [call.args[0] for call in relay.send_message.call_args_list]
    assert len(messages) == 2
    admin_email, ack_email = messages
    assert admin_email["To"] == "admin@example.com"
    assert "applicant@example.com" in email_plain(admin_email)
    assert REQUEST["message"] in email_plain(admin_email)
    assert ack_email["To"] == "applicant@example.com"
    assert "pending" in email_plain(ack_email).lower()
    assert db.scalar(select(func.count()).select_from(ContactMessage)) == 1
    assert db.scalar(select(func.count()).select_from(User)) == 0


@pytest.mark.asyncio
async def test_regular_contact_message_does_not_send_access_notification(db: Session) -> None:
    with (
        patch("app.services.access_requests.notify_admin") as notify_admin,
        patch("app.services.access_requests.notify_requester_received") as notify_requester,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/messages", json={**REQUEST, "subject": "General question"}
            )

    assert response.status_code == 201
    assert db.scalar(select(func.count()).select_from(ContactMessage)) == 1
    notify_admin.assert_not_called()
    notify_requester.assert_not_called()


@pytest.mark.asyncio
async def test_superadmin_can_review_saved_access_requests(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.mailer.send_email", lambda *args, **kwargs: False)
    owner = User(username="owner", password_hash="unused", role="superadmin")
    admin = User(username="admin", password_hash="unused", role="admin")
    db.add_all([owner, admin])
    db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        queue = "/api/messages/access-requests"
        with (
            patch("app.services.access_requests.notify_admin"),
            patch("app.services.access_requests.notify_requester_received"),
        ):
            request = await client.post("/api/messages", json=REQUEST)
        contact = await client.post("/api/messages", json={**REQUEST, "subject": "Hello"})
        assert request.status_code == contact.status_code == 201
        request_id = request.json()["id"]
        assert (await client.get(queue)).status_code == 401

        session, csrf = issue_session(admin.id)
        client.cookies.update({SESSION_COOKIE: session, CSRF_COOKIE: csrf})
        assert (await client.get(queue)).status_code == 403
        assert (
            await client.patch(
                f"{queue}/{request_id}/review",
                json={"status": "granted"},
                headers={"X-CSRF-Token": csrf},
            )
        ).status_code == 403

        session, csrf = issue_session(owner.id)
        client.cookies.update({SESSION_COOKIE: session, CSRF_COOKIE: csrf})
        headers = {"X-CSRF-Token": csrf}
        pending = await client.get(queue)
        assert pending.status_code == 200
        assert [(item["id"], item["status"], item["reviewed_at"]) for item in pending.json()] == [
            (request_id, "pending", None)
        ]
        assert (
            await client.patch(f"{queue}/{request_id}/review", json={"status": "granted"})
        ).status_code == 403
        assert (
            await client.patch(
                f"{queue}/{contact.json()['id']}/review",
                json={"status": "granted"},
                headers=headers,
            )
        ).status_code == 404
        assert (
            await client.patch(
                f"{queue}/{request_id}/review", json={"status": "bogus"}, headers=headers
            )
        ).status_code == 422

        granted = await client.patch(
            f"{queue}/{request_id}/review", json={"status": "granted"}, headers=headers
        )
        assert granted.status_code == 200
        assert granted.json()["status"] == "granted"
        assert granted.json()["requester_notified"] is False  # no SMTP in this test
        reviewed_at = granted.json()["reviewed_at"]
        assert reviewed_at
        retry = await client.patch(
            f"{queue}/{request_id}/review", json={"status": "granted"}, headers=headers
        )
        assert retry.json()["reviewed_at"] == reviewed_at

        rejected = await client.patch(
            f"{queue}/{request_id}/review", json={"status": "rejected"}, headers=headers
        )
        assert rejected.json()["status"] == "rejected"

        back = await client.patch(
            f"{queue}/{request_id}/review", json={"status": "pending"}, headers=headers
        )
        assert back.json()["status"] == "pending"
        assert back.json()["reviewed_at"] is None
        assert (await client.get(queue)).json()[0]["status"] == "pending"
    assert db.scalar(select(func.count()).select_from(User)) == 2


@pytest.mark.asyncio
async def test_status_transitions_email_requester(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MYKRAWL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MYKRAWL_SMTP_FROM", "noreply@example.com")
    owner = User(username="owner2", password_hash="unused", role="superadmin")
    db.add(owner)
    db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        queue = "/api/messages/access-requests"
        with (
            patch("app.services.access_requests.notify_admin"),
            patch("app.services.access_requests.notify_requester_received"),
        ):
            request = await client.post("/api/messages", json=REQUEST)
        request_id = request.json()["id"]
        session, csrf = issue_session(owner.id)
        client.cookies.update({SESSION_COOKIE: session, CSRF_COOKIE: csrf})
        headers = {"X-CSRF-Token": csrf}
        with (
            patch("app.services.mailer.get_settings", return_value=Settings()),
            patch("smtplib.SMTP") as smtp,
        ):
            relay = smtp.return_value.__enter__.return_value

            granted = await client.patch(
                f"{queue}/{request_id}/review",
                json={"status": "granted", "note": "Welcome aboard"},
                headers=headers,
            )
            assert granted.status_code == 200
            assert granted.json()["requester_notified"] is True
            msg = relay.send_message.call_args.args[0]
            assert msg["To"] == REQUEST["email"]
            assert msg["From"] == "noreply@example.com"
            assert "granted" in msg["Subject"].lower()
            assert "Welcome aboard" in email_plain(msg)

            calls = relay.send_message.call_count
            again = await client.patch(
                f"{queue}/{request_id}/review", json={"status": "granted"}, headers=headers
            )
            assert again.json()["requester_notified"] is False
            assert relay.send_message.call_count == calls

            rejected = await client.patch(
                f"{queue}/{request_id}/review", json={"status": "rejected"}, headers=headers
            )
            assert rejected.json()["requester_notified"] is True
            msg = relay.send_message.call_args.args[0]
            assert "declined" in msg["Subject"].lower()

            reopened = await client.patch(
                f"{queue}/{request_id}/review",
                json={"status": "pending", "note": "Tell us more about your use case"},
                headers=headers,
            )
            assert reopened.json()["requester_notified"] is True
            msg = relay.send_message.call_args.args[0]
            assert "more detail" in msg["Subject"].lower()
            assert "pending" in email_plain(msg).lower()
            assert "Tell us more about your use case" in email_plain(msg)
