"""
USN change journal ($Extend\\$UsnJrnl:$J).

The $MFT describes the volume as it is now. The change journal is the kernel's
log of how it got there: every create, delete, rename, move and content or
metadata change, each stamped by the kernel rather than by user-mode code. It
is how a rename or a deletion that has left no trace in the $MFT — the record
since reused, the old name overwritten — can still be shown to have happened.

$J is a sparse stream. NTFS frees the oldest part of the journal by turning it
into a sparse run, so the stream's logical size can be gigabytes while only the
tail is allocated. Only allocated runs are read here, and of those only the most
recent `limit` bytes, because the journal can be large and recent history is
what an examination needs first.

Records are not emitted one-for-one. A single operation writes several records
as reasons accumulate while the handle is open, ending in one with CLOSE set
that carries the union of them all. One timeline row per CLOSE record is one row
per operation; RENAME_OLD_NAME records are kept only to pair each rename with the
name it replaced.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

from .filetime import filetime_to_iso
from .mft import Attribute, read_runs
from .volume import RawVolume

DATA_OVERWRITE = 0x00000001
DATA_EXTEND = 0x00000002
DATA_TRUNCATION = 0x00000004
NAMED_DATA_OVERWRITE = 0x00000010
NAMED_DATA_EXTEND = 0x00000020
NAMED_DATA_TRUNCATION = 0x00000040
FILE_CREATE = 0x00000100
FILE_DELETE = 0x00000200
EA_CHANGE = 0x00000400
SECURITY_CHANGE = 0x00000800
RENAME_OLD_NAME = 0x00001000
RENAME_NEW_NAME = 0x00002000
INDEXABLE_CHANGE = 0x00004000
BASIC_INFO_CHANGE = 0x00008000
HARD_LINK_CHANGE = 0x00010000
COMPRESSION_CHANGE = 0x00020000
ENCRYPTION_CHANGE = 0x00040000
OBJECT_ID_CHANGE = 0x00080000
REPARSE_POINT_CHANGE = 0x00100000
STREAM_CHANGE = 0x00200000
TRANSACTED_CHANGE = 0x00400000
INTEGRITY_CHANGE = 0x00800000
CLOSE = 0x80000000

_REASON_NAMES: Tuple[Tuple[int, str], ...] = (
    (DATA_OVERWRITE, "DATA_OVERWRITE"),
    (DATA_EXTEND, "DATA_EXTEND"),
    (DATA_TRUNCATION, "DATA_TRUNCATION"),
    (NAMED_DATA_OVERWRITE, "NAMED_DATA_OVERWRITE"),
    (NAMED_DATA_EXTEND, "NAMED_DATA_EXTEND"),
    (NAMED_DATA_TRUNCATION, "NAMED_DATA_TRUNCATION"),
    (FILE_CREATE, "FILE_CREATE"),
    (FILE_DELETE, "FILE_DELETE"),
    (EA_CHANGE, "EA_CHANGE"),
    (SECURITY_CHANGE, "SECURITY_CHANGE"),
    (RENAME_OLD_NAME, "RENAME_OLD_NAME"),
    (RENAME_NEW_NAME, "RENAME_NEW_NAME"),
    (INDEXABLE_CHANGE, "INDEXABLE_CHANGE"),
    (BASIC_INFO_CHANGE, "BASIC_INFO_CHANGE"),
    (HARD_LINK_CHANGE, "HARD_LINK_CHANGE"),
    (COMPRESSION_CHANGE, "COMPRESSION_CHANGE"),
    (ENCRYPTION_CHANGE, "ENCRYPTION_CHANGE"),
    (OBJECT_ID_CHANGE, "OBJECT_ID_CHANGE"),
    (REPARSE_POINT_CHANGE, "REPARSE_POINT_CHANGE"),
    (STREAM_CHANGE, "STREAM_CHANGE"),
    (TRANSACTED_CHANGE, "TRANSACTED_CHANGE"),
    (INTEGRITY_CHANGE, "INTEGRITY_CHANGE"),
    (CLOSE, "CLOSE"),
)

_CONTENT_CHANGE = (
    DATA_OVERWRITE
    | DATA_EXTEND
    | DATA_TRUNCATION
    | NAMED_DATA_OVERWRITE
    | NAMED_DATA_EXTEND
    | NAMED_DATA_TRUNCATION
)

#: Smallest record that can hold a header and a one-character name.
_MIN_RECORD = 0x3C


def reason_names(reason: int) -> List[str]:
    return [name for mask, name in _REASON_NAMES if reason & mask]


@dataclass
class UsnRecord:
    usn: int
    timestamp: int
    file_record: int
    file_sequence: int
    parent_record: int
    parent_sequence: int
    reason: int
    name: str
    major_version: int


def _split_reference(raw: int) -> Tuple[int, int]:
    return raw & 0x0000_FFFF_FFFF_FFFF, (raw >> 48) & 0xFFFF


def _split_reference_128(raw: bytes) -> Tuple[int, int]:
    """
    A 128-bit FILE_ID_128. On NTFS it holds the same 64-bit reference in the
    low half; ReFS uses the full width, but ReFS is out of scope here.
    """
    return _split_reference(struct.unpack_from("<Q", raw, 0)[0])


def parse_records(data: bytes) -> Tuple[List[UsnRecord], int]:
    """
    Walk $J content, returning (records, malformed_count).

    Zero bytes between records are page padding — the journal does not let a
    record straddle a page — and are skipped eight bytes at a time. A record
    whose header is internally inconsistent is counted and skipped by its
    stated length when that is plausible, otherwise by eight bytes, so one bad
    record cannot desynchronise the rest of the page.
    """
    records: List[UsnRecord] = []
    malformed = 0
    offset = 0
    end = len(data)

    while offset + 8 <= end:
        length = struct.unpack_from("<I", data, offset)[0]
        if length == 0:
            offset += 8
            continue

        plausible = length >= _MIN_RECORD and length % 8 == 0 and offset + length <= end
        if not plausible:
            malformed += 1
            offset += 8
            continue

        major = struct.unpack_from("<H", data, offset + 4)[0]
        record = _parse_one(data, offset, length, major)
        if record is None:
            # V4 range-tracking records are well-formed but carry no name or
            # reason worth a timeline row; anything else unparseable is damage.
            if major != 4:
                malformed += 1
        else:
            records.append(record)
        offset += length

    return records, malformed


def _parse_one(data: bytes, offset: int, length: int, major: int) -> Optional[UsnRecord]:
    if major == 2:
        file_ref, parent_ref, usn, timestamp, reason = struct.unpack_from(
            "<QQqqI", data, offset + 8
        )
        file_record, file_sequence = _split_reference(file_ref)
        parent_record, parent_sequence = _split_reference(parent_ref)
        name_length, name_offset = struct.unpack_from("<HH", data, offset + 0x38)
    elif major == 3:
        if length < 0x4C:
            return None
        file_record, file_sequence = _split_reference_128(data[offset + 8 : offset + 24])
        parent_record, parent_sequence = _split_reference_128(data[offset + 24 : offset + 40])
        usn, timestamp, reason = struct.unpack_from("<qqI", data, offset + 0x28)
        name_length, name_offset = struct.unpack_from("<HH", data, offset + 0x48)
    else:
        return None

    if name_length % 2 or name_offset + name_length > length:
        return None

    start = offset + name_offset
    name = data[start : start + name_length].decode("utf-16-le", errors="replace")

    return UsnRecord(
        usn=usn,
        timestamp=timestamp,
        file_record=file_record,
        file_sequence=file_sequence,
        parent_record=parent_record,
        parent_sequence=parent_sequence,
        reason=reason,
        name=name,
        major_version=major,
    )


@dataclass
class JournalRead:
    data: bytes
    #: Bytes of allocated journal not read because of the limit.
    skipped_bytes: int
    #: Bytes the journal has released into sparse runs — history NTFS already discarded.
    sparse_bytes: int


def read_journal(
    volume: RawVolume, bytes_per_cluster: int, stream: Attribute, limit: int
) -> JournalRead:
    """
    Read the allocated tail of $J, at most `limit` bytes.

    The cut is made on a cluster boundary, which is also a journal page
    boundary, so parsing starts on a record header rather than mid-record.
    """
    allocated: List[Tuple[int, int]] = []  # (stream offset, byte length)
    position = 0
    sparse = 0

    for lcn, count in stream.runs:
        run_bytes = count * bytes_per_cluster
        if lcn is None:
            sparse += run_bytes
        else:
            allocated.append((position, run_bytes))
        position += run_bytes

    real_end = stream.real_size or position
    pieces: List[bytes] = []
    remaining = max(limit - limit % bytes_per_cluster, bytes_per_cluster)
    skipped = 0

    for start, run_bytes in reversed(allocated):
        run_end = min(start + run_bytes, real_end)
        if run_end <= start:
            continue
        span = run_end - start
        if remaining <= 0:
            skipped += span
            continue
        take = min(span, remaining)
        if take < span:
            # Keep the newest part of the run, starting on a cluster boundary.
            take -= take % bytes_per_cluster
            skipped += span - take
        read_from = run_end - take
        pieces.append(read_runs(volume, bytes_per_cluster, stream.runs, read_from, take))
        remaining -= take

    pieces.reverse()
    return JournalRead(data=b"".join(pieces), skipped_bytes=skipped, sparse_bytes=sparse)


#: Resolves (parent record, parent sequence) to a directory path, or None.
PathResolver = Callable[[int, int], Optional[str]]
#: Returns the finding ids for (record, sequence) when that record is the same file.
FindingLookup = Callable[[int, int], List[str]]


def _action(reason: int) -> str:
    if reason & FILE_DELETE:
        return "deleted"
    if reason & FILE_CREATE:
        return "created"
    if reason & RENAME_NEW_NAME:
        return "renamed"
    if reason & _CONTENT_CHANGE:
        return "modified"
    return "mft-modified"


def build_timeline_rows(
    records: List[UsnRecord],
    directory_path: PathResolver,
    findings_for: FindingLookup,
) -> List[Dict[str, object]]:
    """One timeline row per CLOSE record, with renames paired to their old names."""
    previous_name: Dict[Tuple[int, int], Tuple[str, int, int]] = {}
    rows: List[Dict[str, object]] = []

    for record in sorted(records, key=lambda r: r.usn):
        key = (record.file_record, record.file_sequence)

        if record.reason & RENAME_OLD_NAME:
            previous_name[key] = (record.name, record.parent_record, record.parent_sequence)
        if not record.reason & CLOSE:
            continue

        action = _action(record.reason)
        reasons = "|".join(reason_names(record.reason))
        detail = f"{record.name} · {reasons}"

        if action == "renamed":
            old = previous_name.pop(key, None)
            if old is not None:
                old_name, old_parent, old_parent_sequence = old
                moved = (old_parent, old_parent_sequence) != (
                    record.parent_record,
                    record.parent_sequence,
                )
                if moved:
                    action = "moved"
                    old_directory = directory_path(old_parent, old_parent_sequence)
                    old_label = (
                        f"{old_directory.rstrip(chr(92))}\\{old_name}"
                        if old_directory is not None
                        else old_name
                    )
                    detail = f"{old_label} → {record.name} · {reasons}"
                else:
                    detail = f"{old_name} → {record.name} · {reasons}"

        directory = directory_path(record.parent_record, record.parent_sequence)
        path = f"{directory.rstrip(chr(92))}\\{record.name}" if directory is not None else None

        rows.append(
            {
                "timestamp": filetime_to_iso(record.timestamp),
                "source": "usn-journal",
                "action": action,
                "recordNumber": record.file_record,
                "filePath": path,
                "detail": detail,
                "findingIds": findings_for(record.file_record, record.file_sequence),
            }
        )

    return rows

