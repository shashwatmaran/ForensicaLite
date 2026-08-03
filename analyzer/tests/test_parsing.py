"""
Unit tests for the binary parsing layer.

These build synthetic structures byte by byte, so they run anywhere — no
volume, no admin, no Windows. That matters: the parsing is the part most likely
to be subtly wrong, and it is the part hardest to debug against a real disk.
"""

from __future__ import annotations

import struct

import pytest

from forensica import boot
from forensica.filetime import filetime_to_iso, is_whole_second, to_timestamp
from forensica.findings import _in_system_path, is_filesystem_metadata
from forensica.mft import (
    ATTR_DATA,
    ATTR_FILE_NAME,
    ATTR_STANDARD_INFORMATION,
    NAMESPACE_DOS,
    NAMESPACE_WIN32,
    FileNameAttribute,
    FixupError,
    apply_fixups,
    best_file_name,
    decode_attribute_flags,
    decode_data_runs,
    parse_file_name,
    parse_record,
    parse_standard_information,
)

SECTOR = 512
RECORD_SIZE = 1024

# The two FILETIME values planted in the web app's sample fixture. Asserting
# them here keeps the JS generator and the Python analyzer agreeing on the
# epoch conversion.
FT_2019_03_12_08_00_00 = 131_968_512_000_000_000
FT_2026_07_20_14_32_11_442 = 134_290_315_314_420_000


# ---------------------------------------------------------------------------
# FILETIME
# ---------------------------------------------------------------------------


def test_filetime_matches_sample_fixture_values():
    assert filetime_to_iso(FT_2019_03_12_08_00_00) == "2019-03-12T08:00:00.000Z"
    assert filetime_to_iso(FT_2026_07_20_14_32_11_442) == "2026-07-20T14:32:11.442Z"


def test_whole_second_detection():
    assert is_whole_second(FT_2019_03_12_08_00_00) is True
    assert is_whole_second(FT_2026_07_20_14_32_11_442) is False
    # Zero means "never set", not "an exact second".
    assert is_whole_second(0) is False


def test_zero_filetime_is_reported_not_dropped():
    stamp = to_timestamp(0)
    assert stamp["filetime"] == "0"
    assert stamp["iso"] == "1601-01-01T00:00:00.000Z"


# ---------------------------------------------------------------------------
# Fixups
# ---------------------------------------------------------------------------


def _record_with_fixups(usn: bytes = b"\xaa\xbb") -> bytearray:
    record = bytearray(RECORD_SIZE)
    record[0:4] = b"FILE"
    struct.pack_into("<H", record, 0x04, 0x30)  # update sequence array offset
    struct.pack_into("<H", record, 0x06, 3)  # USN + one entry per 512-byte sector

    record[0x30:0x32] = usn
    record[0x32:0x34] = b"\x11\x22"  # real bytes for sector 0's tail
    record[0x34:0x36] = b"\x33\x44"  # real bytes for sector 1's tail

    record[SECTOR - 2 : SECTOR] = usn
    record[RECORD_SIZE - 2 : RECORD_SIZE] = usn
    return record


def test_apply_fixups_restores_sector_tails():
    record = _record_with_fixups()

    apply_fixups(record, SECTOR)

    assert bytes(record[SECTOR - 2 : SECTOR]) == b"\x11\x22"
    assert bytes(record[RECORD_SIZE - 2 : RECORD_SIZE]) == b"\x33\x44"


def test_apply_fixups_rejects_mismatched_usn():
    record = _record_with_fixups()
    # Corrupt one sector tail; NTFS's own integrity check should fail.
    record[SECTOR - 2 : SECTOR] = b"\x00\x00"

    with pytest.raises(FixupError, match="update sequence mismatch"):
        apply_fixups(record, SECTOR)


def test_apply_fixups_rejects_overrunning_array():
    record = bytearray(RECORD_SIZE)
    record[0:4] = b"FILE"
    struct.pack_into("<H", record, 0x04, RECORD_SIZE - 2)
    struct.pack_into("<H", record, 0x06, 64)

    with pytest.raises(FixupError, match="overruns"):
        apply_fixups(record, SECTOR)


