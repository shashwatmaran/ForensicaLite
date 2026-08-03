"""
Detectors.

Each detector answers one question and, when it fires, emits the raw values it
based that on. Findings carry the detector's identifier so a reader can tell
which rule produced a verdict and argue with it — a finding that cannot be
traced back to its inputs is an opinion, not a conclusion.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Optional

from .entries import FileEntry
from .filetime import HUNDRED_NS_PER_SECOND, filetime_to_iso, is_whole_second

#: Directories under which HIDDEN+SYSTEM is normal rather than notable. Matched
#: as whole path components, not substrings: "E:\System Volume Information" has
#: no trailing separator, so a prefix match on "\system volume information\"
#: would miss the directory itself and report it as a finding.
_SYSTEM_DIRECTORIES = frozenset(
    {
        "windows",
        "program files",
        "program files (x86)",
        "programdata",
        "$recycle.bin",
        "system volume information",
    }
)

#: Executable and script extensions, for weighting a couple of detectors.
_EXECUTABLE_EXTENSIONS = (
    ".exe",
    ".dll",
    ".sys",
    ".scr",
    ".com",
    ".ps1",
    ".bat",
    ".cmd",
    ".vbs",
    ".js",
    ".jse",
    ".wsf",
    ".hta",
)


def _evidence(label: str, value: str, note: Optional[str] = None) -> Dict[str, Any]:
    return {"label": label, "value": value, "note": note}


def _is_executable(name: str) -> bool:
    lowered = name.lower()
    return any(lowered.endswith(ext) for ext in _EXECUTABLE_EXTENSIONS)


def _path_components(path: Optional[str]) -> List[str]:
    """Lowercased path components, with any drive designator removed."""
    if not path:
        return []
    lowered = path.lower()
    if len(lowered) > 2 and lowered[1] == ":":
        lowered = lowered[2:]
    return [part for part in lowered.split("\\") if part]


def _in_system_path(path: Optional[str]) -> bool:
    return any(part in _SYSTEM_DIRECTORIES for part in _path_components(path))


def is_filesystem_metadata(name: str, path: Optional[str]) -> bool:
    """
    True for NTFS's own metafiles.

    Everything under $Extend — $Quota, $ObjId, $Reparse, $RmMetadata and its
    children — is HIDDEN+SYSTEM by design and several carry named streams. On a
    real volume they produced ten hidden-system findings and two
    alternate-data-stream findings, all pure noise that buries the actual
    evidence. They are recognised by the leading '$' on a path component, which
    NTFS reserves for metafiles.
    """
    if name.startswith("$"):
        return True
    return any(part.startswith("$") for part in _path_components(path))


def _days_between(earlier: int, later: int) -> int:
    delta = abs(later - earlier)
    return delta // (HUNDRED_NS_PER_SECOND * 86_400)


class FindingBuilder:
    """Accumulates findings and keeps ids unique and stable."""

    def __init__(self) -> None:
        self.findings: List[Dict[str, Any]] = []
        self._counter = 0

    def add(
        self,
        entry: FileEntry,
        finding_type: str,
        severity: str,
        title: str,
        description: str,
        detected_by: str,
        confidence: str,
        evidence: List[Dict[str, Any]],
    ) -> None:
        self._counter += 1
        finding_id = f"f-{self._counter:04d}"

        self.findings.append(
            {
                "id": finding_id,
                "type": finding_type,
                "severity": severity,
                "title": title,
                "description": description,
                "recordNumber": entry.record_number,
                "filePath": entry.path,
                "detectedBy": detected_by,
                "confidence": confidence,
                "evidence": evidence,
            }
        )
        entry.finding_ids.append(finding_id)


# ---------------------------------------------------------------------------
# Individual detectors
# ---------------------------------------------------------------------------


def _detect_backdated_si(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """
    $SI earlier than $FN.

    $STANDARD_INFORMATION is writable from user mode via SetFileTime.
    $FILE_NAME is only written by the kernel on create, rename and move. $SI
    preceding $FN therefore cannot arise from normal filesystem activity.
    """
    fn = entry.file_name
    if fn is None:
        return

    si = entry.standard_information

    for field_name, label, si_value, fn_value in (
        ("created", "Created", si.created, fn.created),
        ("modified", "Modified", si.modified, fn.modified),
    ):
        if si_value <= 0 or fn_value <= 0 or si_value >= fn_value:
            continue

        days = _days_between(si_value, fn_value)
        severity = "critical" if days >= 1 else "high"

        builder.add(
            entry,
            finding_type="timestomp",
            severity=severity,
            title=f"$SI {label.lower()} time predates $FN {label.lower()} time",
            description=(
                f"The $STANDARD_INFORMATION {label.lower()} timestamp is earlier than the "
                f"$FILE_NAME {label.lower()} timestamp. $SI is writable from user mode via "
                "SetFileTime; $FN is only written by the kernel on create, rename or move. "
                "This ordering cannot occur through normal filesystem activity."
            ),
            detected_by=f"si-fn-{field_name}-mismatch",
            confidence="high",
            evidence=[
                _evidence(f"$SI {label}", filetime_to_iso(si_value), "user-settable"),
                _evidence(f"$FN {label}", filetime_to_iso(fn_value), "kernel-maintained"),
                _evidence("Delta", f"{days} days earlier", None),
                _evidence(
                    "$SI MFT-Modified",
                    filetime_to_iso(si.mft_modified),
                    "when the record itself was last touched",
                ),
            ],
        )


def _detect_zeroed_subsecond(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """
    All $SI timestamps landing on an exact second.

    NTFS counts in 100ns intervals, so real activity almost never produces a
    zero remainder across every field at once. Many timestomping tools take
    second-granularity input and leave this behind.
    """
    si = entry.standard_information
    candidates = [si.created, si.modified, si.accessed]

    if not all(value > 0 for value in candidates):
        return
    if not all(is_whole_second(value) for value in candidates):
        return

    fn = entry.file_name
    fn_note = None
    if fn is not None and fn.created > 0:
        remainder = fn.created % HUNDRED_NS_PER_SECOND
        fn_note = f"remainder {remainder} — normal" if remainder else "also whole-second"

    builder.add(
        entry,
        finding_type="timestomp",
        severity="high",
        title="Sub-second precision zeroed on all $SI timestamps",
        description=(
            "Every $SI timestamp lands on an exact whole second. NTFS records time in "
            "100-nanosecond intervals, so genuine filesystem activity almost never produces a "
            "zero remainder across all fields. Many timestomping utilities accept only "
            "second-granularity input and leave this artifact behind."
        ),
        detected_by="si-subsecond-zeroed",
        confidence="medium",
        evidence=[
            _evidence("$SI Created FILETIME", str(si.created), "remainder 0"),
            _evidence(
                "$FN Created FILETIME",
                str(fn.created) if fn and fn.created > 0 else "unavailable",
                fn_note,
            ),
            _evidence("Fields affected", "created, modified, accessed", None),
        ],
    )


def _detect_impossible_timestamps(
    entry: FileEntry,
    builder: FindingBuilder,
    volume_created: int = 0,
    scan_completed: int = 0,
    **_: Any,
) -> None:
    """Timestamps that predate the volume or lie in the future."""
    si = entry.standard_information

    if volume_created > 0 and 0 < si.created < volume_created:
        builder.add(
            entry,
            finding_type="impossible-timestamp",
            severity="medium",
            title="File claims creation before the volume was formatted",
            description=(
                "The $SI creation timestamp precedes the volume creation time recorded in "
                "$VOLUME_INFORMATION. A file cannot predate the filesystem containing it."
            ),
            detected_by="si-before-volume-creation",
            confidence="high",
            evidence=[
                _evidence("$SI Created", filetime_to_iso(si.created)),
                _evidence(
                    "Volume created", filetime_to_iso(volume_created), "from $VOLUME_INFORMATION"
                ),
                _evidence(
                    "$FN Created",
                    filetime_to_iso(entry.file_name.created) if entry.file_name else "unavailable",
                ),
            ],
        )

    if scan_completed > 0:
        for label, value in (("Created", si.created), ("Modified", si.modified)):
            if value > scan_completed:
                builder.add(
                    entry,
                    finding_type="impossible-timestamp",
                    severity="medium",
                    title=f"$SI {label.lower()} time is in the future",
                    description=(
                        f"The $SI {label.lower()} timestamp is later than the moment this scan "
                        "ran. Either the timestamp was written forward deliberately, or the "
                        "system clock was wrong when the file was written."
                    ),
                    detected_by="si-timestamp-in-future",
                    confidence="medium",
                    evidence=[
                        _evidence(f"$SI {label}", filetime_to_iso(value)),
                        _evidence("Scan completed", filetime_to_iso(scan_completed)),
                    ],
                )
                break


def _detect_alternate_streams(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """Named $DATA attributes — data hidden alongside a normal-looking file."""
    ads = entry.alternate_streams
    if not ads:
        return
    # $Repair:$Config and $Tops:$T are NTFS's own, not someone hiding data.
    if is_filesystem_metadata(entry.name, entry.path):
        return

    default = entry.default_stream
    visible_size = default.size if default else 0

    evidence = [
        _evidence(
            "Visible stream",
            f"{visible_size} bytes ({'resident' if default and default.resident else 'non-resident'})"
            if default
            else "none",
        )
    ]
    for stream in ads:
        evidence.append(
            _evidence(
                "Hidden stream",
                f"{entry.name}:{stream.name} — {stream.size} bytes",
                "resident" if stream.resident else "non-resident",
            )
        )

    largest = max(stream.size for stream in ads)
    severity = "high" if largest > visible_size else "medium"

    builder.add(
        entry,
        finding_type="alternate-data-stream",
        severity=severity,
        title=(
            f"{len(ads)} named data stream{'s' if len(ads) != 1 else ''} hidden on "
            f"{'a directory' if entry.is_directory else 'a file'}"
        ),
        description=(
            "The record carries additional $DATA attributes beyond the default stream. "
            "Alternate Data Streams do not appear in Explorer, in dir output, or in the "
            "reported file size."
        ),
        detected_by="named-data-stream-present",
        confidence="high",
        evidence=evidence,
    )


def _detect_deleted_recoverable(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """Unallocated records whose content can still be reached."""
    if not entry.deleted or entry.is_directory or entry.recovery is None:
        return

    confidence_level = entry.recovery.get("confidence")
    si = entry.standard_information

    if confidence_level == "full":
        builder.add(
            entry,
            finding_type="deleted-recoverable",
            severity="high",
            title="Deleted file fully recoverable from its MFT record",
            description=(
                "The file was small enough to be stored resident — its bytes lived inside the "
                "MFT record rather than in disk clusters. Deletion only cleared the record's "
                "in-use flag, so the content is recoverable byte-for-byte."
            ),
            detected_by="deleted-resident-content",
            confidence="high",
            evidence=[
                _evidence(
                    "Residency",
                    f"resident ({entry.size} bytes)",
                    "below the ~700 byte threshold",
                ),
                _evidence("Record in-use flag", "clear", "deleted"),
                _evidence("Recovered", f"{entry.size} of {entry.size} bytes", "complete"),
                _evidence(
                    "Deleted at",
                    filetime_to_iso(si.mft_modified),
                    "$SI MFT-modified time, the best available proxy",
                ),
            ],
        )
        return

    runs = entry.recovery.get("dataRuns") or []
    reallocated = entry.recovery.get("clustersReallocated")
    severity = "medium" if confidence_level == "partial" else "low"

    builder.add(
        entry,
        finding_type="deleted-recoverable",
        severity=severity,
        title=(
            "Deleted file partially recoverable"
            if confidence_level == "partial"
            else "Deleted file present in the MFT but content unavailable"
        ),
        description=entry.recovery.get("reason", ""),
        detected_by="deleted-nonresident-runs",
        confidence="medium",
        evidence=[
            _evidence("Size", f"{entry.size} bytes"),
            _evidence(
                "Data runs",
                f"{len(runs)} run{'s' if len(runs) != 1 else ''}, "
                f"{sum(run['clusterCount'] for run in runs)} clusters",
            ),
            _evidence(
                "Clusters reallocated",
                "yes" if reallocated else "no" if reallocated is not None else "unknown",
            ),
            _evidence("Deleted at", filetime_to_iso(si.mft_modified), "$SI MFT-modified time"),
        ],
    )


def _detect_orphaned(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """Records whose parent directory can no longer be resolved."""
    if not entry.orphaned:
        return

    builder.add(
        entry,
        finding_type="orphaned-file",
        severity="medium",
        title=f"{'Deleted ' if entry.deleted else ''}record with unresolvable parent".strip(),
        description=(
            "The record names a parent directory whose MFT entry has been reused or is "
            "unreadable, so no path can be reconstructed. The file existed; where it lived is "
            "no longer provable from the filesystem alone."
        ),
        detected_by="parent-sequence-mismatch",
        confidence="high",
        evidence=[
            _evidence("File name", entry.name, "from $FILE_NAME"),
            _evidence(
                "Parent record",
                str(entry.parent_record) if entry.parent_record is not None else "unknown",
                "sequence number does not match",
            ),
            _evidence("Path", "unresolvable"),
            _evidence("$SI Created", filetime_to_iso(entry.standard_information.created)),
        ],
    )


def _detect_hidden_system(entry: FileEntry, builder: FindingBuilder, **_: Any) -> None:
    """HIDDEN+SYSTEM on something outside a system directory."""
    flags = set(entry.attribute_flags)
    if not {"HIDDEN", "SYSTEM"}.issubset(flags):
        return
    if _in_system_path(entry.path) or is_filesystem_metadata(entry.name, entry.path):
        return

    builder.add(
        entry,
        finding_type="hidden-system-file",
        severity="medium" if _is_executable(entry.name) else "low",
        title="HIDDEN+SYSTEM attributes outside a system directory",
        description=(
            "The record carries both HIDDEN and SYSTEM attributes while living outside any "
            "Windows system directory. This combination hides a file from default Explorer "
            "views and from ordinary dir listings."
        ),
        detected_by="hidden-system-outside-system-path",
        confidence="medium",
        evidence=[
            _evidence("Attributes", ", ".join(entry.attribute_flags) or "none"),
            _evidence("Path", entry.path or "<unresolvable>", "not a system directory"),
            _evidence(
                "Executable", "yes" if _is_executable(entry.name) else "no", "by extension"
            ),
        ],
    )


#: Registered detectors, run in order against every entry.
DETECTORS: Iterable[Callable[..., None]] = (
    _detect_backdated_si,
    _detect_zeroed_subsecond,
    _detect_impossible_timestamps,
    _detect_alternate_streams,
    _detect_deleted_recoverable,
    _detect_orphaned,
    _detect_hidden_system,
)


def run_detectors(
    entries: Iterable[FileEntry], volume_created: int = 0, scan_completed: int = 0
) -> List[Dict[str, Any]]:
    """Run every detector against every entry, returning the findings."""
    builder = FindingBuilder()

    for entry in entries:
        for detector in DETECTORS:
            detector(
                entry,
                builder,
                volume_created=volume_created,
                scan_completed=scan_completed,
            )

    return builder.findings
