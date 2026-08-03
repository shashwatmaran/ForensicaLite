"""
Scan orchestration.

Reads the volume once, builds a FileEntry per MFT record, resolves paths,
assesses recoverability, runs the detectors, and assembles the schema-v1 case
file. Nothing here touches on-disk structures directly — that is all in mft.py.
"""

from __future__ import annotations

import base64
import hashlib
import os
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from . import SCHEMA_VERSION, __version__, bitmap as bitmap_module, boot as boot_module
from .entries import FileEntry, StreamInfo
from .filetime import filetime_to_iso, now_iso, to_timestamp
from .findings import is_filesystem_metadata, run_detectors
from .mft import (
    ATTR_DATA,
    ATTR_STANDARD_INFORMATION,
    ATTR_VOLUME_INFORMATION,
    ATTR_VOLUME_NAME,
    RECORD_ROOT,
    RECORD_VOLUME,
    MftParseError,
    MftReader,
    best_file_name,
    decode_attribute_flags,
    parse_file_name,
    parse_standard_information,
    read_runs,
)
from .mft import ATTR_FILE_NAME
from .volume import RawVolume, VolumeReadError, device_path

#: Reserved records 0-11 are filesystem metadata, not user files.
FIRST_USER_RECORD = 12

#: Cap on reported parse errors, so a badly damaged volume cannot produce a
#: gigabyte of error log.
MAX_REPORTED_ERRORS = 200

