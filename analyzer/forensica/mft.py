"""
$MFT record and attribute parsing.

Every file on an NTFS volume is one or more 1024-byte records in the Master
File Table. A record is a header followed by a chain of variable-length
attributes; the ones that matter here are $STANDARD_INFORMATION (0x10),
$FILE_NAME (0x30) and $DATA (0x80).

The single most important detail is fixups. NTFS reserves the last two bytes of
every sector inside a record for an update sequence number, and stashes the real
values in an array in the record header. A parser that skips the fixup pass
reads two corrupted bytes per sector and silently produces wrong timestamps and
sizes. `apply_fixups` undoes this, and it must run before anything else.
"""

from __future__ import annotations

import struct
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .volume import RawVolume

RECORD_SIGNATURE = b"FILE"
BAAD_SIGNATURE = b"BAAD"

# Attribute type identifiers.
ATTR_STANDARD_INFORMATION = 0x10
ATTR_ATTRIBUTE_LIST = 0x20
ATTR_FILE_NAME = 0x30
ATTR_OBJECT_ID = 0x40
ATTR_VOLUME_NAME = 0x60
ATTR_VOLUME_INFORMATION = 0x70
ATTR_DATA = 0x80
ATTR_INDEX_ROOT = 0x90
ATTR_INDEX_ALLOCATION = 0xA0
ATTR_END = 0xFFFFFFFF

# Record header flags.
FLAG_IN_USE = 0x0001
FLAG_DIRECTORY = 0x0002

# $FILE_NAME namespaces. DOS is the 8.3 alias and is preferred last.
NAMESPACE_POSIX = 0
NAMESPACE_WIN32 = 1
NAMESPACE_DOS = 2
NAMESPACE_WIN32_DOS = 3

# Reserved MFT records. Record 5 is the volume root directory.
RECORD_MFT = 0
RECORD_VOLUME = 3
RECORD_ROOT = 5

_DOS_ATTRIBUTE_FLAGS: Tuple[Tuple[int, str], ...] = (
    (0x0001, "READONLY"),
    (0x0002, "HIDDEN"),
    (0x0004, "SYSTEM"),
    (0x0020, "ARCHIVE"),
    (0x0040, "DEVICE"),
    (0x0080, "NORMAL"),
    (0x0100, "TEMPORARY"),
    (0x0200, "SPARSE"),
    (0x0400, "REPARSE_POINT"),
    (0x0800, "COMPRESSED"),
    (0x1000, "OFFLINE"),
    (0x2000, "NOT_CONTENT_INDEXED"),
    (0x4000, "ENCRYPTED"),
)


class MftParseError(ValueError):
    """A record or attribute could not be parsed."""


class FixupError(MftParseError):
    """The update sequence number did not match at a sector tail."""


def decode_attribute_flags(raw: int) -> List[str]:
    """Expand the DOS attribute bitfield into readable names."""
    return [name for mask, name in _DOS_ATTRIBUTE_FLAGS if raw & mask]


def apply_fixups(record: bytearray, bytes_per_sector: int) -> None:
    """
    Undo the update sequence array in place.

    The array holds one USN followed by one replacement word per sector. For
    each sector, the last two bytes must currently equal the USN — that is the
    integrity check NTFS is making — and are then replaced with the stashed
    original.
    """
    if len(record) < 0x08:
        raise FixupError("record too short to contain an update sequence array")

    usa_offset = struct.unpack_from("<H", record, 0x04)[0]
    usa_count = struct.unpack_from("<H", record, 0x06)[0]

    if usa_count == 0:
        return

    if usa_offset + usa_count * 2 > len(record):
        raise FixupError(
            f"update sequence array at {usa_offset} length {usa_count * 2} "
            f"overruns the {len(record)}-byte record"
        )

    usn = bytes(record[usa_offset : usa_offset + 2])

    # Entry 0 is the USN itself; entries 1..count-1 are the replacements.
    for index in range(1, usa_count):
        tail = index * bytes_per_sector - 2
        if tail + 2 > len(record):
            break

        if bytes(record[tail : tail + 2]) != usn:
            raise FixupError(
                f"update sequence mismatch at sector {index} (offset {tail}): "
                f"expected {usn.hex()}, found {bytes(record[tail:tail + 2]).hex()}"
            )

        source = usa_offset + index * 2
        record[tail : tail + 2] = record[source : source + 2]


