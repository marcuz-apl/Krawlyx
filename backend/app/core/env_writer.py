"""Safe .env file editor and synchronization utility.

Preserves comments, empty lines, and existing variables while updating
or appending specified keys.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


def format_env_value(val: Any) -> str:
    """Format a Python value for storage in a .env file."""
    if isinstance(val, bool):
        return "true" if val else "false"
    elif isinstance(val, (int, float)):
        return str(val)
    elif isinstance(val, list):
        return ",".join(str(item) for item in val)
    elif val is None:
        return ""
    val_str = str(val)
    # Quote if contains spaces, hashes, or quotes
    if " " in val_str or "#" in val_str or '"' in val_str:
        escaped = val_str.replace('"', '\\"')
        return f'"{escaped}"'
    return val_str


def update_env_file(env_path: Path, updates: dict[str, Any]) -> None:
    """Update or append keys in an existing or new .env file.

    Args:
        env_path: Path to the .env file.
        updates: Mapping of environment variable names to their new values.
    """
    lines: list[str] = []
    if env_path.is_file():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    remaining_keys = set(updates.keys())
    new_lines: list[str] = []

    key_regex = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue

        match = key_regex.match(line)
        if match:
            k = match.group(1)
            if k in updates:
                formatted = format_env_value(updates[k])
                new_lines.append(f"{k}={formatted}")
                remaining_keys.discard(k)
                continue

        new_lines.append(line)

    # Append any keys that were not present in the file
    for k in sorted(remaining_keys):
        formatted = format_env_value(updates[k])
        new_lines.append(f"{k}={formatted}")

    # Ensure trailing newline
    content = "\n".join(new_lines) + "\n"
    env_path.parent.mkdir(parents=True, exist_ok=True)
    env_path.write_text(content, encoding="utf-8")
