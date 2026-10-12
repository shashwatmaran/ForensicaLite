"""
Builds a synthetic NTFS volume image with planted artifacts.

This is not a real NTFS volume — no index allocation, no security descriptors,
no $LogFile. It is a faithful enough boot sector, $MFT, and $Bitmap that the
analyzer's whole pipeline runs against it: geometry from $Boot, the $MFT extent
map, fixups, attribute walking, path reconstruction, recovery assessment, and
every detector.

The point is that it needs no volume, no Administrator, and no Windows, so the
end-to-end behaviour is testable anywhere.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional, Sequence, Tuple

BYTES_PER_SECTOR = 512
SECTORS_PER_CLUSTER = 8
BYTES_PER_CLUSTER = BYTES_PER_SECTOR * SECTORS_PER_CLUSTER  # 4096
MFT_RECORD_SIZE = 1024

TOTAL_CLUSTERS = 64
TOTAL_SECTORS = TOTAL_CLUSTERS * SECTORS_PER_CLUSTER
IMAGE_SIZE = TOTAL_CLUSTERS * BYTES_PER_CLUSTER  # 256 KiB

MFT_START_CLUSTER = 4
MFT_CLUSTERS = 8
MFT_RECORD_SLOTS = MFT_CLUSTERS * BYTES_PER_CLUSTER // MFT_RECORD_SIZE  # 32

#: The $MFT is deliberately fragmented, as it is on any well-used volume: the
#: first half of its records sit at cluster 4, the second half at cluster 40,
#: reached only through record 0's run list. A parser that assumes the table is
#: contiguous reads records 16-31 from the wrong clusters.
MFT_EXTENTS: Tuple[Tuple[int, int], ...] = ((MFT_START_CLUSTER, 4), (40, 4))
RECORDS_PER_CLUSTER = BYTES_PER_CLUSTER // MFT_RECORD_SIZE

BITMAP_CLUSTER = 12
VOLUME_SERIAL = 0x7A3C91E40B28F5D6

USN = b"\xaa\xbb"

# Attribute type ids, repeated here so the builder does not depend on the code
# under test for the constants it encodes.
TYPE_STANDARD_INFORMATION = 0x10
TYPE_ATTRIBUTE_LIST = 0x20
TYPE_FILE_NAME = 0x30
TYPE_VOLUME_NAME = 0x60
TYPE_VOLUME_INFORMATION = 0x70
TYPE_DATA = 0x80

NAMESPACE_WIN32 = 1

# --- FILETIME constants used by the planted artifacts -----------------------

_FILETIME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)


def filetime_from_iso(iso: str) -> int:
    """
    ISO 8601 UTC -> raw FILETIME.

    Computed rather than hand-written: transcribing 18-digit FILETIME literals
    by hand is a reliable way to plant a wrong timestamp in a fixture and then
    "fix" the analyzer to match it.
    """
    moment = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    delta = moment - _FILETIME_EPOCH
    return (delta.days * 86_400 + delta.seconds) * 10_000_000 + delta.microseconds * 10


FT_VOLUME_CREATED = filetime_from_iso("2026-07-18T09:14:02.187Z")
FT_NORMAL_CREATED = filetime_from_iso("2026-07-19T11:02:44.318Z")
FT_NORMAL_MODIFIED = filetime_from_iso("2026-07-21T16:48:09.771Z")
FT_REAL_CREATION = filetime_from_iso("2026-07-20T14:32:11.442Z")
# Whole second, so it also trips the zeroed-sub-second detector.
FT_BACKDATED = filetime_from_iso("2019-03-12T08:00:00.000Z")
FT_ANCIENT = filetime_from_iso("1998-11-04T02:15:00.000Z")
FT_DELETED_AT = filetime_from_iso("2026-07-20T18:02:07.115Z")


def _align8(value: int) -> int:
    """NTFS requires attributes and their content to be 8-byte aligned."""
    return value + ((-value) % 8)


def encode_data_runs(runs: Sequence[Tuple[Optional[int], int]]) -> bytes:
    """
    Encode (lcn, cluster_count) pairs into an NTFS run list.

    Mirrors the decoder: the offset field holds a *signed delta* from the
    previous run's LCN, and both fields use the minimum number of bytes.
    """
    out = bytearray()
    previous_lcn = 0

    for lcn, count in runs:
        length_bytes = _minimal_int(count, signed=False)

        if lcn is None:
            out.append(len(length_bytes))
            out += length_bytes
            continue

        delta = lcn - previous_lcn
        offset_bytes = _minimal_int(delta, signed=True)
        previous_lcn = lcn

        out.append((len(offset_bytes) << 4) | len(length_bytes))
        out += length_bytes
        out += offset_bytes

    out.append(0)  # terminator
    return bytes(out)


def _minimal_int(value: int, signed: bool) -> bytes:
    width = 1
    while width <= 8:
        try:
            encoded = value.to_bytes(width, "little", signed=signed)
        except OverflowError:
            width += 1
            continue
        if int.from_bytes(encoded, "little", signed=signed) == value:
            return encoded
        width += 1
    raise ValueError(f"cannot encode {value} in 8 bytes (signed={signed})")


def resident_attribute(
    type_id: int, content: bytes, name: str = "", attribute_id: int = 0
) -> bytes:
    encoded_name = name.encode("utf-16-le")
    name_offset = 0x18
    content_offset = _align8(name_offset + len(encoded_name))
    length = _align8(content_offset + len(content))

    attribute = bytearray(length)
    struct.pack_into("<I", attribute, 0x00, type_id)
    struct.pack_into("<I", attribute, 0x04, length)
    attribute[0x08] = 0  # resident
    attribute[0x09] = len(name)
    struct.pack_into("<H", attribute, 0x0A, name_offset)
    struct.pack_into("<H", attribute, 0x0E, attribute_id)
    struct.pack_into("<I", attribute, 0x10, len(content))
    struct.pack_into("<H", attribute, 0x14, content_offset)

    attribute[name_offset : name_offset + len(encoded_name)] = encoded_name
    attribute[content_offset : content_offset + len(content)] = content
    return bytes(attribute)


def non_resident_attribute(
    type_id: int,
    runs: Sequence[Tuple[Optional[int], int]],
    real_size: int,
    name: str = "",
    attribute_id: int = 0,
    starting_vcn: int = 0,
) -> bytes:
    """
    A non-resident attribute, or one segment of it.

    A segment with a non-zero starting VCN is a continuation stored in an
    extension record; NTFS only keeps the sizes in the segment at VCN 0.
    """
    encoded_name = name.encode("utf-16-le")
    name_offset = 0x40
    runs_offset = _align8(name_offset + len(encoded_name))
    run_bytes = encode_data_runs(runs)
    length = _align8(runs_offset + len(run_bytes))

    cluster_total = sum(count for _, count in runs)
    allocated = cluster_total * BYTES_PER_CLUSTER if starting_vcn == 0 else 0
    last_vcn = starting_vcn + max(cluster_total - 1, 0)
    if starting_vcn:
        real_size = 0

    attribute = bytearray(length)
    struct.pack_into("<I", attribute, 0x00, type_id)
    struct.pack_into("<I", attribute, 0x04, length)
    attribute[0x08] = 1  # non-resident
    attribute[0x09] = len(name)
    struct.pack_into("<H", attribute, 0x0A, name_offset)
    struct.pack_into("<H", attribute, 0x0E, attribute_id)
    struct.pack_into("<Q", attribute, 0x10, starting_vcn)
    struct.pack_into("<Q", attribute, 0x18, last_vcn)
    struct.pack_into("<H", attribute, 0x20, runs_offset)
    struct.pack_into("<Q", attribute, 0x28, allocated)
    struct.pack_into("<Q", attribute, 0x30, real_size)
    struct.pack_into("<Q", attribute, 0x38, real_size)

    attribute[name_offset : name_offset + len(encoded_name)] = encoded_name
    attribute[runs_offset : runs_offset + len(run_bytes)] = run_bytes
    return bytes(attribute)


def standard_information(
    created: int,
    modified: int,
    mft_modified: int,
    accessed: int,
    dos_flags: int = 0x20,
) -> bytes:
    content = bytearray(0x24)
    struct.pack_into("<QQQQ", content, 0x00, created, modified, mft_modified, accessed)
    struct.pack_into("<I", content, 0x20, dos_flags)
    return bytes(content)


def file_name(
    name: str,
    parent_record: int,
    parent_sequence: int = 1,
    created: int = FT_NORMAL_CREATED,
    modified: int = FT_NORMAL_CREATED,
    mft_modified: int = FT_NORMAL_CREATED,
    accessed: int = FT_NORMAL_CREATED,
) -> bytes:
    encoded = name.encode("utf-16-le")
    content = bytearray(0x42 + len(encoded))
    struct.pack_into("<Q", content, 0x00, parent_record | (parent_sequence << 48))
    struct.pack_into("<QQQQ", content, 0x08, created, modified, mft_modified, accessed)
    content[0x40] = len(name)
    content[0x41] = NAMESPACE_WIN32
    content[0x42 : 0x42 + len(encoded)] = encoded
    return bytes(content)


def attribute_list_entry(
    type_id: int,
    record_number: int,
    attribute_id: int,
    starting_vcn: int = 0,
    record_sequence: int = 1,
    name: str = "",
) -> bytes:
    """One $ATTRIBUTE_LIST row: this attribute, this segment, lives in that record."""
    encoded = name.encode("utf-16-le")
    length = _align8(0x1A + len(encoded))
    entry = bytearray(length)
    struct.pack_into("<IHBB", entry, 0x00, type_id, length, len(name), 0x1A)
    struct.pack_into(
        "<QQH", entry, 0x08, starting_vcn, record_number | (record_sequence << 48), attribute_id
    )
    entry[0x1A : 0x1A + len(encoded)] = encoded
    return bytes(entry)


def build_record(
    record_number: int,
    attributes: Sequence[bytes],
    *,
    in_use: bool = True,
    is_directory: bool = False,
    sequence_number: int = 1,
    base_record: int = 0,
) -> bytes:
    """
    Assemble one MFT record, including a correct update sequence array.

    The fixup simulation matters: the originals at each sector tail are moved
    into the USA and replaced with the USN, exactly as NTFS does on write. A
    record built without this would let a parser that ignores fixups pass.
    """
    first_attribute_offset = 0x38
    record = bytearray(MFT_RECORD_SIZE)

    record[0:4] = b"FILE"
    struct.pack_into("<H", record, 0x04, 0x30)  # USA offset
    usa_count = MFT_RECORD_SIZE // BYTES_PER_SECTOR + 1  # USN + one per sector
    struct.pack_into("<H", record, 0x06, usa_count)
    struct.pack_into("<H", record, 0x10, sequence_number)
    struct.pack_into("<H", record, 0x12, 1)  # hard link count
    struct.pack_into("<H", record, 0x14, first_attribute_offset)

    flags = (0x0001 if in_use else 0x0000) | (0x0002 if is_directory else 0x0000)
    struct.pack_into("<H", record, 0x16, flags)
    struct.pack_into("<Q", record, 0x20, base_record | (1 << 48) if base_record else 0)
    struct.pack_into("<I", record, 0x2C, record_number)

    body = b"".join(attributes) + struct.pack("<I", 0xFFFFFFFF)
    end = first_attribute_offset + len(body)
    if end > MFT_RECORD_SIZE - 2:
        raise ValueError(f"record {record_number} attributes overflow: {end} bytes")

    struct.pack_into("<I", record, 0x18, end)  # real size used
    struct.pack_into("<I", record, 0x1C, MFT_RECORD_SIZE)
    record[first_attribute_offset:end] = body

    # Move each sector tail into the USA and stamp the USN in its place.
    record[0x30:0x32] = USN
    for index in range(1, usa_count):
        tail = index * BYTES_PER_SECTOR - 2
        if tail + 2 > MFT_RECORD_SIZE:
            break
        original = bytes(record[tail : tail + 2])
        slot = 0x30 + index * 2
        record[slot : slot + 2] = original
        record[tail : tail + 2] = USN

    return bytes(record)


def build_boot_sector() -> bytes:
    data = bytearray(BYTES_PER_SECTOR)
    data[0x00:0x03] = b"\xeb\x52\x90"
    data[0x03:0x0B] = b"NTFS    "
    struct.pack_into("<H", data, 0x0B, BYTES_PER_SECTOR)
    data[0x0D] = SECTORS_PER_CLUSTER
    struct.pack_into("<Q", data, 0x28, TOTAL_SECTORS)
    struct.pack_into("<Q", data, 0x30, MFT_START_CLUSTER)
    struct.pack_into("<Q", data, 0x38, 2)
    struct.pack_into("<b", data, 0x40, -10)  # 1 << 10 == 1024
    struct.pack_into("<b", data, 0x44, 1)
    struct.pack_into("<Q", data, 0x48, VOLUME_SERIAL)
    data[0x1FE:0x200] = b"\x55\xaa"
    return bytes(data)


#: Content of the deleted resident file, recovered byte-for-byte by the analyzer.
RESIDENT_SECRET = (
    b"# Handover notes - delete before leaving\n"
    b"jump host: 10.14.22.8\n"
    b"service account: svc_backup\n"
)

#: Clusters holding live data, plus cluster 20 which is reused after a delete.
#: 40-43 are the second $MFT extent; 45 and 47 the two halves of the
#: fragmented file described through $ATTRIBUTE_LIST.
ALLOCATED_CLUSTERS = (
    set(range(0, BITMAP_CLUSTER + 1)) | {13, 14, 20} | set(range(40, 44)) | {45, 47}
)

#: Content of the $ATTRIBUTE_LIST file: one cluster at 45, then 100 bytes at
#: 47. Distinct bytes per half, so a hash over the merged stream proves the
#: segments were joined in VCN order.
SPLIT_FIRST = bytes(range(256)) * (BYTES_PER_CLUSTER // 256)
SPLIT_SECOND = b"second segment, from the extension record ".ljust(100, b".")
SPLIT_CONTENT = SPLIT_FIRST + SPLIT_SECOND


@dataclass
class SyntheticVolume:
    image: bytearray = field(default_factory=lambda: bytearray(IMAGE_SIZE))

    def write_at(self, offset: int, data: bytes) -> None:
        self.image[offset : offset + len(data)] = data

    def write_cluster(self, cluster: int, data: bytes) -> None:
        self.write_at(cluster * BYTES_PER_CLUSTER, data)


def build_image() -> bytes:
    """Assemble the whole volume: boot sector, $MFT, $Bitmap and file data."""
    volume = SyntheticVolume()
    volume.write_at(0, build_boot_sector())

    records: List[bytes] = [b"\x00" * MFT_RECORD_SIZE] * MFT_RECORD_SLOTS

    def place(number: int, record: bytes) -> None:
        records[number] = record

    # --- 0: $MFT itself. Its $DATA run list is the extent map. --------------
    place(
        0,
        build_record(
            0,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("$MFT", parent_record=5)),
                non_resident_attribute(
                    TYPE_DATA,
                    list(MFT_EXTENTS),
                    MFT_CLUSTERS * BYTES_PER_CLUSTER,
                ),
            ],
        ),
    )

    # --- 3: $Volume. Carries the volume label and creation time. ------------
    place(
        3,
        build_record(
            3,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("$Volume", parent_record=5)),
                resident_attribute(TYPE_VOLUME_NAME, "CASE-TEST".encode("utf-16-le")),
                resident_attribute(TYPE_VOLUME_INFORMATION, b"\x00" * 12),
            ],
        ),
    )

    # --- 5: root directory --------------------------------------------------
    place(
        5,
        build_record(
            5,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name(".", parent_record=5)),
            ],
            is_directory=True,
        ),
    )

    # --- 6: $Bitmap ---------------------------------------------------------
    bitmap_bytes = bytearray(TOTAL_CLUSTERS // 8)
    for cluster in ALLOCATED_CLUSTERS:
        if cluster < TOTAL_CLUSTERS:
            bitmap_bytes[cluster // 8] |= 1 << (cluster % 8)
    volume.write_cluster(BITMAP_CLUSTER, bytes(bitmap_bytes))

    place(
        6,
        build_record(
            6,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED, FT_VOLUME_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("$Bitmap", parent_record=5)),
                non_resident_attribute(
                    TYPE_DATA, [(BITMAP_CLUSTER, 1)], len(bitmap_bytes)
                ),
            ],
        ),
    )

    # --- 12: Docs directory -------------------------------------------------
    place(
        12,
        build_record(
            12,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("Docs", parent_record=5)),
            ],
            is_directory=True,
        ),
    )

    # --- 13: control file, should raise nothing -----------------------------
    volume.write_cluster(13, b"docx payload")
    place(
        13,
        build_record(
            13,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED,
                        FT_NORMAL_MODIFIED,
                        FT_NORMAL_MODIFIED,
                        FT_NORMAL_MODIFIED,
                    ),
                ),
                resident_attribute(
                    TYPE_FILE_NAME, file_name("report.docx", parent_record=12)
                ),
                non_resident_attribute(TYPE_DATA, [(13, 1)], 12),
            ],
        ),
    )

    # --- 14: timestomped, hidden+system executable --------------------------
    # $SI fully backdated to a whole second; $FN keeps the real creation time.
    volume.write_cluster(14, b"MZ fake executable")
    place(
        14,
        build_record(
            14,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_BACKDATED,
                        FT_BACKDATED,
                        FT_REAL_CREATION,
                        FT_BACKDATED,
                        dos_flags=0x26,  # HIDDEN | SYSTEM | ARCHIVE
                    ),
                ),
                resident_attribute(
                    TYPE_FILE_NAME,
                    file_name(
                        "svchost.exe",
                        parent_record=12,
                        created=FT_REAL_CREATION,
                        modified=FT_REAL_CREATION,
                        mft_modified=FT_REAL_CREATION,
                        accessed=FT_REAL_CREATION,
                    ),
                ),
                non_resident_attribute(TYPE_DATA, [(14, 1)], 18),
            ],
        ),
    )

    # --- 15: carrier file with an alternate data stream ---------------------
    place(
        15,
        build_record(
            15,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("notes.txt", parent_record=12)),
                resident_attribute(TYPE_DATA, b"Meeting notes."),
                resident_attribute(TYPE_DATA, b"A" * 64, name="payload"),
            ],
        ),
    )

    # --- 16: deleted resident file — recovers byte-for-byte ----------------
    place(
        16,
        build_record(
            16,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_DELETED_AT, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(
                    TYPE_FILE_NAME, file_name("handover-credentials.txt", parent_record=12)
                ),
                resident_attribute(TYPE_DATA, RESIDENT_SECRET),
            ],
            in_use=False,
        ),
    )

    # --- 17: deleted non-resident, clusters since reallocated --------------
    place(
        17,
        build_record(
            17,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_DELETED_AT, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(
                    TYPE_FILE_NAME, file_name("screen-capture.mp4", parent_record=12)
                ),
                non_resident_attribute(TYPE_DATA, [(20, 1)], 4096),
            ],
            in_use=False,
        ),
    )

    # --- 18: orphaned — parent record does not exist -----------------------
    place(
        18,
        build_record(
            18,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_DELETED_AT, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("stage2.ps1", parent_record=99)),
                non_resident_attribute(TYPE_DATA, [(31, 1)], 3902),
            ],
            in_use=False,
        ),
    )

    # --- 19: timestamp predating the volume --------------------------------
    place(
        19,
        build_record(
            19,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_ANCIENT, FT_ANCIENT, FT_REAL_CREATION, FT_ANCIENT
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("install.log", parent_record=12)),
                resident_attribute(TYPE_DATA, b"Setup completed."),
            ],
        ),
    )

    # --- 20: deleted non-resident whose clusters are still free ------------
    place(
        20,
        build_record(
            20,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_DELETED_AT, FT_NORMAL_CREATED
                    ),
                ),
                resident_attribute(TYPE_FILE_NAME, file_name("draft.docx", parent_record=12)),
                non_resident_attribute(TYPE_DATA, [(30, 1)], 2048),
            ],
            in_use=False,
        ),
    )

    # --- 21-23: a file described through $ATTRIBUTE_LIST --------------------
    # The base record holds only $SI and the list. Its $FILE_NAME and the first
    # segment of $DATA are in extension record 22; the second $DATA segment is
    # in 23. Followed correctly this is an ordinary 4196-byte file; read from
    # the base record alone it has no name and is silently dropped.
    volume.write_cluster(45, SPLIT_FIRST)
    volume.write_cluster(47, SPLIT_SECOND)
    place(
        21,
        build_record(
            21,
            [
                resident_attribute(
                    TYPE_STANDARD_INFORMATION,
                    standard_information(
                        FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED, FT_NORMAL_CREATED
                    ),
                    attribute_id=0,
                ),
                resident_attribute(
                    TYPE_ATTRIBUTE_LIST,
                    attribute_list_entry(TYPE_STANDARD_INFORMATION, 21, attribute_id=0)
                    + attribute_list_entry(TYPE_FILE_NAME, 22, attribute_id=2)
                    + attribute_list_entry(TYPE_DATA, 22, attribute_id=3)
                    + attribute_list_entry(TYPE_DATA, 23, attribute_id=1, starting_vcn=1),
                    attribute_id=1,
                ),
            ],
        ),
    )
    place(
        22,
        build_record(
            22,
            [
                resident_attribute(
                    TYPE_FILE_NAME, file_name("evidence.bin", parent_record=12), attribute_id=2
                ),
                non_resident_attribute(
                    TYPE_DATA, [(45, 1)], len(SPLIT_CONTENT), attribute_id=3
                ),
            ],
            base_record=21,
        ),
    )
    place(
        23,
        build_record(
            23,
            [
                non_resident_attribute(
                    TYPE_DATA, [(47, 1)], 0, attribute_id=1, starting_vcn=1
                ),
            ],
            base_record=21,
        ),
    )

    # Lay records out across the $MFT's extents, in record order.
    slot_offsets: List[int] = []
    for start_cluster, cluster_count in MFT_EXTENTS:
        for index in range(cluster_count * RECORDS_PER_CLUSTER):
            slot_offsets.append(start_cluster * BYTES_PER_CLUSTER + index * MFT_RECORD_SIZE)

    for index, record in enumerate(records):
        volume.write_at(slot_offsets[index], record)

    return bytes(volume.image)


def write_image(path: str) -> str:
    with open(path, "wb") as handle:
        handle.write(build_image())
    return path
