"""SSRF guard: refuse fetches that would target loopback/private/metadata IPs.

PRD §6.5 FR-SET-03 — default-on; the check runs before a target is handed to
any engine adapter. The guard resolves the hostname at check time and matches
each returned address against the block-lists below.
"""

import ipaddress
import socket

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


def resolve_safe(target: Target) -> tuple[str, list[str]]:
    """Return (host, resolved_addresses). Raises ValueError when blocked."""
    host = target.url.split("//", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    if not host:
        raise ValueError(f"target has no host: {target.url!r}")
    addrs = [info[4][0] for info in socket.getaddrinfo(host, None)]
    for addr in addrs:
        if is_blocked_address(addr):
            raise ValueError(
                f"SSRF guard: target {target.url!r} resolves to blocked address {addr}"
            )
    return host, addrs