def decode_data_runs(data: bytes) -> List[Tuple[Optional[int], int]]:
    """
    Decode a run list into (lcn, cluster_count) pairs.

    Each run starts with a header byte whose low nibble is the width of the
    length field and whose high nibble is the width of the offset field. The
    offset is a *signed delta* from the previous run's LCN, which is what allows
    a fragmented multi-gigabyte file to be described in a handful of bytes. A
    zero-width offset means the run is sparse, reported here as lcn None.
    """
    runs: List[Tuple[Optional[int], int]] = []
    offset = 0
    lcn = 0

    while offset < len(data):
        header = data[offset]
        if header == 0:
            break

        length_size = header & 0x0F
        offset_size = (header >> 4) & 0x0F
        offset += 1

        if length_size == 0:
            break
        if offset + length_size + offset_size > len(data):
            break

        run_length = int.from_bytes(data[offset : offset + length_size], "little", signed=False)
        offset += length_size

        if offset_size == 0:
            runs.append((None, run_length))
            continue

        delta = int.from_bytes(data[offset : offset + offset_size], "little", signed=True)
        offset += offset_size
        lcn += delta
        runs.append((lcn, run_length))

    return runs


@dataclass
class Attribute:
    type_id: int
    name: str
    non_resident: bool
    content: Optional[bytes] = None
    runs: List[Tuple[Optional[int], int]] = field(default_factory=list)
    real_size: int = 0
    allocated_size: int = 0
    #: Unique within the record; what an $ATTRIBUTE_LIST entry refers to.
    attribute_id: int = 0
    #: First virtual cluster this segment covers. Non-zero only for the later
    #: segments of an attribute split across extension records.
    lowest_vcn: int = 0

    @property
    def is_ads(self) -> bool:
        """A named $DATA attribute is an Alternate Data Stream."""
        return self.type_id == ATTR_DATA and self.name != ""


@dataclass
class FileNameAttribute:
    parent_record: int
    parent_sequence: int
    name: str
    namespace: int
    created: int
    modified: int
    mft_modified: int
    accessed: int


@dataclass
class StandardInformation:
    created: int
    modified: int
    mft_modified: int
    accessed: int
    dos_flags: int


@dataclass
class MftRecord:
    record_number: int
    sequence_number: int
    in_use: bool
    is_directory: bool
    base_record: int
    hard_link_count: int
    attributes: List[Attribute]
    has_attribute_list: bool
    #: Extension records whose attributes were merged in via $ATTRIBUTE_LIST.
    extension_records: List[int] = field(default_factory=list)
    #: Non-fatal problems following $ATTRIBUTE_LIST, for the scan error log.
    attribute_list_problems: List[str] = field(default_factory=list)

    def first(self, type_id: int) -> Optional[Attribute]:
        for attribute in self.attributes:
            if attribute.type_id == type_id:
                return attribute
        return None

    def all_of(self, type_id: int) -> List[Attribute]:
        return [a for a in self.attributes if a.type_id == type_id]

    def data_streams(self) -> List[Attribute]:
        return self.all_of(ATTR_DATA)

    def default_stream(self) -> Optional[Attribute]:
        for attribute in self.data_streams():
            if attribute.name == "":
                return attribute
        return None


def parse_standard_information(content: bytes) -> Optional[StandardInformation]:
    if len(content) < 0x24:
        return None
    created, modified, mft_modified, accessed = struct.unpack_from("<QQQQ", content, 0x00)
    dos_flags = struct.unpack_from("<I", content, 0x20)[0]
    return StandardInformation(created, modified, mft_modified, accessed, dos_flags)


