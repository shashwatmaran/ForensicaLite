"""
End-to-end scan against a synthetic volume.

Runs the real `run_scan` over a real image file, so this covers everything the
unit tests do not: the $MFT extent map, enumeration, path reconstruction,
$Bitmap-backed recovery assessment, hashing, the detectors, and the shape of the
emitted case file.
"""

from __future__ import annotations

import base64
import hashlib
import json

import pytest

from forensica import SCHEMA_VERSION
from forensica.analyze import ScanOptions, run_scan

from . import synthetic


@pytest.fixture(scope="module")
def image_path(tmp_path_factory) -> str:
    image = tmp_path_factory.mktemp("volume") / "synthetic.img"
    synthetic.write_image(str(image))
    return str(image)


@pytest.fixture(scope="module")
def case(image_path) -> dict:
    """Full scan, so assertions can address any record by number."""
    return run_scan(ScanOptions(target=image_path, output="", quiet=True, full=True))


@pytest.fixture(scope="module")
def triaged_case(image_path) -> dict:
    """Default scan, which emits only the records worth looking at."""
    return run_scan(ScanOptions(target=image_path, output="", quiet=True))


def _finding_types(case: dict) -> dict:
    counts: dict = {}
    for finding in case["findings"]:
        counts[finding["type"]] = counts.get(finding["type"], 0) + 1
    return counts


def _by_record(case: dict, record_number: int) -> dict:
    for entry in case["files"]["entries"]:
        if entry["recordNumber"] == record_number:
            return entry
    raise AssertionError(f"record {record_number} not emitted")


# ---------------------------------------------------------------------------
# Volume geometry and provenance
# ---------------------------------------------------------------------------


def test_volume_geometry_read_from_boot_sector(case):
    volume = case["volume"]
    assert volume["fileSystem"] == "NTFS"
    assert volume["bytesPerSector"] == 512
    assert volume["sectorsPerCluster"] == 8
    assert volume["bytesPerCluster"] == 4096
    assert volume["totalClusters"] == synthetic.TOTAL_CLUSTERS
    assert volume["mftStartCluster"] == synthetic.MFT_START_CLUSTER
    assert volume["mftRecordSize"] == 1024
    assert volume["serialNumber"] == "7a3c91e40b28f5d6"


def test_volume_label_and_creation_time_from_record_3(case):
    assert case["volume"]["label"] == "CASE-TEST"
    assert case["volume"]["createdAt"] == "2026-07-18T09:14:02.187Z"


def test_image_target_claims_no_drive_letter(case):
    # An image is not a mounted drive; inventing "C:" would imply the paths came
    # from the system volume.
    assert case["volume"]["driveLetter"] is None


def test_mft_extent_map_gives_correct_slot_count(case):
    assert case["volume"]["mftRecordsTotal"] == synthetic.MFT_RECORD_SLOTS


def test_schema_version_matches_web_app(case):
    assert case["schemaVersion"] == SCHEMA_VERSION


# ---------------------------------------------------------------------------
# Enumeration and paths
# ---------------------------------------------------------------------------


def test_deleted_records_counted(case):
    # Records 16, 17, 18 and 20 are unallocated.
    assert case["scan"]["mftRecordsDeleted"] == 4


def test_paths_reconstructed_through_parent_chain(case):
    assert _by_record(case, 15)["filePath"] == "\\Docs\\notes.txt"


def test_orphaned_record_has_no_path(case):
    entry = _by_record(case, 18)
    assert entry["filePath"] is None
    assert entry["fileName"] == "stage2.ps1"


# ---------------------------------------------------------------------------
# Detectors
# ---------------------------------------------------------------------------


def test_expected_finding_types(case):
    counts = _finding_types(case)

    # Two records are backdated — svchost.exe (record 14) and install.log
    # (record 19) — and each trips three timestomp detectors: created-mismatch,
    # modified-mismatch, and zeroed sub-second.
    assert counts["timestomp"] == 6
    assert counts["alternate-data-stream"] == 1
    assert counts["hidden-system-file"] == 1
    # Both backdated records also predate the volume's own creation time.
    assert counts["impossible-timestamp"] == 2
    # Records 16 (resident), 17 (reallocated), 18 (orphan) and 20 (free).
    assert counts["deleted-recoverable"] == 4
    assert counts["orphaned-file"] == 1


def test_backdated_finding_is_critical_and_carries_evidence(case):
    finding = next(
        f for f in case["findings"] if f["detectedBy"] == "si-fn-created-mismatch"
    )

    assert finding["severity"] == "critical"
    assert finding["recordNumber"] == 14
    assert finding["confidence"] == "high"

    values = {item["label"]: item["value"] for item in finding["evidence"]}
    assert values["$SI Created"] == "2019-03-12T08:00:00.000Z"
    assert values["$FN Created"] == "2026-07-20T14:32:11.442Z"
    assert values["Delta"] == "2687 days earlier"


def test_zeroed_subsecond_detected(case):
    finding = next(f for f in case["findings"] if f["detectedBy"] == "si-subsecond-zeroed")
    assert finding["recordNumber"] == 14


def test_control_file_raises_nothing(case):
    assert _by_record(case, 13)["findingIds"] == []


