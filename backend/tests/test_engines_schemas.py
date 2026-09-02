"""Engine config schema tests (PRD §6.1 FR-ENG-02)."""

import pytest
from pydantic import ValidationError

from app.engines.schemas import (
    PlaytrafiConfig,
    ScrapyConfig,
    config_model_for,
)


def test_playtrafi_config_defaults_are_safe() -> None:
    cfg = PlaytrafiConfig()
    assert cfg.headless is True
    assert 1 <= cfg.browser_timeout_s <= 300
    assert cfg.max_pages_per_target <= 200


def test_playtrafi_rejects_out_of_range_timeout() -> None:
    with pytest.raises(ValidationError):
        PlaytrafiConfig(browser_timeout_s=0)
    with pytest.raises(ValidationError):
        PlaytrafiConfig(browser_timeout_s=10_000)


def test_scrapy_config_parses_allowed_domains_csv() -> None:
    cfg = ScrapyConfig.model_validate({"allowed_domains": "a.test, b.test, c.test"})
    assert cfg.allowed_domains == ["a.test", "b.test", "c.test"]


def test_scrapy_rejects_negative_delay() -> None:
    with pytest.raises(ValidationError):
        ScrapyConfig(download_delay_s=-1.0)


def test_config_model_for_dispatches_by_type() -> None:
    assert config_model_for("playtrafi") is PlaytrafiConfig
    assert config_model_for("scrapy") is ScrapyConfig


def test_unknown_engine_type_raises_keyerror() -> None:
    with pytest.raises(KeyError):
        config_model_for("firecrawl")
