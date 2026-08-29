"""SSRF guard: refuse fetches that would target loopback/private/metadata IPs.

PRD §6.5 FR-SET-03 — default-on; the check runs before a target is handed to
any engine adapter. The guard resolves the hostname at check time and matches
each returned address against the block-lists below.

M6 added `Settings.ssrf_allow_list`: when non-empty, only targets whose
host matches an entry (suffix match) are accepted. The allow-list
*overrides* the loopback/private block for the listed hosts — the
admin opts in by adding the literal IP or hostname.
"""

import ipaddress
import socket

from app.core.config import Settings, get_settings
from app.engines.base import Target

# These ranges are unreachable from the public internet and are the canonical
# SSRF targets: loopback, private (RFC 1918 + ULA), link-local, and the cloud
# metadata service at 169.254.169.254. Testnets are allowed (admin can disable).
_BLOCKED_NETS: tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...] = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)


def is_blocked_address(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return True  # unparseable → treat as unsafe
    return any(ip in net for net in _BLOCKED_NETS)


def _matches_allow_list(host: str, allow_list: list[str]) -> bool:
    """Return True when `host` matches any allow-list entry.

    Matching is a suffix check (case-insensitive). An entry of
    `example.com` matches `example.com` and `www.example.com` but not
    `notexample.com`. IP literals match exactly.
    """
    if not allow_list:
        return False
    h = host.lower().rstrip(".")
    for entry in allow_list:
        e = entry.lower().rstrip(".")
        if not e:
            continue
        if h == e or h.endswith("." + e):
            return True
    return False


def resolve_safe(target: Target, settings: Settings | None = None) -> tuple[str, list[str]]:
    """Return (host, resolved_addresses). Raises ValueError when blocked.

    M6: the guard is a no-op when `settings.ssrf_guard_enabled` is False
    (admin intranet use case). When the guard is on and
    `settings.ssrf_allow_list` is non-empty, the target's host must
    match an entry; otherwise the standard block-by-default applies.
    """
    cfg = settings or get_settings()
    host = target.url.split("//", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    if not host:
        raise ValueError(f"target has no host: {target.url!r}")
    if not cfg.ssrf_guard_enabled:
        return host, []
    allowed_via_list = _matches_allow_list(host, cfg.ssrf_allow_list)
    # M6: when the allow-list is non-empty, only listed hosts pass.
    if cfg.ssrf_allow_list and not allowed_via_list:
        raise ValueError(
            f"SSRF guard: target {target.url!r} host {host!r} "
            f"not in allow-list {cfg.ssrf_allow_list}"
        )
    addrs = [info[4][0] for info in socket.getaddrinfo(host, None)]
    for addr in addrs:
        if is_blocked_address(addr) and not allowed_via_list:
            raise ValueError(
                f"SSRF guard: target {target.url!r} resolves to blocked address {addr}"
            )
    return host, addrs
