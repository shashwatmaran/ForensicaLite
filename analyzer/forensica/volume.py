"""
Raw volume access.

Opening ``\\\\.\\E:`` yields a handle to the volume itself rather than to the
filesystem mounted on it. Reads go straight to sectors, which is what makes it
possible to read ``$MFT``, registry hives and event logs on a live system: the
OS file APIs hold locks on those, the raw device does not.

Windows requires reads through such a handle to be sector-aligned and a whole
multiple of the sector size. Callers here do not have to care — `RawVolume.read`
widens every request to an aligned window and slices the result. Alignment is
fixed at 4096, which satisfies both 512-byte and 4Kn drives.
"""

from __future__ import annotations

import os
from types import TracebackType
from typing import Type

#: Every physical read is aligned and sized to this. A multiple of 512, so it
#: is valid for 512e drives too.
ALIGNMENT = 4096

#: Cap on a single os.read call, to avoid asking for enormous buffers.
_MAX_CHUNK = 8 * 1024 * 1024


class VolumeReadError(OSError):
    """A physical read failed or returned short of a whole sector."""


class RawVolume:
    """
    Sector-aligned reader over a raw volume handle or a disk image file.

    Accepting a plain file path as well as a device path means the analyzer can
    be pointed at a dd image for testing without a privileged handle.
    """

    def __init__(self, path: str) -> None:
        self.path = path
        flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
        self._fd = os.open(path, flags)

    def read(self, offset: int, length: int) -> bytes:
        """Read `length` bytes from absolute byte `offset` within the volume."""
        if length <= 0:
            return b""
        if offset < 0:
            raise ValueError(f"negative offset: {offset}")

        start = (offset // ALIGNMENT) * ALIGNMENT
        end = ((offset + length + ALIGNMENT - 1) // ALIGNMENT) * ALIGNMENT

        os.lseek(self._fd, start, os.SEEK_SET)

        buffer = bytearray()
        remaining = end - start

        while remaining > 0:
            want = min(remaining, _MAX_CHUNK)
            try:
                chunk = os.read(self._fd, want)
            except OSError as error:
                raise VolumeReadError(
                    f"read of {want} bytes at offset {start + len(buffer)} failed: {error}"
                ) from error

            if not chunk:
                # End of volume. Short reads are legitimate at the tail; the
                # slice below simply returns less than asked for.
                break

            buffer += chunk
            remaining -= len(chunk)

        relative = offset - start
        return bytes(buffer[relative : relative + length])

    def close(self) -> None:
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None  # type: ignore[assignment]

    def __enter__(self) -> "RawVolume":
        return self

    def __exit__(
        self,
        exc_type: Type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.close()


def device_path(target: str) -> str:
    """
    Normalise a user-supplied target into something openable.

    ``E`` and ``E:`` become ``\\\\.\\E:``; anything else (an image file path) is
    passed through untouched.
    """
    stripped = target.strip()

    if len(stripped) == 1 and stripped.isalpha():
        return f"\\\\.\\{stripped.upper()}:"

    if len(stripped) == 2 and stripped[0].isalpha() and stripped[1] == ":":
        return f"\\\\.\\{stripped.upper()}"

    return stripped
