"""SSRF guard tests (PRD §6.5 FR-SET-03)."""

import pytest

from app.engines.base import Target
from app.engines.ssrf import is_blocked_address, resolve_safe


@pytest.mark.parametrize(
    "addr",
    [
        "127.0.0.1",
        "127.255.255.255",
        "10.0.0.1",
        "192.168.1.1",
        "169.254.169.254",  # cloud metadata
        "::1",
        "fc00::1",
        "fe80::1",
    ],
)
def test_blocked_addresses(addr: str) -> None:
    assert is_blocked_address(addr) is True


@pytest.mark.parametrize("addr", ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
def test_public_addresses_allowed(addr: str) -> None:
    assert is_blocked_address(addr) is False


def test_unparseable_address_is_blocked() -> None:
    assert is_blocked_address("not-an-ip") is True


def test_resolve_safe_rejects_loopback(monkeypatch) -> None:
    """DNS resolution is the only way to catch names that point to private IPs.

    We monkeypatch socket.getaddrinfo to return a loopback address, simulating
    a misconfigured DNS record or a hostile internal resolver.
    """
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("127.0.0.1", 0))],
    )
    with pytest.raises(ValueError, match="SSRF guard"):
        resolve_safe(Target(target_id="t1", url="http://example.test/path"))


def test_resolve_safe_passes_for_public_address(monkeypatch) -> None:
    from app.engines import ssrf

    monkeypatch.setattr(
        ssrf.socket,
        "getaddrinfo",
        lambda *_a, **_kw: [(2, 1, 6, "", ("1.1.1.1", 0))],
    )
    host, addrs = resolve_safe(Target(target_id="t2", url="https://example.com/"))
    assert host == "example.com"
    assert addrs == ["1.1.1.1"]
