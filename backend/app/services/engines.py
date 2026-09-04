"""Engine instance service layer (PRD §6.1).

All access to the `engines` table goes through this module so the encryption
boundary (FR-ENG-03) is enforced in one place. The service layer never
imports a concrete engine module — it talks to the registry through the
CrawlEngine protocol.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from pydantic import ValidationError
from sqlalchemy import case, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.engines import registry
from app.engines.schemas import config_model_for
from app.models import EngineInstance

logger = logging.getLogger("mykrawl.engines.service")

# Per PRD FR-ENG-02, certain config keys hold secrets. This set is the
# single source of truth for which keys are redacted in API responses.
_SECRET_KEYS = {
    "api_key",
    "password",
    "token",
    "secret",
}


def _fernet() -> Fernet:
    """Derive a Fernet instance from the app secret.

    Fernet requires a 32-byte url-safe base64 key. We deterministically
    derive it from the existing app secret by SHA-256 + base64. This keeps
    the env-var surface small while still giving per-install isolation.
    """
    secret = get_settings().secret_key.encode("utf-8")
    digest = hashlib.sha256(secret).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_config(config: dict[str, Any]) -> str:
    return _fernet().encrypt(json.dumps(config).encode("utf-8")).decode("utf-8")


def decrypt_config(blob: str | None) -> dict[str, Any]:
    if not blob:
        return {}
    try:
        return json.loads(_fernet().decrypt(blob.encode("utf-8")))
    except (ValueError, OSError, InvalidToken, Exception) as exc:  # noqa: BLE001
        logger.warning("failed to decrypt engine config (key mismatch or malformed): %s", exc)
        return {}


def redact(config: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Strip secret keys; return (redacted_dict, has_secret)."""
    redacted = {k: v for k, v in config.items() if k not in _SECRET_KEYS}
    has_secret = any(k in _SECRET_KEYS for k in config)
    return redacted, has_secret


