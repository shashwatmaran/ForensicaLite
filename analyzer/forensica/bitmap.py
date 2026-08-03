"""
$Bitmap — the volume cluster allocation map.

One bit per cluster: set means allocated. This is what makes the difference
between "this deleted file has data runs" and "this deleted file's data runs are
still free, so the content is probably intact". Without it, any claim about
recoverability of a non-resident file is guesswork.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from .mft import read_runs
from .volume import RawVolume

#: Refuse to load a bitmap larger than this. 64 MiB covers a ~2 TB volume at
#: 4 KiB clusters; beyond that the memory cost is not worth it for triage.
MAX_BITMAP_BYTES = 64 * 1024 * 1024


class ClusterBitmap:
    """Allocation state per cluster, or a null object when unavailable."""

    def __init__(self, data: Optional[bytes], total_clusters: int) -> None:
        self._data = data
        self._total_clusters = total_clusters

    @property
    def available(self) -> bool:
        return self._data is not None

    def is_allocated(self, lcn: int) -> Optional[bool]:
        """True/False when known, None when the bitmap could not be loaded."""
        if self._data is None:
            return None
        if lcn < 0 or lcn >= self._total_clusters:
            return None

        byte_index = lcn // 8
        if byte_index >= len(self._data):
            return None

        return bool(self._data[byte_index] & (1 << (lcn % 8)))

    def any_allocated(self, runs: List[Tuple[Optional[int], int]]) -> Optional[bool]:
        """True when any cluster in the run list is currently allocated."""
        if self._data is None:
            return None

        known_any = False
        for lcn, count in runs:
            if lcn is None:
                continue
            for offset in range(count):
                state = self.is_allocated(lcn + offset)
                if state is None:
                    continue
                known_any = True
                if state:
                    return True

        return False if known_any else None

    def all_allocated(self, runs: List[Tuple[Optional[int], int]]) -> Optional[bool]:
        """True when every readable cluster in the run list is allocated."""
        if self._data is None:
            return None

        saw_any = False
        for lcn, count in runs:
            if lcn is None:
                continue
            for offset in range(count):
                state = self.is_allocated(lcn + offset)
                if state is None:
                    continue
                saw_any = True
                if not state:
                    return False

        return True if saw_any else None


def load(
    volume: RawVolume,
    bytes_per_cluster: int,
    runs: List[Tuple[Optional[int], int]],
    real_size: int,
    total_clusters: int,
) -> ClusterBitmap:
    """Read $Bitmap's $DATA stream, or return an unavailable bitmap."""
    if not runs or real_size <= 0 or real_size > MAX_BITMAP_BYTES:
        return ClusterBitmap(None, total_clusters)

    data = read_runs(volume, bytes_per_cluster, runs, 0, real_size)
    if len(data) < real_size:
        return ClusterBitmap(None, total_clusters)

    return ClusterBitmap(data, total_clusters)