_EXTENSION_CATEGORIES: Dict[str, Tuple[str, ...]] = {
    "documents": (
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf", ".txt",
        ".rtf", ".odt", ".csv", ".md",
    ),
    "images": (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tif", ".tiff", ".webp", ".ico", ".heic"),
    "videos": (".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v"),
    "audio": (".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma"),
    "executables": (".exe", ".dll", ".sys", ".scr", ".com", ".msi", ".ocx"),
    "scripts": (".ps1", ".bat", ".cmd", ".vbs", ".js", ".py", ".sh", ".hta", ".wsf"),
    "archives": (".zip", ".rar", ".7z", ".tar", ".gz", ".cab", ".iso"),
    "logs": (".log", ".evtx", ".etl"),
}

_SIZE_BUCKETS: Tuple[Tuple[str, int, Optional[int]], ...] = (
    ("Resident (<1 KB)", 0, 1024),
    ("1 KB - 1 MB", 1024, 1_048_576),
    ("1 MB - 100 MB", 1_048_576, 104_857_600),
    ("> 100 MB", 104_857_600, None),
)


@dataclass
class ScanOptions:
    target: str
    output: str
    case_id: Optional[str] = None
    #: Emit every parsed record rather than the triaged subset.
    full: bool = False
    #: Hard ceiling on emitted file records.
    max_files: int = 5_000
    #: Stop after this many MFT records. None means the whole table.
    max_records: Optional[int] = None
    #: Largest non-resident stream to read and hash, in bytes.
    hash_limit: int = 16 * 1024 * 1024
    #: Skip content hashing entirely.
    no_hash: bool = False
    quiet: bool = False


@dataclass
class ScanContext:
    errors: List[Dict[str, Any]] = field(default_factory=list)
    records_parsed: int = 0
    records_in_use: int = 0
    records_deleted: int = 0
    files_recovered: int = 0

    def note_error(self, stage: str, record_number: Optional[int], message: str) -> None:
        if len(self.errors) >= MAX_REPORTED_ERRORS:
            return
        self.errors.append(
            {"stage": stage, "recordNumber": record_number, "message": message}
        )


def _categorise(name: str, is_directory: bool) -> str:
    if is_directory:
        return "directories"

    lowered = name.lower()
    _, extension = os.path.splitext(lowered)

    for category, extensions in _EXTENSION_CATEGORIES.items():
        if extension in extensions:
            return category

    return "other"


def _drive_prefix(target: str) -> str:
    """Derive the path prefix to prepend to reconstructed paths."""
    stripped = target.strip()

    if len(stripped) == 1 and stripped.isalpha():
        return f"{stripped.upper()}:"
    # Exactly "E:" is a drive. Anything longer is a file path, even though it
    # also starts with a drive letter — claiming "C:" for C:\cases\disk.img
    # would put the image's contents at paths implying the system drive.
    if len(stripped) == 2 and stripped[0].isalpha() and stripped[1] == ":":
        return f"{stripped[0].upper()}:"
    # Working from an image; there is no drive letter to claim.
    return ""


# ---------------------------------------------------------------------------
# Enumeration
# ---------------------------------------------------------------------------


def _build_entry(
    reader: MftReader,
    number: int,
    context: ScanContext,
) -> Optional[FileEntry]:
    try:
        record = reader.read(number)
    except MftParseError as error:
        context.note_error("mft", number, str(error))
        return None
    except VolumeReadError as error:
        context.note_error("mft", number, f"read failed: {error}")
        return None

    if record is None:
        return None

    context.records_parsed += 1
    if record.in_use:
        context.records_in_use += 1
    else:
        context.records_deleted += 1

    # Extension records (those with a base) are described by their base record.
    if record.base_record:
        return None

    if record.has_attribute_list:
        context.note_error(
            "attribute",
            number,
            "record uses $ATTRIBUTE_LIST; attributes stored in extension records were not followed",
        )

    si_attribute = record.first(ATTR_STANDARD_INFORMATION)
    if si_attribute is None or si_attribute.content is None:
        return None

    standard_information = parse_standard_information(si_attribute.content)
    if standard_information is None:
        context.note_error("attribute", number, "$STANDARD_INFORMATION too short to parse")
        return None

    names = []
    for attribute in record.all_of(ATTR_FILE_NAME):
        if attribute.content is None:
            continue
        parsed = parse_file_name(attribute.content)
        if parsed is not None:
            names.append(parsed)

    chosen = best_file_name(names)
    if chosen is None:
        return None

    streams: List[StreamInfo] = []
    data_attributes = record.all_of(ATTR_DATA)
    for attribute in data_attributes:
        streams.append(
            StreamInfo(
                name=attribute.name,
                size=attribute.real_size,
                resident=not attribute.non_resident,
            )
        )

    default = next((a for a in data_attributes if a.name == ""), None)

    return FileEntry(
        record_number=record.record_number or number,
        sequence_number=record.sequence_number,
        name=chosen.name,
        is_directory=record.is_directory,
        in_use=record.in_use,
        standard_information=standard_information,
        file_name=chosen,
        streams=streams,
        attribute_flags=decode_attribute_flags(standard_information.dos_flags),
        size=default.real_size if default else 0,
        allocated_size=default.allocated_size if default else 0,
        parent_record=chosen.parent_record,
        parent_sequence=chosen.parent_sequence,
        raw_data_attributes=data_attributes,
    )


def _resolve_paths(entries: Dict[int, FileEntry], prefix: str) -> None:
    """
    Reconstruct full paths by walking parent references up to the root.

    A parent whose sequence number no longer matches has been reused for a
    different file, which means the directory that contained this record is gone.
    That is flagged as orphaned rather than papered over with a guessed path.
    """
    resolved: Dict[int, Optional[str]] = {RECORD_ROOT: prefix}

    def resolve(number: int, seen: set) -> Optional[str]:
        if number in resolved:
            return resolved[number]
        if number in seen:
            # Cyclic parent chain; treat as unresolvable.
            return None
        seen.add(number)

        entry = entries.get(number)
        if entry is None or entry.parent_record is None:
            return None

        parent = entries.get(entry.parent_record)
        if parent is None:
            return None
        if entry.parent_sequence is not None and parent.sequence_number != entry.parent_sequence:
            return None
        if not parent.is_directory:
            return None

        parent_path = (
            prefix if entry.parent_record == RECORD_ROOT else resolve(entry.parent_record, seen)
        )
        if parent_path is None:
            return None

        combined = f"{parent_path.rstrip(chr(92))}\\{entry.name}"
        resolved[number] = combined
        return combined

    for number, entry in entries.items():
        if number == RECORD_ROOT:
            entry.path = prefix or "\\"
            continue

        path = resolve(number, set())
        entry.path = path
        entry.orphaned = path is None


# ---------------------------------------------------------------------------
# Recovery and hashing
# ---------------------------------------------------------------------------


def _assess_recovery(
    entry: FileEntry,
    volume: RawVolume,
    bytes_per_cluster: int,
    cluster_bitmap: "bitmap_module.ClusterBitmap",
    context: ScanContext,
) -> None:
    if not entry.deleted or entry.is_directory:
        return

    default = next((a for a in entry.raw_data_attributes if a.name == ""), None)
    if default is None:
        entry.recovery = {
            "confidence": "metadata-only",
            "reason": "Record has no $DATA attribute; only metadata survives.",
            "residentContentBase64": None,
            "dataRuns": [],
            "clustersReallocated": None,
        }
        return

    if not default.non_resident:
        content = (default.content or b"")[: entry.size]
        entry.recovery = {
            "confidence": "full",
            "reason": (
                f"Stream was resident: all {entry.size} bytes live inside MFT record "
                f"{entry.record_number} and were never written to disk clusters, so deletion "
                "left the content intact."
            ),
            "residentContentBase64": base64.b64encode(content).decode("ascii"),
            "dataRuns": [],
            "clustersReallocated": None,
        }
        context.files_recovered += 1
        return

    runs = [
        {"startCluster": lcn, "clusterCount": count}
        for lcn, count in default.runs
        if lcn is not None
    ]

    if not runs:
        entry.recovery = {
            "confidence": "metadata-only",
            "reason": "Non-resident stream with no readable data runs; content location unknown.",
            "residentContentBase64": None,
            "dataRuns": [],
            "clustersReallocated": None,
        }
        return

    any_allocated = cluster_bitmap.any_allocated(default.runs)
    all_allocated = cluster_bitmap.all_allocated(default.runs)

    if all_allocated:
        confidence = "metadata-only"
        reason = (
            "Every cluster in the run list has been reallocated to an active file. The record "
            "proves the file existed, but its content is gone."
        )
    elif any_allocated:
        confidence = "partial"
        reason = (
            "Data runs survive in the MFT record, but at least one run overlaps clusters now "
            "allocated to an active file. Expect a truncated or corrupt result on carve."
        )
    elif any_allocated is None:
        confidence = "partial"
        reason = (
            "Data runs survive in the MFT record. $Bitmap was unavailable, so whether the "
            "clusters have been reused could not be verified."
        )
    else:
        confidence = "partial"
        reason = (
            "Data runs survive and none of their clusters are currently allocated, so the "
            "content is likely intact — but NTFS gives no guarantee the bytes were not "
            "overwritten in place."
        )

    entry.recovery = {
        "confidence": confidence,
        "reason": reason,
        "residentContentBase64": None,
        "dataRuns": runs,
        "clustersReallocated": any_allocated,
    }

    if confidence == "partial":
        context.files_recovered += 1


def _hash_streams(
    entry: FileEntry,
    volume: RawVolume,
    bytes_per_cluster: int,
    options: ScanOptions,
    record_bytes: Optional[bytes],
    context: ScanContext,
) -> None:
    if options.no_hash:
        return

    for stream in entry.streams:
        attribute = next(
            (
                a
                for a in entry.raw_data_attributes
                if a.name == stream.name and (not a.non_resident) == stream.resident
            ),
            None,
        )
        if attribute is None:
            continue

        if stream.resident and attribute.content is not None:
            stream.hash_value = hashlib.sha256(attribute.content[: stream.size]).hexdigest()
            stream.hash_scope = "stream-content"
            continue

        # Content of a deleted non-resident stream cannot be trusted: the
        # clusters may belong to another file now. Hash what is provably ours —
        # the record — and say so, rather than publishing a misleading digest.
        if entry.deleted:
            if record_bytes:
                stream.hash_value = hashlib.sha256(record_bytes).hexdigest()
                stream.hash_scope = "mft-record"
            continue

        if stream.size > options.hash_limit or not attribute.runs:
            continue

        try:
            content = read_runs(volume, bytes_per_cluster, attribute.runs, 0, stream.size)
        except VolumeReadError as error:
            context.note_error("hash", entry.record_number, f"stream read failed: {error}")
            continue

        if len(content) < stream.size:
            context.note_error(
                "hash",
                entry.record_number,
                f"stream truncated at {len(content)} of {stream.size} bytes; not hashed",
            )
            continue

        stream.hash_value = hashlib.sha256(content).hexdigest()
        stream.hash_scope = "stream-content"


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------


def _timestamps(created: int, modified: int, mft_modified: int, accessed: int) -> Dict[str, Any]:
    return {
        "created": to_timestamp(created),
        "modified": to_timestamp(modified),
        "mftModified": to_timestamp(mft_modified),
        "accessed": to_timestamp(accessed),
    }


def _entry_to_json(entry: FileEntry) -> Dict[str, Any]:
    si = entry.standard_information
    fn = entry.file_name

    return {
        "recordNumber": entry.record_number,
        "sequenceNumber": entry.sequence_number,
        "parentRecordNumber": entry.parent_record,
        "fileName": entry.name,
        "filePath": entry.path,
        "isDirectory": entry.is_directory,
        "size": entry.size,
        "allocatedSize": entry.allocated_size,
        "isAllocated": entry.in_use,
        "status": "active" if entry.in_use else "deleted",
        "attributes": entry.attribute_flags,
        "standardInfo": _timestamps(si.created, si.modified, si.mft_modified, si.accessed),
        "fileNameInfo": (
            _timestamps(fn.created, fn.modified, fn.mft_modified, fn.accessed) if fn else None
        ),
        "streams": [stream.to_json() for stream in entry.streams],
        "recovery": entry.recovery,
        "findingIds": entry.finding_ids,
    }


def _build_timeline(entries: List[FileEntry]) -> List[Dict[str, Any]]:
    timeline: List[Dict[str, Any]] = []

    for entry in entries:
        si = entry.standard_information
        pairs = (
            ("created", si.created),
            ("modified", si.modified),
            ("mft-modified", si.mft_modified),
            ("accessed", si.accessed),
        )
        for action, raw in pairs:
            if raw <= 0:
                continue
            timeline.append(
                {
                    "timestamp": filetime_to_iso(raw),
                    "source": "mft-si",
                    "action": action,
                    "recordNumber": entry.record_number,
                    "filePath": entry.path,
                    "detail": f"$SI {action}",
                    "findingIds": entry.finding_ids,
                }
            )

        fn = entry.file_name
        if fn is None:
            continue

        fn_pairs = (
            ("created", fn.created),
            ("modified", fn.modified),
            ("mft-modified", fn.mft_modified),
            ("accessed", fn.accessed),
        )
        for action, raw in fn_pairs:
            if raw <= 0:
                continue
            timeline.append(
                {
                    "timestamp": filetime_to_iso(raw),
                    "source": "mft-fn",
                    "action": action,
                    "recordNumber": entry.record_number,
                    "filePath": entry.path,
                    "detail": f"$FN {action}",
                    "findingIds": entry.finding_ids,
                }
            )

    timeline.sort(key=lambda item: item["timestamp"])
    return timeline


def _count_timeline_entries(entries: List[FileEntry]) -> int:
    """
    Count the timeline entries that *could* be emitted for these records.

    Counted the same way _build_timeline emits — skipping zeroed timestamps —
    so the schema's totalCount is the real total rather than an upper bound. The
    "showing N of M" line in the UI is only meaningful if M is honest.
    """
    total = 0

    for entry in entries:
        si = entry.standard_information
        total += sum(
            1
            for raw in (si.created, si.modified, si.mft_modified, si.accessed)
            if raw > 0
        )

        fn = entry.file_name
        if fn is None:
            continue
        total += sum(
            1
            for raw in (fn.created, fn.modified, fn.mft_modified, fn.accessed)
            if raw > 0
        )

    return total


def _build_histogram(all_entries: List[FileEntry]) -> List[Dict[str, Any]]:
    """Per-day counts over every parsed record, not just the emitted subset."""
    buckets: Dict[str, Dict[str, Any]] = {}

    def bump(raw: int, key: str) -> None:
        if raw <= 0:
            return
        date = filetime_to_iso(raw)[:10]
        bucket = buckets.setdefault(
            date, {"date": date, "created": 0, "modified": 0, "accessed": 0, "deleted": 0}
        )
        bucket[key] += 1

    for entry in all_entries:
        si = entry.standard_information
        bump(si.created, "created")
        bump(si.modified, "modified")
        bump(si.accessed, "accessed")
        if entry.deleted:
            bump(si.mft_modified, "deleted")

    return [buckets[date] for date in sorted(buckets)]


def _build_statistics(
    all_entries: List[FileEntry], findings: List[Dict[str, Any]]
) -> Dict[str, Any]:
    file_types: Dict[str, int] = {}
    size_counts = [0] * len(_SIZE_BUCKETS)

    counts = {
        "total": len(all_entries),
        "active": 0,
        "deleted": 0,
        "directories": 0,
        "withAlternateStreams": 0,
        "timestomped": 0,
        "orphaned": 0,
    }

    timestomped_records = {
        finding["recordNumber"] for finding in findings if finding["type"] == "timestomp"
    }

    for entry in all_entries:
        category = _categorise(entry.name, entry.is_directory)
        file_types[category] = file_types.get(category, 0) + 1

        if entry.in_use:
            counts["active"] += 1
        else:
            counts["deleted"] += 1
        if entry.is_directory:
            counts["directories"] += 1
        if entry.alternate_streams:
            counts["withAlternateStreams"] += 1
        if entry.orphaned:
            counts["orphaned"] += 1

        if not entry.is_directory:
            for index, (_, minimum, maximum) in enumerate(_SIZE_BUCKETS):
                if entry.size >= minimum and (maximum is None or entry.size < maximum):
                    size_counts[index] += 1
                    break

    counts["timestomped"] = len(timestomped_records)

    findings_by_severity = {
        severity: sum(1 for f in findings if f["severity"] == severity)
        for severity in ("critical", "high", "medium", "low", "info")
    }

    findings_by_type: Dict[str, int] = {}
    for finding in findings:
        findings_by_type[finding["type"]] = findings_by_type.get(finding["type"], 0) + 1

    return {
        "fileCounts": counts,
        "fileTypes": file_types,
        "sizeBuckets": [
            {"label": label, "minBytes": minimum, "maxBytes": maximum, "count": size_counts[index]}
            for index, (label, minimum, maximum) in enumerate(_SIZE_BUCKETS)
        ],
        "histogram": _build_histogram(all_entries),
        "findingsBySeverity": findings_by_severity,
        "findingsByType": findings_by_type,
    }


def _select_emitted(
    all_entries: List[FileEntry], options: ScanOptions
) -> Tuple[List[FileEntry], str]:
    if options.full:
        selected = sorted(all_entries, key=lambda e: e.record_number)[: options.max_files]
        return selected, (
            f"Every parsed record, capped at {options.max_files} by --max-files."
            if len(all_entries) > options.max_files
            else "Every parsed record."
        )

    keep = [
        entry
        for entry in all_entries
        if entry.finding_ids or entry.deleted or entry.alternate_streams
    ]
    keep.sort(key=lambda e: (not e.finding_ids, e.record_number))
    selected = keep[: options.max_files]

    return selected, (
        "Records referenced by a finding, plus all deleted records and any record carrying an "
        "alternate data stream. Run with --full to emit every parsed record."
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run_scan(options: ScanOptions) -> Dict[str, Any]:
    started_monotonic = time.monotonic()
    started_at = now_iso()

    path = device_path(options.target)
    prefix = _drive_prefix(options.target)
    context = ScanContext()

    def log(message: str) -> None:
        if not options.quiet:
            print(message, flush=True)

    with RawVolume(path) as volume:
        log(f"[*] opened {path}")

        boot = boot_module.parse(volume.read(0, 512))
        log(
            f"[*] NTFS: {boot.bytes_per_cluster} B/cluster, "
            f"{boot.mft_record_size} B/record, $MFT at cluster {boot.mft_start_cluster}"
        )

        reader = MftReader(volume, boot)
        total_slots = reader.record_count
        limit = min(total_slots, options.max_records) if options.max_records else total_slots
        log(f"[*] $MFT holds {total_slots} record slots; scanning {limit}")

        # $Bitmap is record 6, but locate it by name to avoid relying on the
        # reserved numbering.
        cluster_bitmap = bitmap_module.ClusterBitmap(None, boot.total_clusters)
        volume_label: Optional[str] = None
        volume_created = 0

        entries: Dict[int, FileEntry] = {}

        for number in range(limit):
            entry = _build_entry(reader, number, context)

            if number == RECORD_VOLUME:
                try:
                    record = reader.read(number)
                except (MftParseError, VolumeReadError):
                    record = None
                if record is not None:
                    name_attribute = record.first(ATTR_VOLUME_NAME)
                    if name_attribute is not None and name_attribute.content:
                        volume_label = name_attribute.content.decode(
                            "utf-16-le", errors="replace"
                        ).rstrip("\x00")
                    if record.first(ATTR_VOLUME_INFORMATION) is not None:
                        si_attribute = record.first(ATTR_STANDARD_INFORMATION)
                        if si_attribute is not None and si_attribute.content:
                            parsed = parse_standard_information(si_attribute.content)
                            if parsed is not None:
                                volume_created = parsed.created

            if entry is None:
                continue

            if entry.name == "$Bitmap" and not cluster_bitmap.available:
                default = next((a for a in entry.raw_data_attributes if a.name == ""), None)
                if default is not None and default.non_resident:
                    cluster_bitmap = bitmap_module.load(
                        volume,
                        boot.bytes_per_cluster,
                        default.runs,
                        default.real_size,
                        boot.total_clusters,
                    )
                    log(
                        f"[*] $Bitmap loaded ({default.real_size} bytes)"
                        if cluster_bitmap.available
                        else "[!] $Bitmap unavailable; reallocation cannot be verified"
                    )

            entries[entry.record_number] = entry

        log(f"[*] parsed {context.records_parsed} records ({context.records_deleted} deleted)")

        _resolve_paths(entries, prefix)

        # Reserved records 0-11 are excluded by number, but $Extend's children
        # ($Quota, $ObjId, $RmMetadata and friends) sit above 12 and would
        # otherwise inflate every count and the alternate-stream statistic.
        # They are filesystem plumbing, identical on every NTFS volume, and of
        # no investigative value.
        candidates = [
            entry for entry in entries.values() if entry.record_number >= FIRST_USER_RECORD
        ]
        user_entries = [
            entry
            for entry in candidates
            if not is_filesystem_metadata(entry.name, entry.path)
        ]
        metadata_records = len(candidates) - len(user_entries)

        if metadata_records:
            log(f"[*] suppressed {metadata_records} NTFS metadata records")

        for entry in user_entries:
            _assess_recovery(entry, volume, boot.bytes_per_cluster, cluster_bitmap, context)

            record_bytes: Optional[bytes] = None
            if entry.deleted:
                try:
                    record_bytes = reader.read_record_bytes(entry.record_number)
                except VolumeReadError:
                    record_bytes = None

            _hash_streams(
                entry, volume, boot.bytes_per_cluster, options, record_bytes, context
            )

        completed_at = now_iso()
        scan_completed_filetime = _iso_to_filetime(completed_at)

        findings = run_detectors(
            user_entries,
            volume_created=volume_created,
            scan_completed=scan_completed_filetime,
        )
        log(f"[*] {len(findings)} findings raised")

        statistics = _build_statistics(user_entries, findings)
        emitted, inclusion_policy = _select_emitted(user_entries, options)

        # State the suppression in the report rather than quietly dropping rows.
        if metadata_records:
            inclusion_policy += (
                f" {metadata_records} NTFS metadata record"
                f"{'' if metadata_records == 1 else 's'} ($MFT, $Extend and its children) "
                "were excluded as filesystem plumbing."
            )

        timeline = _build_timeline(emitted)
        total_timeline = _count_timeline_entries(user_entries)

        case_id = options.case_id or _default_case_id(prefix)

        duration = round(time.monotonic() - started_monotonic, 3)

        return {
            "schemaVersion": SCHEMA_VERSION,
            "generator": {"tool": "checkup", "version": __version__, "builtAt": None},
            "volume": {
                "label": volume_label,
                "driveLetter": prefix or None,
                "serialNumber": boot.volume_serial,
                "fileSystem": "NTFS",
                "bytesPerSector": boot.bytes_per_sector,
                "sectorsPerCluster": boot.sectors_per_cluster,
                "bytesPerCluster": boot.bytes_per_cluster,
                "totalClusters": boot.total_clusters,
                "totalBytes": boot.total_bytes,
                "mftStartCluster": boot.mft_start_cluster,
                "mftRecordSize": boot.mft_record_size,
                "mftRecordsTotal": total_slots,
                "createdAt": filetime_to_iso(volume_created) if volume_created else None,
            },
            "scan": {
                "caseId": case_id,
                "startedAt": started_at,
                "completedAt": completed_at,
                "durationSeconds": duration,
                "hostname": _hostname(),
                "operator": _operator(),
                "mftRecordsParsed": context.records_parsed,
                "mftRecordsInUse": context.records_in_use,
                "mftRecordsDeleted": context.records_deleted,
                "filesRecovered": context.files_recovered,
                "errors": context.errors,
            },
            "statistics": statistics,
            "findings": findings,
            "files": {
                "truncated": len(emitted) < len(user_entries),
                "includedCount": len(emitted),
                "totalCount": len(user_entries),
                "inclusionPolicy": inclusion_policy,
                "entries": [_entry_to_json(entry) for entry in emitted],
            },
            "timeline": {
                "truncated": len(timeline) < total_timeline,
                "includedCount": len(timeline),
                "totalCount": total_timeline,
                "inclusionPolicy": (
                    "MACB entries from $SI and $FN for every emitted record. USN journal "
                    "reconstruction is not yet implemented."
                ),
                "entries": timeline,
            },
        }


def _iso_to_filetime(iso: str) -> int:
    """Inverse of filetime_to_iso, for comparing scan time against timestamps."""
    try:
        moment = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return 0
    unix_seconds = moment.timestamp()
    return int((unix_seconds + 11_644_473_600) * 10_000_000)


def _default_case_id(prefix: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    letter = prefix.rstrip(":") or "IMG"
    return f"CASE-{stamp}-{letter}"


def _hostname() -> Optional[str]:
    try:
        return socket.gethostname()
    except OSError:
        return None


def _operator() -> Optional[str]:
    user = os.environ.get("USERNAME") or os.environ.get("USER")
    domain = os.environ.get("USERDOMAIN")
    if user and domain:
        return f"{domain}\\{user}"
    return user
