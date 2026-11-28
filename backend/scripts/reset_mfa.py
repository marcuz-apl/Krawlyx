#!/usr/bin/env python3
"""
Krawlyx MFA Reset Utility
=========================
Emergency tool to clear authenticator-app MFA (and any per-user enforcement)
for one account, e.g. when the device is lost.

Usage:
  python scripts/reset_mfa.py --username admin
"""

import argparse
import os
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.chdir(backend_dir)


def reset_mfa(username: str) -> None:
    from app.core.db import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            print(f"user {username!r} not found")
            sys.exit(1)
        if not user.mfa_enabled and not user.mfa_required and not user.mfa_secret_enc:
            print(f"user {username!r} has no MFA enrollment — nothing to reset")
            return
        user.mfa_secret_enc = None
        user.mfa_enabled = False
        user.mfa_required = False
        db.commit()
        print(f"MFA cleared for {username!r}; the account will continue with password-only sign-in")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Clear authenticator-app MFA for one Krawlyx account")
    parser.add_argument("--username", required=True, help="account username to reset")
    args = parser.parse_args()
    reset_mfa(args.username)


if __name__ == "__main__":
    main()