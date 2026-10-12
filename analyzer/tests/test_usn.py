"""
USN change journal: record parsing, the sparse-aware reader, and the mapping
from journal records to timeline rows — then end to end on the synthetic image.
"""

from __future__ import annotations

import struct

import pytest

from forensica import usn
from forensica.analyze import ScanOptions, run_scan
from forensica.mft import ATTR_DATA, Attribute
from forensica.volume import RawVolume

from . import synthetic
from .synthetic import usn_record_v2, usn_record_v3

FT = synthetic.FT_JOURNAL_MOVE


# ---------------------------------------------------------------------------
# Record parsing
# ---------------------------------------------------------------------------


def test_parse_v2_record_splits_references_and_name():
    raw = usn_record_v2(4096, FT, 20, 12, usn.FILE_CREATE | usn.CLOSE, "draft.docx", 7, 3)
    (record,), malformed = usn.parse_records(raw)

    assert malformed == 0
    assert (record.file_record, record.file_sequence) == (20, 7)
    assert (record.parent_record, record.parent_sequence) == (12, 3)
    assert record.usn == 4096
    assert record.timestamp == FT
    assert record.name == "draft.docx"
    assert record.major_version == 2


def test_parse_v3_record_reads_low_half_of_128_bit_references():
    raw = usn_record_v3(8192, FT, 19, 12, usn.DATA_EXTEND | usn.CLOSE, "install.log")
    (record,), _ = usn.parse_records(raw)

    assert record.major_version == 3
    assert (record.file_record, record.parent_record) == (19, 12)
    assert record.name == "install.log"


def test_page_padding_between_records_is_skipped():
    first = usn_record_v2(0, FT, 13, 12, usn.CLOSE, "a.txt")
    second = usn_record_v2(4096, FT, 14, 12, usn.CLOSE, "b.txt")
    data = first + b"\x00" * (4096 - len(first)) + second

    records, malformed = usn.parse_records(data)
    assert [r.name for r in records] == ["a.txt", "b.txt"]
    assert malformed == 0


def test_corrupt_length_is_counted_without_losing_later_records():
    bad = bytearray(usn_record_v2(0, FT, 13, 12, usn.CLOSE, "bad.txt"))
    struct.pack_into("<I", bad, 0, 0x0D)  # not 8-byte aligned, too short
    good = usn_record_v2(64, FT, 14, 12, usn.CLOSE, "good.txt")

    records, malformed = usn.parse_records(bytes(bad) + good)
    assert [r.name for r in records] == ["good.txt"]
    assert malformed >= 1


def test_v4_range_records_are_skipped_but_not_counted_as_damage():
    v4 = bytearray(0x40)
    struct.pack_into("<IHH", v4, 0, 0x40, 4, 0)
    good = usn_record_v2(64, FT, 14, 12, usn.CLOSE, "good.txt")

    records, malformed = usn.parse_records(bytes(v4) + good)
    assert [r.name for r in records] == ["good.txt"]
    assert malformed == 0


def test_reason_names_are_readable():
    assert usn.reason_names(usn.FILE_DELETE | usn.CLOSE) == ["FILE_DELETE", "CLOSE"]


# ---------------------------------------------------------------------------
# Reading $J
# ---------------------------------------------------------------------------


@pytest.fixture()
def image(tmp_path) -> str:
    return synthetic.write_image(str(tmp_path / "synthetic.img"))


def _journal_stream(real_size: int, runs) -> Attribute:
    return Attribute(ATTR_DATA, "$J", True, runs=list(runs), real_size=real_size)


def test_read_journal_skips_sparse_runs_and_reports_them(image):
    stream = _journal_stream(
        synthetic.USN_SPARSE_CLUSTERS * 4096 + len(synthetic.JOURNAL),
        [(None, synthetic.USN_SPARSE_CLUSTERS), (synthetic.USN_JOURNAL_CLUSTER, 1)],
    )
    with RawVolume(image) as volume:
        result = usn.read_journal(volume, 4096, stream, limit=64 * 1024 * 1024)

    assert result.data == synthetic.JOURNAL
    assert result.sparse_bytes == synthetic.USN_SPARSE_CLUSTERS * 4096
    assert result.skipped_bytes == 0


def test_read_journal_limit_keeps_the_newest_clusters(image):
    # Two allocated clusters; a one-cluster limit must keep the second.
    stream = _journal_stream(8192, [(synthetic.USN_JOURNAL_CLUSTER, 1), (45, 1)])
    with RawVolume(image) as volume:
        result = usn.read_journal(volume, 4096, stream, limit=4096)

    assert result.data == synthetic.SPLIT_FIRST  # cluster 45's content
    assert result.skipped_bytes == 4096


# ---------------------------------------------------------------------------
# Timeline rows
# ---------------------------------------------------------------------------


def _record(usn_value, reason, name, file_record=20, parent=12, parent_sequence=1):
    return usn.UsnRecord(
        usn=usn_value,
        timestamp=FT,
        file_record=file_record,
        file_sequence=1,
        parent_record=parent,
        parent_sequence=parent_sequence,
        reason=reason,
        name=name,
        major_version=2,
    )


def _paths(record: int, sequence: int):
    return {5: "E:", 12: "E:\\Docs"}.get(record)


def _no_findings(record: int, sequence: int):
    return []


