#!/usr/bin/env python3
"""Install or update the Patchtroy engine and its browser automation dependencies.

Installs `patchtroy` directly from https://github.com/marcuz-apl/patchtroy.git
and provisions browser drivers via `patchright install chromium`.

Usage:
  python scripts/install_patchtroy.py [--url https://github.com/marcuz-apl/patchtroy.git]
"""

import argparse
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install Playtrafi (formerly Patchtroy) engine for Krawlyx"
    )
    parser.add_argument(
        "--package",
        default="playtrafi",
        help="PyPI package name or Git repository URL (default: 'playtrafi')",
    )
    parser.add_argument(
        "--skip-browsers",
        action="store_true",
        help="Skip running patchright install chromium",
    )
    args = parser.parse_args()

    print(f"Installing Playtrafi engine from: {args.package}...")
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", args.package]
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        print(
            f"Failed to install Patchtroy via pip (code {res.returncode})",
            file=sys.stderr,
        )
        return res.returncode

    if not args.skip_browsers:
        print("Ensuring browser drivers are installed via patchright...")
        cmd_browsers = [sys.executable, "-m", "patchright", "install", "chromium"]
        res_browsers = subprocess.run(cmd_browsers, check=False)
        if res_browsers.returncode != 0:
            print(
                "Warning: patchright install chromium returned non-zero. System packages may be needed.",
                file=sys.stderr,
            )

    print("✅ Patchtroy engine is successfully installed and ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
