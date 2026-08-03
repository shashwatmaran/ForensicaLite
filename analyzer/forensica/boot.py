"""
NTFS boot sector ($Boot) parsing.

The first sector of an NTFS volume carries the BIOS Parameter Block, which is
where every subsequent offset calculation comes from: cluster geometry, the
location of $MFT, and the MFT record size. Nothing else can be parsed until
this is right.

Field offsets follow the documented NTFS BPB layout:

    0x03  8   OEM identifier, always b"NTFS    "
    0x0B  2   bytes per sector
    0x0D  1   sectors per cluster
    0x28  8   total sectors
    0x30  8   $MFT start, in clusters
    0x38  8   $MFTMirr start, in clusters
    0x40  1   clusters per MFT record  (signed; see _sized_field)
    0x44  1   clusters per index record (signed; same encoding)
    0x48  8   volume serial number
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

NTFS_OEM_ID = b"NTFS    "


class NotNtfsError(ValueError):
    """The target does not carry an NTFS boot sector."""


@dataclass(frozen=True)
class BootSector:
    bytes_per_sector: int
    sectors_per_cluster: int
    bytes_per_cluster: int
    total_sectors: int
    total_clusters: int
    total_bytes: int
    mft_start_cluster: int
    mft_mirror_cluster: int
    mft_record_size: int
    index_record_size: int
    volume_serial: str

    @property
    def mft_offset(self) -> int:
        """Byte offset of $MFT record 0 within the volume."""
        return self.mft_start_cluster * self.bytes_per_cluster


def _sized_field(raw: int, bytes_per_cluster: int) -> int:
    """
    Decode the "clusters per record" encoding used at 0x40 and 0x44.

    Positive values are a cluster count. Negative values encode a byte size
    directly as ``1 << -raw``, which is how a 1024-byte MFT record is expressed
    on a volume with 4096-byte clusters.
    """
    if raw < 0:
        return 1 << (-raw)
    return raw * bytes_per_cluster


def parse(data: bytes) -> BootSector:
    """Parse a boot sector from at least the first 512 bytes of a volume."""
    if len(data) < 0x50:
        raise NotNtfsError(f"boot sector too short: {len(data)} bytes")

    oem = data[0x03:0x0B]
    if oem != NTFS_OEM_ID:
        raise NotNtfsError(
            f"OEM identifier is {oem!r}, expected {NTFS_OEM_ID!r} — not an NTFS volume"
        )

    bytes_per_sector = struct.unpack_from("<H", data, 0x0B)[0]
    if bytes_per_sector == 0 or bytes_per_sector % 512 != 0:
        raise NotNtfsError(f"implausible bytes per sector: {bytes_per_sector}")

    # Values above 0x80 encode a power of two rather than a literal count.
    # Only appears on volumes with very large clusters.
    raw_spc = data[0x0D]
    sectors_per_cluster = (1 << (0x100 - raw_spc)) if raw_spc > 0x80 else raw_spc
    if sectors_per_cluster == 0:
        raise NotNtfsError("sectors per cluster is zero")

    bytes_per_cluster = bytes_per_sector * sectors_per_cluster

    total_sectors = struct.unpack_from("<Q", data, 0x28)[0]
    mft_start_cluster = struct.unpack_from("<Q", data, 0x30)[0]
    mft_mirror_cluster = struct.unpack_from("<Q", data, 0x38)[0]

    raw_mft_record = struct.unpack_from("<b", data, 0x40)[0]
    raw_index_record = struct.unpack_from("<b", data, 0x44)[0]

    mft_record_size = _sized_field(raw_mft_record, bytes_per_cluster)
    index_record_size = _sized_field(raw_index_record, bytes_per_cluster)

    if mft_record_size <= 0 or mft_record_size % 512 != 0:
        raise NotNtfsError(f"implausible MFT record size: {mft_record_size}")

    serial = struct.unpack_from("<Q", data, 0x48)[0]

    return BootSector(
        bytes_per_sector=bytes_per_sector,
        sectors_per_cluster=sectors_per_cluster,
        bytes_per_cluster=bytes_per_cluster,
        total_sectors=total_sectors,
        total_clusters=total_sectors // sectors_per_cluster,
        total_bytes=total_sectors * bytes_per_sector,
        mft_start_cluster=mft_start_cluster,
        mft_mirror_cluster=mft_mirror_cluster,
        mft_record_size=mft_record_size,
        index_record_size=index_record_size,
        volume_serial=f"{serial:016x}",
    )
