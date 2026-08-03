"""
Scan progress reporting and cancellation.

The scan is a long single call. To drive a progress bar it has to say where it
is, and to stay responsive it has to be interruptible. Both are expressed as
plain callables so the core stays independent of any interface: the CLI passes
a printer, the GUI passes a queue writer, and the tests pass nothing at all.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

#: Ordered pipeline stages, used for the coarse phase indicator.
STAGES = (
    "open",
    "boot",
    "mft",
    "paths",
    "recovery",
    "detect",
    "report",
)

STAGE_LABELS = {
    "open": "Opening volume",
    "boot": "Reading $Boot",
    "mft": "Parsing $MFT",
    "paths": "Reconstructing paths",
    "recovery": "Assessing recovery",
    "detect": "Running detectors",
    "report": "Building report",
}


@dataclass(frozen=True)
class Progress:
    """One progress update."""

    stage: str
    message: str
    #: Work done within the stage. Zero when the stage is not countable.
    current: int = 0
    #: Total work for the stage. Zero means indeterminate.
    total: int = 0

    @property
    def fraction(self) -> Optional[float]:
        """Completion within this stage, or None when indeterminate."""
        if self.total <= 0:
            return None
        return min(max(self.current / self.total, 0.0), 1.0)

    @property
    def label(self) -> str:
        return STAGE_LABELS.get(self.stage, self.stage)


#: Called with each update. Must be cheap — it runs inside the scan loop.
ProgressCallback = Callable[[Progress], None]

#: Returns True when the caller wants the scan to stop.
CancelCheck = Callable[[], bool]


class ScanCancelled(RuntimeError):
    """Raised inside run_scan when the cancel check returns True."""


class Reporter:
    """
    Wraps the optional callbacks so the scan body stays uncluttered.

    Record-level updates are throttled: emitting one per MFT record would
    swamp a UI queue with hundreds of thousands of messages and make the scan
    slower than the work it is reporting on.
    """

    #: Emit at most one record-level update per this many records.
    RECORD_INTERVAL = 250

    def __init__(
        self,
        on_progress: Optional[ProgressCallback] = None,
        should_cancel: Optional[CancelCheck] = None,
    ) -> None:
        self._on_progress = on_progress
        self._should_cancel = should_cancel
        self._last_emitted = -1

    def stage(self, stage: str, message: str, current: int = 0, total: int = 0) -> None:
        """Emit an update unconditionally. For stage transitions."""
        self._last_emitted = -1
        if self._on_progress is not None:
            self._on_progress(Progress(stage, message, current, total))

    def records(self, stage: str, message: str, current: int, total: int) -> None:
        """Emit a throttled update. For per-record progress."""
        if self._on_progress is None:
            return
        if current - self._last_emitted < self.RECORD_INTERVAL and current != total:
            return
        self._last_emitted = current
        self._on_progress(Progress(stage, message, current, total))

    def checkpoint(self) -> None:
        """Raise if the caller has asked to stop."""
        if self._should_cancel is not None and self._should_cancel():
            raise ScanCancelled("scan cancelled")