# ---------------------------------------------------------------------------
# Data runs
# ---------------------------------------------------------------------------


def test_decode_single_run():
    # header 0x21: 1-byte length, 2-byte offset
    assert decode_data_runs(b"\x21\x18\x34\x56\x00") == [(0x5634, 0x18)]


def test_decode_run_offsets_are_signed_deltas():
    # Second run's offset is -16, so its LCN is 32 - 16 = 16. Getting the sign
    # wrong here is the classic run-list bug: it sends reads to the wrong place
    # on any fragmented file.
    data = b"\x11\x30\x20" b"\x11\x10\xf0" b"\x00"
    assert decode_data_runs(data) == [(32, 48), (16, 16)]


def test_decode_sparse_run_has_no_lcn():
    assert decode_data_runs(b"\x01\x08\x00") == [(None, 8)]


def test_decode_stops_at_terminator():
    assert decode_data_runs(b"\x00\x21\x18\x34\x56") == []


def test_decode_tolerates_truncated_run():
    # Header promises a 2-byte offset but only one byte remains.
    assert decode_data_runs(b"\x21\x18\x34") == []


# ---------------------------------------------------------------------------
# Boot sector
# ---------------------------------------------------------------------------


def _boot_sector() -> bytearray:
    data = bytearray(512)
    data[0x03:0x0B] = b"NTFS    "
    struct.pack_into("<H", data, 0x0B, 512)  # bytes per sector
    data[0x0D] = 8  # sectors per cluster
    struct.pack_into("<Q", data, 0x28, 4_194_304)  # total sectors -> 2 GiB
    struct.pack_into("<Q", data, 0x30, 65_536)  # $MFT start cluster
    struct.pack_into("<Q", data, 0x38, 2)  # $MFTMirr start cluster
    struct.pack_into("<b", data, 0x40, -10)  # 1 << 10 = 1024-byte records
    struct.pack_into("<b", data, 0x44, 1)  # 1 cluster per index record
    struct.pack_into("<Q", data, 0x48, 0x7A3C91E40B28F5D6)
    return data


def test_parse_boot_sector_geometry():
    parsed = boot.parse(bytes(_boot_sector()))

    assert parsed.bytes_per_sector == 512
    assert parsed.sectors_per_cluster == 8
    assert parsed.bytes_per_cluster == 4096
    assert parsed.total_clusters == 524_288
    assert parsed.total_bytes == 2_147_483_648
    assert parsed.mft_start_cluster == 65_536
    assert parsed.mft_offset == 65_536 * 4096
    assert parsed.volume_serial == "7a3c91e40b28f5d6"


def test_negative_record_size_encodes_bytes_directly():
    # -10 means 1 << 10 bytes, not 10 clusters. Reading it as clusters would
    # give a 40 KiB record size and desynchronise the whole table.
    assert boot.parse(bytes(_boot_sector())).mft_record_size == 1024


def test_positive_record_size_is_a_cluster_count():
    data = _boot_sector()
    struct.pack_into("<b", data, 0x40, 1)
    assert boot.parse(bytes(data)).mft_record_size == 4096


def test_rejects_non_ntfs():
    data = _boot_sector()
    data[0x03:0x0B] = b"FAT32   "

    with pytest.raises(boot.NotNtfsError, match="not an NTFS volume"):
        boot.parse(bytes(data))


# ---------------------------------------------------------------------------
# Attribute content
# ---------------------------------------------------------------------------


def test_parse_standard_information():
    content = bytearray(0x24)
    struct.pack_into(
        "<QQQQ",
        content,
        0x00,
        FT_2019_03_12_08_00_00,
        FT_2019_03_12_08_00_00,
        FT_2026_07_20_14_32_11_442,
        FT_2019_03_12_08_00_00,
    )
    struct.pack_into("<I", content, 0x20, 0x0026)  # HIDDEN | SYSTEM | ARCHIVE

    parsed = parse_standard_information(bytes(content))

    assert parsed is not None
    assert parsed.created == FT_2019_03_12_08_00_00
    assert parsed.mft_modified == FT_2026_07_20_14_32_11_442
    assert decode_attribute_flags(parsed.dos_flags) == ["HIDDEN", "SYSTEM", "ARCHIVE"]


