#!/usr/bin/env python3
"""
Desktop entry point for checkup.

Packaged as a windowed executable, so double-clicking checkup.exe opens the
application rather than a console. The command-line interface lives in
checkup.py and ships alongside as checkup-cli.exe for scripted use.
"""

from __future__ import annotations

import sys


def main() -> int:
    try:
        from forensica.gui import launch
    except ImportError as error:
        # tkinter is stdlib but can be absent from a stripped Python build.
        # Without a console there is nowhere to print, so use a message box.
        _fatal(f"Could not start the interface: {error}")
        return 1

    try:
        return launch()
    except Exception as error:  # noqa: BLE001 - nothing above us to catch it
        _fatal(f"checkup failed to start:\n\n{error}")
        return 1


def _fatal(message: str) -> None:
    """Report a startup failure without assuming a console exists."""
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, "checkup", 0x10)
    except Exception:  # noqa: BLE001
        print(message, file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