def test_only_close_records_become_rows():
    rows = usn.build_timeline_rows(
        [
            _record(0, usn.FILE_CREATE, "a.txt"),
            _record(1, usn.FILE_CREATE | usn.DATA_EXTEND, "a.txt"),
            _record(2, usn.FILE_CREATE | usn.DATA_EXTEND | usn.CLOSE, "a.txt"),
        ],
        _paths,
        _no_findings,
    )
    assert len(rows) == 1
    assert rows[0]["action"] == "created"
    assert rows[0]["filePath"] == "E:\\Docs\\a.txt"


def test_rename_in_place_is_renamed_with_old_name():
    (row,) = usn.build_timeline_rows(
        [
            _record(0, usn.RENAME_OLD_NAME, "old.txt"),
            _record(1, usn.RENAME_NEW_NAME | usn.CLOSE, "new.txt"),
        ],
        _paths,
        _no_findings,
    )
    assert row["action"] == "renamed"
    assert row["detail"].startswith("old.txt → new.txt")


def test_rename_across_directories_is_a_move_with_old_path():
    (row,) = usn.build_timeline_rows(
        [
            _record(0, usn.RENAME_OLD_NAME, "old.txt", parent=5),
            _record(1, usn.RENAME_NEW_NAME | usn.CLOSE, "new.txt", parent=12),
        ],
        _paths,
        _no_findings,
    )
    assert row["action"] == "moved"
    assert row["detail"].startswith("E:\\old.txt → new.txt")


def test_delete_outranks_other_reasons():
    (row,) = usn.build_timeline_rows(
        [_record(0, usn.DATA_EXTEND | usn.FILE_DELETE | usn.CLOSE, "gone.txt")],
        _paths,
        _no_findings,
    )
    assert row["action"] == "deleted"


def test_unknown_parent_leaves_path_null_but_keeps_the_name():
    (row,) = usn.build_timeline_rows(
        [_record(0, usn.FILE_DELETE | usn.CLOSE, "gone.txt", parent=999)],
        _paths,
        _no_findings,
    )
    assert row["filePath"] is None
    assert row["detail"].startswith("gone.txt")


# ---------------------------------------------------------------------------
# End to end
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def full_case(tmp_path_factory) -> dict:
    image = synthetic.write_image(str(tmp_path_factory.mktemp("usn") / "synthetic.img"))
    return run_scan(ScanOptions(target=image, output="", quiet=True, full=True))


@pytest.fixture(scope="module")
def triaged_case(tmp_path_factory) -> dict:
    image = synthetic.write_image(str(tmp_path_factory.mktemp("usn") / "synthetic.img"))
    return run_scan(ScanOptions(target=image, output="", quiet=True))


def _usn_rows(case: dict):
    return [row for row in case["timeline"]["entries"] if row["source"] == "usn-journal"]


def test_journal_rows_join_the_timeline(full_case):
    actions = [(row["recordNumber"], row["action"]) for row in _usn_rows(full_case)]
    assert actions == [
        (13, "created"),
        (15, "modified"),
        (14, "mft-modified"),
        (20, "moved"),
        (synthetic.WIPED_RECORD, "created"),
        (synthetic.WIPED_RECORD, "deleted"),
        (16, "deleted"),
        (19, "modified"),
    ]


def test_journal_recovers_a_file_the_mft_has_lost(full_case):
    emitted = {entry["recordNumber"] for entry in full_case["files"]["entries"]}
    assert synthetic.WIPED_RECORD not in emitted

    deleted = [
        row
        for row in _usn_rows(full_case)
        if row["recordNumber"] == synthetic.WIPED_RECORD and row["action"] == "deleted"
    ]
    assert deleted[0]["filePath"] == "\\Docs\\exfil.zip"


def test_journal_rows_link_to_findings_on_their_records(full_case):
    stomp = next(row for row in _usn_rows(full_case) if row["recordNumber"] == 14)
    record_14_findings = {f["id"] for f in full_case["findings"] if f["recordNumber"] == 14}
    assert set(stomp["findingIds"]) == record_14_findings


def test_timestomp_findings_cite_the_journal(full_case):
    stomps = [
        f for f in full_case["findings"] if f["recordNumber"] == 14 and f["type"] == "timestomp"
    ]
    for finding in stomps:
        labels = {item["label"]: item["value"] for item in finding["evidence"]}
        assert labels["USN BASIC_INFO_CHANGE"] == "2026-07-20T14:40:03.118Z"


def test_timeline_counts_include_the_journal(full_case):
    timeline = full_case["timeline"]
    assert timeline["includedCount"] == len(timeline["entries"]) == timeline["totalCount"]
    assert "USN journal operations" in timeline["inclusionPolicy"]
    assert "released 8,192 bytes" in timeline["inclusionPolicy"]


def test_triage_keeps_deletes_and_moves_but_drops_unremarkable_rows(triaged_case):
    rows = {(row["recordNumber"], row["action"]) for row in _usn_rows(triaged_case)}
    assert (synthetic.WIPED_RECORD, "deleted") in rows
    assert (20, "moved") in rows
    # report.docx is the unremarkable control file: not emitted, not deleted.
    assert (13, "created") not in rows
    assert triaged_case["timeline"]["truncated"] is True


def test_no_usn_option_skips_the_journal(tmp_path):
    image = synthetic.write_image(str(tmp_path / "synthetic.img"))
    case = run_scan(ScanOptions(target=image, output="", quiet=True, full=True, no_usn=True))
    assert _usn_rows(case) == []
    assert "--no-usn" in case["timeline"]["inclusionPolicy"]
