#!/usr/bin/env python3
"""
MyKrawl SuperAdmin Password Reset Utility
==========================================
Emergency tool to reset the password and restore SuperAdmin privileges for the 'admin' account.

Usage:
  python scripts/reset_admin_password.py [NEW_PASSWORD]
  python scripts/reset_admin_password.py --username admin [NEW_PASSWORD]
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

# Add backend directory to python path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.chdir(backend_dir)


def reset_password(username: str, new_password: str | None = None) -> None:
    try:
        from app.core.db import SessionLocal
        from app.core.security import hash_password
        from app.models.user import User
    except ImportError as e:
        print(f"❌ Error importing MyKrawl backend modules: {e}")
        print("Please ensure your virtual environment is active: source backend/.venv/bin/activate")
        sys.exit(1)

    if not new_password:
        prompt_pw = getpass.getpass(f"Enter new password for user '{username}' (min 8 chars): ")
        confirm_pw = getpass.getpass("Confirm new password: ")
        if prompt_pw != confirm_pw:
            print("❌ Passwords do not match. Aborting.")
            sys.exit(1)
        new_password = prompt_pw

    if len(new_password) < 8:
        print("❌ Password must be at least 8 characters long.")
        sys.exit(1)

    hashed = hash_password(new_password)

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.password_hash = hashed
            user.role = "superadmin"
            db.commit()
            print(f"✅ Success: Password for SuperAdmin '{username}' (ID #{user.id}) has been reset.")
            print(f"🔒 Role verified: {user.role.upper()}")
        else:
            # Create user if it doesn't exist
            user = User(username=username, password_hash=hashed, role="superadmin")
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"✅ Created new SuperAdmin account '{username}' (ID #{user.id}) with the specified password.")

    print("\nYou can now sign in at http://localhost:4039/login (or http://localhost:4040/login) with:")
    print(f"  • Username: {username}")
    print(f"  • Password: {'*' * len(new_password)}")


def main():
    parser = argparse.ArgumentParser(description="Reset MyKrawl SuperAdmin password.")
    parser.add_argument("password", nargs="?", default=None, help="New password (optional; prompted if omitted)")
    parser.add_argument("--username", default="admin", help="Username to reset (default: 'admin')")
    args = parser.parse_args()

    reset_password(username=args.username, new_password=args.password)


if __name__ == "__main__":
    main()
