"""Automatic platform-aware downloader and manager for the Patroy binary.

Supports Linux (amd64, arm64), macOS (amd64, arm64), and Windows (amd64).
Downloads official release archives from GitHub and installs to local storage.
"""

from __future__ import annotations

import io
import json
import logging
import os
import platform
import shutil
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

logger = logging.getLogger("mykrawl.engines.patroy.installer")

FALLBACK_PATROY_VERSION = "1.1.0"
DEFAULT_PATROY_VERSION = "latest"
GITHUB_REPO = "marcuz-apl/patroy"


def get_patroy_install_dir() -> Path:
    """Return the local directory where downloaded binaries are installed.

    Default: <project_root>/data/bin (or <project_root>/bin).
    """
    # Root of Krawlyx workspace
    root_dir = Path(__file__).resolve().parents[3]
    install_dir = root_dir / "data" / "bin"
    install_dir.mkdir(parents=True, exist_ok=True)
    return install_dir


def get_expected_binary_name() -> str:
    return "patroy.exe" if sys.platform in {"win32", "cygwin"} else "patroy"


def detect_platform_and_arch() -> tuple[str, str]:
    """Detect OS and machine architecture matching GitHub release assets."""
    plat = sys.platform.lower()
    if plat.startswith("linux"):
        os_name = "linux"
    elif plat.startswith("darwin"):
        os_name = "darwin"
    elif plat in {"win32", "cygwin"} or os.name == "nt":
        os_name = "windows"
    else:
        raise RuntimeError(f"Unsupported operating system for patroy binary: {sys.platform}")

    raw_arch = platform.machine().lower()
    if raw_arch in {"x86_64", "amd64", "x64"}:
        arch = "amd64"
    elif raw_arch in {"aarch64", "arm64"}:
        arch = "arm64"
    else:
        raise RuntimeError(f"Unsupported machine architecture for patroy binary: {raw_arch}")

    return os_name, arch


def resolve_latest_release() -> tuple[str, str | None]:
    """Resolve the latest release tag and matching platform asset download URL from GitHub."""
    os_name, arch = detect_platform_and_arch()
    ext = "zip" if os_name == "windows" else "tar.gz"
    expected_suffix = f"_{os_name}_{arch}.{ext}"

    # 1. Try GitHub API
    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": "Krawlyx-Patroy-Installer"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tag = str(data.get("tag_name", "")).lstrip("v")
            assets = data.get("assets", [])
            for asset in assets:
                name = asset.get("name", "")
                if name.endswith(expected_suffix):
                    return tag or FALLBACK_PATROY_VERSION, asset.get("browser_download_url")
            if tag:
                return tag, None
    except Exception as exc:  # noqa: BLE001
        logger.debug("GitHub API release check failed: %s", exc)

    # 2. Try following redirect on release URL
    latest_url = f"https://github.com/{GITHUB_REPO}/releases/latest"
    redir_req = urllib.request.Request(
        latest_url,
        headers={"User-Agent": "Krawlyx-Patroy-Installer"},
    )
    try:
        with urllib.request.urlopen(redir_req, timeout=10) as resp:
            final_url = resp.geturl()
            tag = final_url.rstrip("/").split("/")[-1].lstrip("v")
            if tag and tag != "latest":
                return tag, None
    except Exception as exc:  # noqa: BLE001
        logger.debug("GitHub redirect release check failed: %s", exc)

    return FALLBACK_PATROY_VERSION, None


def get_release_asset_name(version: str = DEFAULT_PATROY_VERSION) -> str:
    resolved_version = version
    if resolved_version == "latest":
        resolved_version, _ = resolve_latest_release()
    os_name, arch = detect_platform_and_arch()
    ext = "zip" if os_name == "windows" else "tar.gz"
    return f"patroy_{resolved_version}_{os_name}_{arch}.{ext}"


def get_release_url(version: str = DEFAULT_PATROY_VERSION) -> str:
    if version == "latest":
        tag, direct_url = resolve_latest_release()
        if direct_url:
            return direct_url
        version = tag

    asset_name = get_release_asset_name(version)
    tag = f"v{version}" if not version.startswith("v") else version
    return f"https://github.com/{GITHUB_REPO}/releases/download/{tag}/{asset_name}"


def install_patroy(version: str = DEFAULT_PATROY_VERSION, target_dir: Path | None = None) -> Path:
    """Download and install the patroy binary for the current system.

    Returns the absolute path to the executable binary.
    """
    dest_dir = target_dir or get_patroy_install_dir()
    dest_dir.mkdir(parents=True, exist_ok=True)
    exe_name = get_expected_binary_name()
    final_path = dest_dir / exe_name

    url = get_release_url(version)
    logger.info("Downloading patroy v%s for %s from %s", version, sys.platform, url)

    req = urllib.request.Request(
        url,
        headers={"User-Agent": f"Krawlyx-Installer/{version}"},
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            archive_data = resp.read()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download patroy release from {url}: {exc}. "
            "Please check network connection or verify release assets."
        ) from exc

    os_name, _ = detect_platform_and_arch()
    extracted = False

    if os_name == "windows":
        with zipfile.ZipFile(io.BytesIO(archive_data)) as zf:
            for item in zf.namelist():
                if Path(item).name.lower() == exe_name.lower():
                    final_path.write_bytes(zf.read(item))
                    extracted = True
                    break
    else:
        with tarfile.open(fileobj=io.BytesIO(archive_data), mode="r:gz") as tar:
            for member in tar.getmembers():
                if Path(member.name).name == exe_name:
                    f = tar.extractfile(member)
                    if f is not None:
                        final_path.write_bytes(f.read())
                        extracted = True
                        break

    if not extracted:
        raise RuntimeError(f"Archive from {url} did not contain executable '{exe_name}'")

    if os_name != "windows":
        final_path.chmod(0o755)

    logger.info("Successfully installed patroy to %s", final_path)
    return final_path


def find_or_install_patroy(
    configured_path: str = "patroy",
    auto_download: bool = True,
    version: str = DEFAULT_PATROY_VERSION,
) -> str | None:
    """Locate patroy on PATH or local data directory; auto-download if missing."""
    # 1. System PATH
    found = shutil.which(configured_path)
    if found:
        return found

    # 2. Direct path if caller passed a specific path
    target = Path(configured_path)
    if target.is_file() and os.access(target, os.X_OK):
        return str(target.resolve())

    # 3. Check local install directory and project bin/
    exe_name = get_expected_binary_name()
    install_dir = get_patroy_install_dir()
    root_dir = Path(__file__).resolve().parents[3]

    candidates = [
        install_dir / exe_name,
        root_dir / "bin" / exe_name,
        Path(sys.executable).parent / exe_name,
        Path.home() / ".local" / "bin" / exe_name,
        Path.home() / ".krawlyx" / "bin" / exe_name,
        Path("/usr/local/bin") / exe_name,
        Path("/usr/bin") / exe_name,
    ]

    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c.resolve())

    # 4. Auto-download if enabled
    if auto_download:
        try:
            installed = install_patroy(version=version, target_dir=install_dir)
            if installed.is_file() and os.access(installed, os.X_OK):
                return str(installed.resolve())
        except Exception as exc:  # noqa: BLE001
            logger.warning("Automatic download of patroy binary failed: %s", exc)

    return None