def test_hidden_system_only_flags_the_planted_file(case):
    findings = [f for f in case["findings"] if f["type"] == "hidden-system-file"]
    assert [f["recordNumber"] for f in findings] == [14]


def test_impossible_timestamp_compared_against_volume_creation(case):
    flagged = {
        f["recordNumber"]
        for f in case["findings"]
        if f["detectedBy"] == "si-before-volume-creation"
    }
    # install.log claims 1998; svchost.exe claims 2019. The volume was created
    # in 2026, so both are impossible.
    assert flagged == {14, 19}


# ---------------------------------------------------------------------------
# Streams
# ---------------------------------------------------------------------------


def test_alternate_data_stream_surfaced_with_both_streams(case):
    entry = _by_record(case, 15)
    names = sorted(stream["name"] for stream in entry["streams"])

    assert names == ["", "payload"]
    assert next(s for s in entry["streams"] if s["name"] == "payload")["size"] == 64


def test_resident_stream_hash_is_of_content(case):
    entry = _by_record(case, 15)
    default = next(s for s in entry["streams"] if s["name"] == "")

    assert default["hash"]["scope"] == "stream-content"
    assert default["hash"]["value"] == hashlib.sha256(b"Meeting notes.").hexdigest()


def test_deleted_nonresident_stream_hashes_the_record_not_the_content(case):
    # Those clusters may belong to another file now, so a content digest would
    # be misleading. The scope field has to say what was actually hashed.
    entry = _by_record(case, 17)
    default = next(s for s in entry["streams"] if s["name"] == "")

    assert default["hash"]["scope"] == "mft-record"


# ---------------------------------------------------------------------------
# Recovery
# ---------------------------------------------------------------------------


def test_deleted_resident_file_recovers_byte_for_byte(case):
    entry = _by_record(case, 16)
    recovery = entry["recovery"]

    assert recovery["confidence"] == "full"
    recovered = base64.b64decode(recovery["residentContentBase64"])
    assert recovered == synthetic.RESIDENT_SECRET


def test_reallocated_clusters_downgrade_to_metadata_only(case):
    # Cluster 20 is marked allocated in $Bitmap, so the content is gone.
    recovery = _by_record(case, 17)["recovery"]

    assert recovery["confidence"] == "metadata-only"
    assert recovery["clustersReallocated"] is True


def test_free_clusters_stay_partial(case):
    # Cluster 30 is free, so the content is probably intact — but NTFS gives no
    # guarantee, hence "partial" rather than "full".
    recovery = _by_record(case, 20)["recovery"]

    assert recovery["confidence"] == "partial"
    assert recovery["clustersReallocated"] is False


def test_active_files_have_no_recovery_block(case):
    assert _by_record(case, 13)["recovery"] is None


# ---------------------------------------------------------------------------
# Report shape
# ---------------------------------------------------------------------------


def test_timeline_total_count_is_honest(case):
    timeline = case["timeline"]
    # totalCount must be a real count, not an upper bound, or "showing N of M"
    # in the UI means nothing.
    assert timeline["totalCount"] >= timeline["includedCount"]
    assert all(entry["timestamp"].endswith("Z") for entry in timeline["entries"])


def test_timeline_is_sorted(case):
    stamps = [entry["timestamp"] for entry in case["timeline"]["entries"]]
    assert stamps == sorted(stamps)


def test_timeline_carries_both_mft_sources(case):
    sources = {entry["source"] for entry in case["timeline"]["entries"]}
    assert {"mft-si", "mft-fn"}.issubset(sources)


def test_statistics_counts_agree_with_emitted_records(case):
    counts = case["statistics"]["fileCounts"]

    assert counts["deleted"] == 4
    assert counts["withAlternateStreams"] == 1
    assert counts["orphaned"] == 1
    # Counts distinct records, not findings: two records, six timestomp findings.
    assert counts["timestomped"] == 2


def test_findings_by_severity_sums_to_total(case):
    by_severity = case["statistics"]["findingsBySeverity"]
    assert sum(by_severity.values()) == len(case["findings"])


def test_full_scan_emits_every_record_untruncated(case):
    assert case["files"]["truncated"] is False
    assert case["files"]["includedCount"] == case["files"]["totalCount"]


def test_default_policy_keeps_the_interesting_records_only(triaged_case):
    emitted = {entry["recordNumber"] for entry in triaged_case["files"]["entries"]}

    assert 14 in emitted  # has findings
    assert 15 in emitted  # carries an alternate data stream
    assert 16 in emitted  # deleted
    assert 13 not in emitted  # active, unremarkable — the control file

    assert triaged_case["files"]["truncated"] is True
    assert "--full" in triaged_case["files"]["inclusionPolicy"]


def test_case_file_is_json_serialisable(case):
    # The web app receives this over a file upload; anything not JSON-native
    # here would fail at the loader rather than in a test.
    assert json.loads(json.dumps(case))["schemaVersion"] == SCHEMA_VERSION


def test_findings_reference_back_to_their_records(case):
    for finding in case["findings"]:
        if finding["recordNumber"] is None:
            continue
        entry = _by_record(case, finding["recordNumber"])
        assert finding["id"] in entry["findingIds"]