def parse_file_name(content: bytes) -> Optional[FileNameAttribute]:
    if len(content) < 0x42:
        return None

    parent_reference = struct.unpack_from("<Q", content, 0x00)[0]
    created, modified, mft_modified, accessed = struct.unpack_from("<QQQQ", content, 0x08)
    name_length = content[0x40]
    namespace = content[0x41]

    name_bytes = content[0x42 : 0x42 + name_length * 2]
    if len(name_bytes) < name_length * 2:
        return None

    return FileNameAttribute(
        # The low 48 bits are the record number, the high 16 the sequence.
        parent_record=parent_reference & 0x0000_FFFF_FFFF_FFFF,
        parent_sequence=(parent_reference >> 48) & 0xFFFF,
        name=name_bytes.decode("utf-16-le", errors="replace"),
        namespace=namespace,
        created=created,
        modified=modified,
        mft_modified=mft_modified,
        accessed=accessed,
    )


def _parse_attributes(record: bytes, first_offset: int) -> Tuple[List[Attribute], bool]:
    attributes: List[Attribute] = []
    has_attribute_list = False
    offset = first_offset

    while offset + 4 <= len(record):
        type_id = struct.unpack_from("<I", record, offset)[0]
        if type_id == ATTR_END:
            break

        if offset + 16 > len(record):
            break

        length = struct.unpack_from("<I", record, offset + 0x04)[0]
        if length < 16 or offset + length > len(record):
            # A zero or overrunning length would loop forever; stop cleanly and
            # let the caller record it as a partial parse.
            break

        non_resident = record[offset + 0x08] == 1
        name_length = record[offset + 0x09]
        name_offset = struct.unpack_from("<H", record, offset + 0x0A)[0]
        attribute_id = struct.unpack_from("<H", record, offset + 0x0E)[0]

        name = ""
        if name_length:
            raw_name = record[offset + name_offset : offset + name_offset + name_length * 2]
            name = raw_name.decode("utf-16-le", errors="replace")

        if type_id == ATTR_ATTRIBUTE_LIST:
            has_attribute_list = True

        attribute = Attribute(
            type_id=type_id, name=name, non_resident=non_resident, attribute_id=attribute_id
        )

        if non_resident:
            if offset + 0x38 <= len(record):
                attribute.lowest_vcn = struct.unpack_from("<Q", record, offset + 0x10)[0]
                runs_offset = struct.unpack_from("<H", record, offset + 0x20)[0]
                attribute.allocated_size = struct.unpack_from("<Q", record, offset + 0x28)[0]
                attribute.real_size = struct.unpack_from("<Q", record, offset + 0x30)[0]
                run_data = record[offset + runs_offset : offset + length]
                attribute.runs = decode_data_runs(run_data)
        else:
            content_length = struct.unpack_from("<I", record, offset + 0x10)[0]
            content_offset = struct.unpack_from("<H", record, offset + 0x14)[0]
            start = offset + content_offset
            attribute.content = bytes(record[start : start + content_length])
            attribute.real_size = content_length
            attribute.allocated_size = content_length

        attributes.append(attribute)
        offset += length

    return attributes, has_attribute_list


@dataclass
class AttributeListEntry:
    """One row of an $ATTRIBUTE_LIST: where a given attribute actually lives."""

    type_id: int
    name: str
    starting_vcn: int
    record_number: int
    record_sequence: int
    attribute_id: int