def _file_name_content(name: str, namespace: int = NAMESPACE_WIN32, parent: int = 5) -> bytes:
    encoded = name.encode("utf-16-le")
    content = bytearray(0x42 + len(encoded))
    # Parent reference: low 48 bits record, high 16 bits sequence.
    struct.pack_into("<Q", content, 0x00, parent | (1 << 48))
    struct.pack_into(
        "<QQQQ",
        content,
        0x08,
        FT_2026_07_20_14_32_11_442,
        FT_2026_07_20_14_32_11_442,
        FT_2026_07_20_14_32_11_442,
        FT_2026_07_20_14_32_11_442,
    )
    content[0x40] = len(name)
    content[0x41] = namespace
    content[0x42 : 0x42 + len(encoded)] = encoded
    return bytes(content)


def test_parse_file_name_splits_parent_reference():
    parsed = parse_file_name(_file_name_content("report.docx", parent=38))

    assert parsed is not None
    assert parsed.name == "report.docx"
    assert parsed.parent_record == 38
    assert parsed.parent_sequence == 1
    assert parsed.created == FT_2026_07_20_14_32_11_442


def test_best_file_name_prefers_win32_over_dos_alias():
    long_name = FileNameAttribute(5, 1, "Program Files", NAMESPACE_WIN32, 0, 0, 0, 0)
    short_name = FileNameAttribute(5, 1, "PROGRA~1", NAMESPACE_DOS, 0, 0, 0, 0)

    assert best_file_name([short_name, long_name]) is long_name


# ---------------------------------------------------------------------------
# Whole-record parsing
# ---------------------------------------------------------------------------


def _resident_attribute(type_id: int, content: bytes, name: str = "") -> bytes:
    """Build a resident attribute, 8-byte aligned as NTFS requires."""
    encoded_name = name.encode("utf-16-le")
    name_offset = 0x18
    content_offset = name_offset + len(encoded_name)
    # Content must start 8-byte aligned relative to the attribute.
    content_offset += (-content_offset) % 8

    unpadded = content_offset + len(content)
    length = unpadded + ((-unpadded) % 8)

    attribute = bytearray(length)
    struct.pack_into("<I", attribute, 0x00, type_id)
    struct.pack_into("<I", attribute, 0x04, length)
    attribute[0x08] = 0  # resident
    attribute[0x09] = len(name)
    struct.pack_into("<H", attribute, 0x0A, name_offset)
    struct.pack_into("<I", attribute, 0x10, len(content))
    struct.pack_into("<H", attribute, 0x14, content_offset)

    if encoded_name:
        attribute[name_offset : name_offset + len(encoded_name)] = encoded_name
    attribute[content_offset : content_offset + len(content)] = content

    return bytes(attribute)


def _build_full_record() -> bytearray:
    si_content = bytearray(0x24)
    struct.pack_into(
        "<QQQQ",
        si_content,
        0x00,
        FT_2019_03_12_08_00_00,
        FT_2019_03_12_08_00_00,
        FT_2026_07_20_14_32_11_442,
        FT_2019_03_12_08_00_00,
    )
    struct.pack_into("<I", si_content, 0x20, 0x0020)  # ARCHIVE

    attributes = (
        _resident_attribute(ATTR_STANDARD_INFORMATION, bytes(si_content))
        + _resident_attribute(ATTR_FILE_NAME, _file_name_content("notes.txt", parent=38))
        + _resident_attribute(ATTR_DATA, b"hello")
        + _resident_attribute(ATTR_DATA, b"secret payload", name="payload")
        + struct.pack("<I", 0xFFFFFFFF)
    )

    first_attribute_offset = 0x38
    record = bytearray(RECORD_SIZE)
    record[0:4] = b"FILE"
    struct.pack_into("<H", record, 0x04, 0x30)
    struct.pack_into("<H", record, 0x06, 3)
    struct.pack_into("<H", record, 0x10, 7)  # sequence number
    struct.pack_into("<H", record, 0x12, 1)  # hard link count
    struct.pack_into("<H", record, 0x14, first_attribute_offset)
    struct.pack_into("<H", record, 0x16, 0x0001)  # in use, not a directory
    struct.pack_into("<I", record, 0x2C, 63)  # record number

    record[first_attribute_offset : first_attribute_offset + len(attributes)] = attributes

    # Fixup array, and the sector tails it protects.
    record[0x30:0x32] = b"\xaa\xbb"
    record[0x32:0x34] = b"\x00\x00"
    record[0x34:0x36] = b"\x00\x00"
    record[SECTOR - 2 : SECTOR] = b"\xaa\xbb"
    record[RECORD_SIZE - 2 : RECORD_SIZE] = b"\xaa\xbb"

    return record


