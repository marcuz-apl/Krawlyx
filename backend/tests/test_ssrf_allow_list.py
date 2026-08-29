"""Tests for the M6 SSRF allow-list (FR-SET-03)."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.engines.base import Target
from app.engines.ssrf import (
    _matches_allow_list,
    is_blocked_address,
    resolve_safe,
)


def _settings(**overrides) -> Settings:
    """Construct a Settings with overrides. pydantic-settings reads
    from the env, so we patch in the attributes directly."""
    s = Settings()
    for k, v in overrides.items():
        object.__setattr__(s, k, v)
    return s


def test_allow_list_exact_match() -> None:
    assert _matches_allow_list("example.com", ["example.com"]) is True


def test_allow_list_subdomain_match() -> None:
    assert _matches_allow_list("www.example.com", ["example.com"]) is True
    assert _matches_allow_list("a.b.example.com", ["example.com"]) is True


def test_allow_list_no_match() -> None:
    assert _matches_allow_list("other.com", ["example.com"]) is False
    assert _matches_allow_list("notexample.com", ["example.com"]) is False


def test_allow_list_case_insensitive() -> None:
    assert _matches_allow_list("Example.COM", ["example.com"]) is True
    assert _matches_allow_list("example.com", ["EXAMPLE.COM"]) is True


def test_allow_list_empty_rejects_everything() -> None:
    assert _matches_allow_list("example.com", []) is False


def test_resolve_safe_public_address_unchanged() -> None:
    """Without the guard, public addresses still pass; with the guard
    on and no allow-list, public addresses also pass (they're not
    in the block list)."""
    s = _settings(ssrf_guard_enabled=True, ssrf_allow_list=[])
    # example.com is a public host; should not be blocked.
    host, _ = resolve_safe(Target(target_id="t", url="https://example.com/"), s)
    assert host == "example.com"


def test_resolve_safe_blocks_loopback_by_default() -> None:
    s = _settings(ssrf_guard_enabled=True, ssrf_allow_list=[])
    with pytest.raises(ValueError, match="blocked"):
        resolve_safe(Target(target_id="t", url="http://127.0.0.1/"), s)


def test_resolve_safe_blocks_loopback_unless_allow_listed() -> None:
    s = _settings(ssrf_guard_enabled=True, ssrf_allow_list=["127.0.0.1"])
    host, _ = resolve_safe(Target(target_id="t", url="http://127.0.0.1/"), s)
    assert host == "127.0.0.1"


def test_resolve_safe_guard_disabled_passes_everything() -> None:
    """Admin use case: intranet crawl with the guard off."""
    s = _settings(ssrf_guard_enabled=False, ssrf_allow_list=[])
    host, _ = resolve_safe(Target(target_id="t", url="http://10.0.0.1/"), s)
    assert host == "10.0.0.1"


def test_is_blocked_address_basic() -> None:
    assert is_blocked_address("127.0.0.1") is True
    assert is_blocked_address("10.0.0.1") is True
    assert is_blocked_address("169.254.169.254") is True
    assert is_blocked_address("8.8.8.8") is False