def parse_attribute_list(content: bytes) -> List[AttributeListEntry]:
    """
    Decode $ATTRIBUTE_LIST content.

    A file with more attributes than fit in one 1024-byte record — many hard
    links, a heavily fragmented stream, a large security descriptor — moves
    some of them into extension records. The list in the base record names
    each attribute and the record holding it. Without following it, a parser
    sees a base record missing its $FILE_NAME or holding only the first slice
    of a $DATA run list, and reports the wrong size or no file at all.
    """
    entries: List[AttributeListEntry] = []
    offset = 0

    while offset + 0x1A <= len(content):
        type_id, length, name_length, name_offset = struct.unpack_from("<IHBB", content, offset)
        if type_id == ATTR_END or length < 0x1A or offset + length > len(content):
            break

        starting_vcn, reference, attribute_id = struct.unpack_from("<QQH", content, offset + 0x08)
        name = ""
        if name_length:
            start = offset + name_offset
            name = content[start : start + name_length * 2].decode("utf-16-le", errors="replace")

        entries.append(
            AttributeListEntry(
                type_id=type_id,
                name=name,
                starting_vcn=starting_vcn,
                record_number=reference & 0x0000_FFFF_FFFF_FFFF,
                record_sequence=(reference >> 48) & 0xFFFF,
                attribute_id=attribute_id,
            )
        )
        offset += length

    return entries


def merge_attribute_segments(attributes: List[Attribute]) -> List[Attribute]:
    """
    Join non-resident attributes split across records into one.

    Each segment carries its own run list covering a VCN range; in order of
    lowest VCN they concatenate into the whole stream. Sizes are only valid in
    the segment starting at VCN 0, so they come from there. Each segment's run
    list starts its signed deltas from zero, which decode_data_runs already
    resolved to absolute LCNs, so concatenation needs no rebasing.
    """
    merged: List[Attribute] = []
    groups: Dict[Tuple[int, str], List[Attribute]] = {}

    for attribute in attributes:
        if not attribute.non_resident:
            merged.append(attribute)
            continue
        key = (attribute.type_id, attribute.name)
        if key not in groups:
            groups[key] = []
            merged.append(attribute)  # placeholder keeps first-seen order
        groups[key].append(attribute)

    for index, attribute in enumerate(merged):
        if not attribute.non_resident:
            continue
        segments = sorted(groups[(attribute.type_id, attribute.name)], key=lambda a: a.lowest_vcn)
        if len(segments) == 1:
            continue
        first = segments[0]
        merged[index] = Attribute(
            type_id=first.type_id,
            name=first.name,
            non_resident=True,
            runs=[run for segment in segments for run in segment.runs],
            real_size=first.real_size,
            allocated_size=first.allocated_size,
            attribute_id=first.attribute_id,
            lowest_vcn=0,
        )

    return merged


def parse_record(
    raw: bytes, bytes_per_sector: int, expected_number: Optional[int] = None
) -> Optional[MftRecord]:
    """
    Parse one MFT record. Returns None for empty or non-record slots.

    Raises MftParseError only for records that carry the FILE signature but are
    structurally broken — those are worth reporting; empty slots are not.
    """
    if len(raw) < 0x30:
        return None

    signature = bytes(raw[0:4])
    if signature == BAAD_SIGNATURE:
        raise MftParseError("record marked BAAD by NTFS")
    if signature != RECORD_SIGNATURE:
        return None

    buffer = bytearray(raw)
    apply_fixups(buffer, bytes_per_sector)

    sequence_number = struct.unpack_from("<H", buffer, 0x10)[0]
    hard_link_count = struct.unpack_from("<H", buffer, 0x12)[0]
    first_attribute_offset = struct.unpack_from("<H", buffer, 0x14)[0]
    flags = struct.unpack_from("<H", buffer, 0x16)[0]
    base_record = struct.unpack_from("<Q", buffer, 0x20)[0] & 0x0000_FFFF_FFFF_FFFF

    # Present since Windows XP. Fall back to the caller's index when absent.
    stored_number = struct.unpack_from("<I", buffer, 0x2C)[0]
    record_number = stored_number if stored_number else (expected_number or 0)
    if expected_number is not None and stored_number == 0:
        record_number = expected_number

    if first_attribute_offset < 0x30 or first_attribute_offset >= len(buffer):
        raise MftParseError(f"implausible first attribute offset {first_attribute_offset}")

    attributes, has_attribute_list = _parse_attributes(bytes(buffer), first_attribute_offset)

    return MftRecord(
        record_number=record_number,
        sequence_number=sequence_number,
        in_use=bool(flags & FLAG_IN_USE),
        is_directory=bool(flags & FLAG_DIRECTORY),
        base_record=base_record,
        hard_link_count=hard_link_count,
        attributes=attributes,
        has_attribute_list=has_attribute_list,
    )


