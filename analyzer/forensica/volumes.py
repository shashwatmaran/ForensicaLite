"""
Enumerating mounted volumes.

Done through the Win32 API with ctypes rather than by shelling out to wmic or
PowerShell: no subprocess, no parsing of localised output, and it stays inside
the standard library. Returns an empty list on non-Windows so the GUI can still
run against disk images anywhere.
"""

from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes
from dataclasses import dataclass
from typing import List

# GetDriveTypeW return values.
DRIVE_UNKNOWN = 0
DRIVE_NO_ROOT_DIR = 1
DRIVE_REMOVABLE = 2
DRIVE_FIXED = 3
DRIVE_REMOTE = 4
DRIVE_CDROM = 5
DRIVE_RAMDISK = 6

_DRIVE_TYPE_LABELS = {
    DRIVE_UNKNOWN: "unknown",
    DRIVE_NO_ROOT_DIR: "no root",
    DRIVE_REMOVABLE: "removable",
    DRIVE_FIXED: "fixed",
    DRIVE_REMOTE: "network",
    DRIVE_CDROM: "optical",
    DRIVE_RAMDISK: "ramdisk",
}


@dataclass(frozen=True)
class VolumeEntry:
    """A mounted volume, as offered in the source list."""

    letter: str
    label: str
    file_system: str
    drive_type: int
    total_bytes: int

    @property
    def drive_type_label(self) -> str:
        return _DRIVE_TYPE_LABELS.get(self.drive_type, "unknown")

    @property
    def is_ntfs(self) -> bool:
        return self.file_system.upper() == "NTFS"

    @property
    def is_system_drive(self) -> bool:
        import os

        system = os.environ.get("SystemDrive", "C:")
        return self.letter.upper() == system.upper()

    def describe(self) -> str:
        size = _format_size(self.total_bytes)
        label = self.label or "unlabelled"
        return f"{self.letter}  {label}  ·  {size}  ·  {self.file_system}  ·  {self.drive_type_label}"


def _format_size(total: int) -> str:
    if total <= 0:
        return "unknown size"
    units = ("bytes", "KB", "MB", "GB", "TB")
    value = float(total)
    index = 0
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    return f"{value:.1f} {units[index]}"


def list_volumes() -> List[VolumeEntry]:
    """
    Every mounted volume with a drive letter.

    Volumes that cannot be queried — an empty optical drive, a disconnected
    network share — are skipped rather than reported with junk values.
    """
    if sys.platform != "win32":
        return []

    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    except (OSError, AttributeError):
        return []

    kernel32.GetLogicalDriveStringsW.restype = wintypes.DWORD
    kernel32.GetDriveTypeW.restype = wintypes.UINT

    buffer_length = kernel32.GetLogicalDriveStringsW(0, None)
    if not buffer_length:
        return []

    buffer = ctypes.create_unicode_buffer(buffer_length)
    if not kernel32.GetLogicalDriveStringsW(buffer_length, buffer):
        return []

    # The API returns a double-null-terminated list of "C:\" strings.
    roots = [root for root in buffer[: buffer_length - 1].split("\0") if root]

    volumes: List[VolumeEntry] = []

    for root in roots:
        drive_type = kernel32.GetDriveTypeW(root)
        if drive_type in (DRIVE_NO_ROOT_DIR, DRIVE_CDROM, DRIVE_UNKNOWN):
            continue

        label_buffer = ctypes.create_unicode_buffer(261)
        fs_buffer = ctypes.create_unicode_buffer(261)

        ok = kernel32.GetVolumeInformationW(
            wintypes.LPCWSTR(root),
            label_buffer,
            ctypes.sizeof(label_buffer) // ctypes.sizeof(ctypes.c_wchar),
            None,
            None,
            None,
            fs_buffer,
            ctypes.sizeof(fs_buffer) // ctypes.sizeof(ctypes.c_wchar),
        )
        if not ok:
            # Media absent or access denied; not an error worth surfacing.
            continue

        total = ctypes.c_ulonglong(0)
        kernel32.GetDiskFreeSpaceExW(
            wintypes.LPCWSTR(root), None, ctypes.byref(total), None
        )

        volumes.append(
            VolumeEntry(
                letter=root.rstrip("\\"),
                label=label_buffer.value,
                file_system=fs_buffer.value,
                drive_type=drive_type,
                total_bytes=total.value,
            )
        )

    return volumes


def scannable_volumes() -> List[VolumeEntry]:
    """NTFS volumes only — the analyzer cannot parse anything else."""
    return [volume for volume in list_volumes() if volume.is_ntfs]


def is_elevated() -> bool:
    """True when the process has Administrator rights."""
    if sys.platform != "win32":
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return False


def relaunch_elevated(argv: List[str]) -> bool:
    """
    Restart the current program with an elevation prompt.

    Returns True when Windows accepted the request — the caller should then
    exit, because the elevated instance is a separate process.
    """
    if sys.platform != "win32":
        return False

    try:
        if getattr(sys, "frozen", False):
            # PyInstaller bundle: the exe is the thing to relaunch.
            executable = sys.executable
            parameters = " ".join(f'"{arg}"' for arg in argv)
        else:
            executable = sys.executable
            parameters = " ".join(f'"{arg}"' for arg in [sys.argv[0], *argv])

        # 'runas' triggers the UAC consent dialog. A return value above 32
        # means the shell accepted it; 5 means the user declined.
        result = ctypes.windll.shell32.ShellExecuteW(  # type: ignore[attr-defined]
            None, "runas", executable, parameters, None, 1
        )
        return int(result) > 32
    except (AttributeError, OSError):
        return False
