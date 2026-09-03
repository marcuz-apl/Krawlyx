#!/usr/bin/env python3
"""Install or verify the Patroy binary for the current operating system.

Usage:
  python scripts/install_patroy.py [--version 1.0.0]
"""

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path
root_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root_dir / "backend"))

from app.engines.patroy_installer import (
    DEFAULT_PATROY_VERSION,
    detect_platform_and_arch,
    find_or_install_patroy,
    install_patroy,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Patroy binary for Krawlyx")
    parser.add_argument("--version", default=DEFAULT_PATROY_VERSION, help="Patroy release version")
    parser.add_argument("--force", action="store_true", help="Force re-download even if binary exists")
    args = parser.parse_args()

    os_name, arch = detect_platform_and_arch()
    print(f"Detected platform: {os_name} ({arch})")

    if not args.force:
        existing = find_or_install_patroy(auto_download=False, version=args.version)
        if existing:
            print(f"Patroy binary already available at: {existing}")
            return 0

    print(f"Downloading Patroy v{args.version} for {os_name}_{arch}...")
    try:
        path = install_patroy(version=args.version)
        print(f"Successfully installed Patroy to: {path}")
        return 0
    except Exception as exc:
        print(f"Error installing Patroy: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
