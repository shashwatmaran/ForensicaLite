"""
Windows FILETIME handling.

NTFS stores timestamps as 64-bit counts of 100-nanosecond intervals since
1601-01-01 UTC. Python's datetime tops out at microsecond resolution, so the
raw integer is always carried alongside the formatted string: the 100ns
remainder is forensically meaningful (see `is_whole_second`) and would be
destroyed by converting to datetime and back.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

#: Seconds between the FILETIME epoch (1601-01-01) and the Unix epoch.
FILETIME_EPOCH_OFFSET = 11_644_473_600

HUNDRED_NS_PER_SECOND = 10_000_000

_EPOCH_1601 = datetime(1601, 1, 1, tzinfo=timezone.utc)

#: Rendered for a raw value of 0, which means "never set" rather than "1601".
_ZERO_ISO = "1601-01-01T00:00:00.000Z"


def filetime_to_datetime(raw: int) -> datetime | None:
    """Convert a raw FILETIME to an aware UTC datetime, or None if unset."""
    if raw <= 0:
        return None
    try:
        # //10 converts 100ns intervals to microseconds, discarding the
        # remainder that datetime cannot represent.
        return _EPOCH_1601 + timedelta(microseconds=raw // 10)
    except (OverflowError, OSError, ValueError):
        return None


def filetime_to_iso(raw: int) -> str:
    """Format a raw FILETIME as an ISO 8601 UTC string with milliseconds."""
    moment = filetime_to_datetime(raw)
    if moment is None:
        return _ZERO_ISO
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{moment.microsecond // 1000:03d}Z"


def to_timestamp(raw: int) -> Dict[str, Any]:
    """
    Build the schema's NtfsTimestamp object.

    Both fields are always populated: a zeroed timestamp is itself a finding
    worth surfacing, so it is reported as filetime "0" rather than omitted.
    """
    return {"iso": filetime_to_iso(raw), "filetime": str(raw if raw > 0 else 0)}


def is_whole_second(raw: int) -> bool:
    """
    True when the value has no sub-second remainder.

    Genuine filesystem activity essentially never lands on an exact second.
    Many timestomping utilities accept only second granularity and leave this
    artifact behind, which makes it a usable (if not conclusive) signal.
    """
    return raw > 0 and raw % HUNDRED_NS_PER_SECOND == 0


def now_iso() -> str:
    """Current time as an ISO 8601 UTC string with milliseconds."""
    moment = datetime.now(timezone.utc)
    return f"{moment.strftime('%Y-%m-%dT%H:%M:%S')}.{moment.microsecond // 1000:03d}Z"