def validate_config(engine_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Run the type-specific Pydantic schema; raises ValidationError on bad config."""
    return config_model_for(engine_type).model_validate(config).model_dump()


# ---- CRUD ----


def list_engines(db: Session) -> list[EngineInstance]:
    return list(
        db.scalars(
            select(EngineInstance).order_by(
                case(
                    (EngineInstance.type == "patroy", 0),
                    (EngineInstance.type == "playtrafi", 1),
                    (EngineInstance.type == "scrapy", 2),
                    else_=3,
                ),
                EngineInstance.name,
            )
        )
    )


def list_pooled(db: Session) -> list[EngineInstance]:
    return list(
        db.scalars(
            select(EngineInstance)
            .where(EngineInstance.pooled.is_(True), EngineInstance.disabled_at.is_(None))
            .order_by(
                case(
                    (EngineInstance.type == "patroy", 0),
                    (EngineInstance.type == "playtrafi", 1),
                    (EngineInstance.type == "scrapy", 2),
                    else_=3,
                ),
                EngineInstance.name,
            )
        )
    )


def get(db: Session, engine_id: int) -> EngineInstance | None:
    return db.get(EngineInstance, engine_id)


def create(
    db: Session, *, name: str, type: str, config: dict[str, Any], pooled: bool
) -> EngineInstance:
    if type not in registry.available_types():
        raise ValueError(f"unknown engine type {type!r}")
    config = validate_config(type, config)
    row = EngineInstance(
        name=name,
        type=type,
        config_encrypted=encrypt_config(config) if config else None,
        pooled=pooled,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError(f"engine name {name!r} is already taken") from exc
    return row


def update(db: Session, engine: EngineInstance, *, patch: dict[str, Any]) -> EngineInstance:
    if "name" in patch and patch["name"] is not None:
        engine.name = patch["name"]
    if "config" in patch and patch["config"] is not None:
        engine.config_encrypted = encrypt_config(validate_config(engine.type, patch["config"]))
    if "pooled" in patch and patch["pooled"] is not None:
        engine.pooled = bool(patch["pooled"])
    if "disabled" in patch and patch["disabled"] is not None:
        engine.disabled_at = datetime.now(UTC) if patch["disabled"] else None
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("engine name conflict") from exc
    db.refresh(engine)
    return engine


def delete(db: Session, engine: EngineInstance) -> None:
    """Delete only when the engine is unreferenced (FR-ENG-06)."""
    from app.models import Job, Schedule

    job_ref = db.scalar(select(Job.id).where(Job.engine_id == engine.id).limit(1))
    schedule_ref = db.scalar(
        select(Schedule.id).where(Schedule.payload["engine_id"].as_integer() == engine.id).limit(1)
    )
    if job_ref or schedule_ref:
        raise ValueError("engine is referenced by a job or schedule; disable it instead")
    db.delete(engine)
    db.commit()


def test_engine(engine: EngineInstance) -> tuple[bool, str, int]:
    """Construct a fresh engine from the stored config and ask its health()."""
    config = decrypt_config(engine.config_encrypted)
    try:
        instance = registry.build(engine.type, config)
    except (KeyError, ValidationError, ValueError) as exc:
        return False, f"build failed: {exc}", 0
    report = instance.health()
    return report.ok, report.detail, report.latency_ms


def bootstrap_default_engines(db: Session) -> None:
    """Ensure default engine instances exist and have descriptive, clean names."""
    # 1. Patroy: Default lightweight, ultra-fast Go stealth browser engine
    patroy = db.scalar(select(EngineInstance).where(EngineInstance.type == "patroy"))
    if not patroy:
        patroy = EngineInstance(
            name="Patroy (Go Stealth Browser & Dynamic JS)",
            type="patroy",
            config_encrypted=encrypt_config({}),
            pooled=True,
        )
        db.add(patroy)
    else:
        if patroy.name in {
            "patroy",
            "Patroy",
            "Patroy (Go Stealth Browser)",
            "Patroy (Lightweight Stealth Browser & Dynamic JS)",
        }:
            patroy.name = "Patroy (Go Stealth Browser & Dynamic JS)"
        if not patroy.pooled and patroy.disabled_at is None:
            patroy.pooled = True

    # 2. Playtrafi: Python headless browser engine with Patchright & Trafilatura
    playtrafi = db.scalar(select(EngineInstance).where(EngineInstance.type == "playtrafi"))
    if not playtrafi:
        # Check if there is a legacy engine to migrate
        legacy_engine = db.scalar(
            select(EngineInstance).where(EngineInstance.type.in_(["crawl4ai"]))
        )
        if legacy_engine:
            legacy_engine.type = "playtrafi"
            legacy_engine.name = "Playtrafi (Patchright & Trafilatura)"
            if not legacy_engine.pooled and legacy_engine.disabled_at is None:
                legacy_engine.pooled = True
            playtrafi = legacy_engine
        else:
            playtrafi = EngineInstance(
                name="Playtrafi (Patchright & Trafilatura)",
                type="playtrafi",
                config_encrypted=encrypt_config({}),
                pooled=True,
            )
            db.add(playtrafi)
    else:
        if playtrafi.name in {
            "e",
            "crawl4ai",
            "Crawl4AI",
            "Crawl4AI (Browser & JS Dynamic)",
            "playtrafi",
            "Playtrafi",
            "Playtrafi (Browser & JS Dynamic)",
        }:
            playtrafi.name = "Playtrafi (Patchright & Trafilatura)"
        if not playtrafi.pooled and playtrafi.disabled_at is None:
            playtrafi.pooled = True

    # 3. Scrapy: High-throughput async HTTP spider
    scrapy = db.scalar(select(EngineInstance).where(EngineInstance.type == "scrapy"))
    if not scrapy:
        scrapy = EngineInstance(
            name="Scrapy (High-Speed HTML)",
            type="scrapy",
            config_encrypted=encrypt_config({}),
            pooled=True,
        )
        db.add(scrapy)
    else:
        if scrapy.name in {"scrapy", "Scrapy (Fast)", "Scrapy (Hi-Speed HTML)"}:
            scrapy.name = "Scrapy (High-Speed HTML)"
        if not scrapy.pooled and scrapy.disabled_at is None:
            scrapy.pooled = True

    db.commit()
