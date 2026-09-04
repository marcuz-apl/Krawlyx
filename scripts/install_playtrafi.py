#!/usr/bin/env python3
"""Install or update the Playtrafi engine and its browser automation dependencies.

Installs `playtrafi` (from PyPI or Git) and provisions browser drivers via `patchright install chromium`.

Usage:
  python scripts/install_playtrafi.py [--package playtrafi]
"""

import argparse
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Install Playtrafi engine for Krawlyx")
    parser.add_argument(
        "--package",
        default="playtrafi",
        help="PyPI package name, wheel path, or Git URL for Playtrafi (default: 'playtrafi')",
    )
    parser.add_argument(
        "--fallback-patchtroy",
        action="store_true",
        default=True,
        help="Fallback to patchtroy if playtrafi is not yet available on PyPI",
    )
    parser.add_argument(
        "--skip-browsers",
        action="store_true",
        help="Skip running patchright install chromium",
    )
    args = parser.parse_args()

    print(f"Installing Playtrafi package: {args.package}...")
    cmd = [sys.executable, "-m", "pip", "install", "--upgrade", args.package]
    res = subprocess.run(cmd, check=False)
    if res.returncode != 0:
        if args.fallback_patchtroy:
            print(
                f"Notice: '{args.package}' not yet reachable on PyPI. Falling back to transition package 'patchtroy'...",
                file=sys.stderr,
            )
            fallback_cmd = [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--upgrade",
                "git+https://github.com/marcuz-apl/patchtroy.git",
            ]
            fallback_res = subprocess.run(fallback_cmd, check=False)
            if fallback_res.returncode != 0:
                print("Failed to install fallback package.", file=sys.stderr)
                return fallback_res.returncode
        else:
            print(
                f"Failed to install Playtrafi via pip (code {res.returncode})",
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

    print("✅ Playtrafi engine is successfully installed and ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