def test_parse_record_walks_attribute_chain():
    parsed = parse_record(bytes(_build_full_record()), SECTOR, expected_number=63)

    assert parsed is not None
    assert parsed.record_number == 63
    assert parsed.sequence_number == 7
    assert parsed.in_use is True
    assert parsed.is_directory is False

    si = parsed.first(ATTR_STANDARD_INFORMATION)
    assert si is not None and si.content is not None

    names = parsed.all_of(ATTR_FILE_NAME)
    assert len(names) == 1

    streams = parsed.data_streams()
    assert len(streams) == 2

    default = parsed.default_stream()
    assert default is not None
    assert default.content == b"hello"

    ads = [stream for stream in streams if stream.is_ads]
    assert len(ads) == 1
    assert ads[0].name == "payload"
    assert ads[0].content == b"secret payload"


# ---------------------------------------------------------------------------
# Metadata suppression
#
# Found by scanning a real volume: NTFS's own metafiles under $Extend are
# HIDDEN+SYSTEM and several carry named streams, which produced twelve findings
# of pure noise.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, path",
    [
        ("$Quota", "E:\\$Extend\\$Quota"),
        ("$ObjId", "E:\\$Extend\\$ObjId"),
        ("$Repair", "E:\\$Extend\\$RmMetadata\\$Repair"),
        ("$Tops", "E:\\$Extend\\$RmMetadata\\$TxfLog\\$Tops"),
        ("$MFT", "E:\\$MFT"),
        # A normal file inside a metafile directory still counts as metadata.
        ("config", "E:\\$Extend\\config"),
    ],
)
def test_ntfs_metafiles_are_recognised(name, path):
    assert is_filesystem_metadata(name, path) is True


@pytest.mark.parametrize(
    "name, path",
    [
        ("svchost.exe", "E:\\Tools\\svchost.exe"),
        ("notes.txt", "E:\\Docs\\notes.txt"),
        # Unresolvable path must not be treated as metadata — orphaned user
        # files are exactly what we want to keep reporting.
        ("stage2.ps1", None),
        # A '$' mid-component is not a metafile marker.
        ("price$.xlsx", "E:\\Docs\\price$.xlsx"),
    ],
)
def test_user_files_are_not_treated_as_metadata(name, path):
    assert is_filesystem_metadata(name, path) is False


@pytest.mark.parametrize(
    "path",
    [
        # No trailing separator: the directory itself, which a prefix match on
        # "\system volume information\" used to miss.
        "E:\\System Volume Information",
        "E:\\System Volume Information\\tracking.log",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "C:\\Program Files (x86)\\App\\app.exe",
        "E:\\$RECYCLE.BIN\\S-1-5-21\\$RABCDEF.txt",
    ],
)
def test_system_directories_matched_as_components(path):
    assert _in_system_path(path) is True


def test_ordinary_user_path_is_not_a_system_path():
    assert _in_system_path("E:\\Docs\\notes.txt") is False
    assert _in_system_path(None) is False


def test_parse_record_ignores_non_file_signature():
    record = bytearray(RECORD_SIZE)
    record[0:4] = b"\x00\x00\x00\x00"

    assert parse_record(bytes(record), SECTOR) is None