def read_runs(
    volume: RawVolume,
    bytes_per_cluster: int,
    runs: List[Tuple[Optional[int], int]],
    offset: int,
    length: int,
) -> bytes:
    """
    Read `length` bytes starting `offset` bytes into a non-resident stream.

    Sparse runs contribute zeros without touching the disk, which is both
    correct and what keeps reading a sparse stream from being catastrophic.
    """
    out = bytearray()
    skip = offset
    remaining = length

    for lcn, count in runs:
        if remaining <= 0:
            break

        run_bytes = count * bytes_per_cluster
        if skip >= run_bytes:
            skip -= run_bytes
            continue

        take = min(run_bytes - skip, remaining)

        if lcn is None:
            out += b"\x00" * take
        else:
            out += volume.read(lcn * bytes_per_cluster + skip, take)

        remaining -= take
        skip = 0

    return bytes(out)


class MftReader:
    """
    Random access to MFT records.

    Bootstraps by reading record 0 ($MFT itself) from the cluster named in the
    boot sector, then uses that record's own $DATA run list as the extent map
    for every subsequent read. Going through the run list rather than assuming
    the table is contiguous is what makes this work on a fragmented volume.

    Reads are buffered: the $MFT stream is fetched in CHUNK_BYTES windows and a
    few recent windows are kept, so a sequential scan costs one disk read per
    thousand records rather than one per record. On a raw device every read is
    a syscall and a seek, and that — not parsing — is what dominates a full
    scan.
    """

    #: Bytes of $MFT fetched per physical read: 1024 records at 1 KiB each.
    CHUNK_BYTES = 1024 * 1024
    #: Chunks kept. More than one, so the random reads made while following
    #: $ATTRIBUTE_LIST or hashing a deleted record do not evict the window the
    #: sequential scan is working through.
    CACHE_CHUNKS = 4

    def __init__(self, volume: RawVolume, boot: "BootSectorLike") -> None:
        self.volume = volume
        self.boot = boot
        self._chunks: "OrderedDict[int, bytes]" = OrderedDict()
        #: Physical reads of the $MFT stream, for tests and throughput logging.
        self.physical_reads = 0

        bootstrap = volume.read(boot.mft_offset, boot.mft_record_size)
        record = parse_record(bootstrap, boot.bytes_per_sector, expected_number=RECORD_MFT)
        if record is None:
            raise MftParseError("could not parse $MFT record 0 at the offset given by $Boot")

        data = record.default_stream()
        if data is None or not data.runs:
            raise MftParseError("$MFT record 0 has no non-resident $DATA run list")

        self.extents = data.runs
        self.stream_size = data.real_size or data.allocated_size
        self.record_count = self.stream_size // boot.mft_record_size

        # A heavily fragmented $MFT keeps the rest of its own run list in an
        # extension record, which the bootstrap extents can normally reach.
        if record.has_attribute_list:
            full = self._follow_attribute_list(record).default_stream()
            if full is not None and full.runs:
                self.extents = full.runs
                self._chunks.clear()

    def _chunk(self, index: int) -> bytes:
        cached = self._chunks.get(index)
        if cached is not None:
            self._chunks.move_to_end(index)
            return cached

        start = index * self.CHUNK_BYTES
        length = min(self.CHUNK_BYTES, max(self.stream_size - start, 0))
        data = read_runs(self.volume, self.boot.bytes_per_cluster, self.extents, start, length)
        self.physical_reads += 1

        self._chunks[index] = data
        if len(self._chunks) > self.CACHE_CHUNKS:
            self._chunks.popitem(last=False)
        return data

    def read_record_bytes(self, number: int) -> bytes:
        size = self.boot.mft_record_size
        offset = number * size
        index, within = divmod(offset, self.CHUNK_BYTES)
        if within + size <= self.CHUNK_BYTES:
            return self._chunk(index)[within : within + size]
        # Only reachable with a record size that does not divide the chunk.
        return read_runs(self.volume, self.boot.bytes_per_cluster, self.extents, offset, size)

    def read(self, number: int, follow_attribute_list: bool = True) -> Optional[MftRecord]:
        raw = self.read_record_bytes(number)
        if not raw:
            return None
        record = parse_record(raw, self.boot.bytes_per_sector, expected_number=number)
        if (
            record is not None
            and follow_attribute_list
            and record.has_attribute_list
            and not record.base_record
        ):
            return self._follow_attribute_list(record)
        return record

    def _attribute_list_content(self, record: MftRecord) -> Optional[bytes]:
        attribute = record.first(ATTR_ATTRIBUTE_LIST)
        if attribute is None:
            return None
        if not attribute.non_resident:
            return attribute.content
        return read_runs(
            self.volume, self.boot.bytes_per_cluster, attribute.runs, 0, attribute.real_size
        )

    def _follow_attribute_list(self, record: MftRecord) -> MftRecord:
        """Pull the attributes the list places in extension records into `record`."""
        problems: List[str] = []
        try:
            content = self._attribute_list_content(record)
        except OSError as error:
            content = None
            problems.append(f"$ATTRIBUTE_LIST could not be read: {error}")

        if content is None:
            record.attribute_list_problems = problems or ["$ATTRIBUTE_LIST flagged but not present"]
            return record

        wanted: Dict[int, set] = {}
        for entry in parse_attribute_list(content):
            if entry.record_number != record.record_number:
                wanted.setdefault(entry.record_number, set()).add(
                    (entry.type_id, entry.attribute_id)
                )

        gathered = list(record.attributes)
        followed: List[int] = []

        for number in sorted(wanted):
            if number >= self.record_count:
                problems.append(f"extension record {number} is beyond the end of $MFT")
                continue
            try:
                extension = self.read(number, follow_attribute_list=False)
            except (MftParseError, OSError) as error:
                problems.append(f"extension record {number} unreadable: {error}")
                continue

            # The back-reference is the integrity check: a reused slot that now
            # belongs to another file must not have its attributes grafted on.
            if extension is None or extension.base_record != record.record_number:
                problems.append(
                    f"extension record {number} does not point back to base record "
                    f"{record.record_number}; its attributes were not merged"
                )
                continue

            keys = wanted[number]
            gathered.extend(
                a for a in extension.attributes if (a.type_id, a.attribute_id) in keys
            )
            followed.append(number)

        record.attributes = merge_attribute_segments(gathered)
        record.extension_records = followed
        record.attribute_list_problems = problems
        return record


class BootSectorLike:
    """Structural type documenting what MftReader needs from a boot sector."""

    bytes_per_sector: int
    bytes_per_cluster: int
    mft_record_size: int
    mft_offset: int


def best_file_name(names: List[FileNameAttribute]) -> Optional[FileNameAttribute]:
    """
    Pick the most informative $FILE_NAME.

    A file usually carries several: a Win32 long name and a DOS 8.3 alias.
    Reporting "PROGRA~1" instead of "Program Files" would be technically true
    and practically useless, so DOS-namespace names lose.
    """
    if not names:
        return None

    priority: Dict[int, int] = {
        NAMESPACE_WIN32: 0,
        NAMESPACE_WIN32_DOS: 1,
        NAMESPACE_POSIX: 2,
        NAMESPACE_DOS: 3,
    }
    return sorted(names, key=lambda n: priority.get(n.namespace, 4))[0]
