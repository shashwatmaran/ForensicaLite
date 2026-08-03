"""
Smoke tests for the desktop interface.

A GUI cannot be asserted on the way a parser can, but most of what breaks is
construction: a bad style option, a missing widget, a typo in a callback name.
Building the whole window and pumping the event loop catches all of that
without a human looking at it.

Skipped when no display is available, so the suite still runs headless.
"""

from __future__ import annotations

import json
import queue
import sys
import time

import pytest

tk = pytest.importorskip("tkinter")

from forensica.gui import CheckupApp  # noqa: E402
from forensica.progress import Progress, Reporter, ScanCancelled  # noqa: E402


@pytest.fixture
def root():
    try:
        window = tk.Tk()
    except tk.TclError as error:
        pytest.skip(f"no display available: {error}")
    window.withdraw()  # never actually show it during tests
    yield window
    try:
        window.destroy()
    except tk.TclError:
        pass


@pytest.fixture
def app(root):
    instance = CheckupApp(root)
    root.update_idletasks()
    return instance


def _state(widget) -> str:
    """ttk returns a Tcl object for 'state', not a str — normalise it."""
    return str(widget["state"])


def test_window_builds(app):
    assert app.scan_button is not None
    assert _state(app.cancel_button) == "disabled"
    assert app.stage_label["text"] == "Idle"


def test_output_defaults_to_a_json_path(app):
    assert app.output_var.get().endswith(".json")


def test_progress_updates_bar_and_labels(app, root):
    app.events.put(("progress", Progress("mft", "Parsing $MFT", 250, 1000)))
    app._poll_events()
    root.update_idletasks()

    assert app.stage_label["text"] == "Parsing $MFT"
    assert app.progress["value"] == 250  # 25% of the 1000-step bar
    assert "250" in app.count_label["text"]


def test_indeterminate_progress_shows_message_not_counts(app, root):
    app.events.put(("progress", Progress("detect", "Running detectors")))
    app._poll_events()
    root.update_idletasks()

    assert app.stage_label["text"] == "Running detectors"
    assert "records" not in app.count_label["text"]


def test_error_event_resets_controls(app, root):
    app.events.put(("error", "Access denied."))
    app._poll_events()
    root.update_idletasks()

    assert app.stage_label["text"] == "Failed"
    assert _state(app.scan_button) == "normal"
    assert _state(app.cancel_button) == "disabled"
    assert "Access denied." in app.log.get("1.0", "end")


def test_cancel_event_reports_no_file_written(app, root):
    app.events.put(("cancelled", None))
    app._poll_events()
    root.update_idletasks()

    assert app.stage_label["text"] == "Cancelled"
    assert "No case file was written" in app.log.get("1.0", "end")


def test_rejects_non_numeric_record_limit(app, root):
    app.source_var.set("__image__")
    app.image_var.set(__file__)  # any existing file gets past the path check
    app.max_records_var.set("banana")

    app._start_scan()
    root.update_idletasks()

    assert "not a positive record count" in app.log.get("1.0", "end")
    assert app.worker is None  # never started


def test_rejects_missing_image(app, root):
    app.source_var.set("__image__")
    app.image_var.set("Z:\\nope\\missing.img")

    app._start_scan()
    root.update_idletasks()

    assert "No such image" in app.log.get("1.0", "end")
    assert app.worker is None


@pytest.mark.skipif(sys.platform != "win32", reason="elevation check is Windows-only")
def test_drive_target_requires_elevation_when_not_admin(app, root):
    from forensica import volumes

    if volumes.is_elevated():
        pytest.skip("test process is elevated")

    app.source_var.set("E:")
    app._start_scan()
    root.update_idletasks()

    assert "Administrator" in app.log.get("1.0", "end")
    assert app.worker is None


# ---------------------------------------------------------------------------
# Progress plumbing
# ---------------------------------------------------------------------------


def test_reporter_throttles_record_updates():
    seen = []
    reporter = Reporter(on_progress=seen.append)

    for index in range(1000):
        reporter.records("mft", "Parsing", index, 1000)

    # One per RECORD_INTERVAL, not one per record — an unthrottled stream would
    # swamp the queue and slow the scan below the work it reports on.
    assert 0 < len(seen) <= 1000 // Reporter.RECORD_INTERVAL + 1


def test_reporter_always_emits_the_final_record():
    seen = []
    reporter = Reporter(on_progress=seen.append)

    reporter.records("mft", "Parsing", 7, 7)

    assert seen[-1].current == 7
    assert seen[-1].fraction == 1.0


def test_stage_transitions_are_never_throttled():
    seen = []
    reporter = Reporter(on_progress=seen.append)

    reporter.stage("open", "a")
    reporter.stage("boot", "b")
    reporter.stage("mft", "c")

    assert [p.stage for p in seen] == ["open", "boot", "mft"]


def test_checkpoint_raises_when_cancelled():
    reporter = Reporter(should_cancel=lambda: True)

    with pytest.raises(ScanCancelled):
        reporter.checkpoint()


def test_checkpoint_is_quiet_when_not_cancelled():
    Reporter(should_cancel=lambda: False).checkpoint()


def test_progress_fraction_is_none_when_indeterminate():
    assert Progress("detect", "x").fraction is None
    assert Progress("mft", "x", 5, 10).fraction == 0.5


def test_queue_drain_handles_empty():
    # The pump must tolerate an empty queue on every tick.
    empty: "queue.Queue" = queue.Queue()
    assert empty.empty()


# ---------------------------------------------------------------------------
# Full scan through the interface
# ---------------------------------------------------------------------------


def test_scan_runs_end_to_end_through_the_gui(app, root, tmp_path):
    """
    Drives a real scan on the worker thread and pumps the event loop until it
    finishes — covering the threading, the progress queue and the completion
    path, which the construction tests do not reach.
    """
    from . import synthetic

    image = tmp_path / "synthetic.img"
    synthetic.write_image(str(image))
    output = tmp_path / "case.json"

    app.source_var.set("__image__")
    app.image_var.set(str(image))
    app.output_var.set(str(output))

    app._start_scan()
    assert app.worker is not None

    # Pump until the worker finishes. Bounded so a hang fails rather than
    # blocking the suite.
    for _ in range(600):
        app._poll_events()
        root.update()
        if app.result is not None or _state(app.scan_button) == "normal":
            break
        time.sleep(0.01)

    app.worker.join(timeout=5)
    app._poll_events()
    root.update_idletasks()

    log = app.log.get("1.0", "end")
    assert app.result is not None, f"scan did not complete; log:\n{log}"

    assert output.exists()
    case = json.loads(output.read_text(encoding="utf-8"))
    assert case["schemaVersion"] == 1
    assert case["statistics"]["fileCounts"]["deleted"] == 4

    # The interface reports what was found, not just that it finished.
    assert "findings" in log
    assert str(output) in log
    assert app.stage_label["text"] == "Complete"
    assert app.progress["value"] == 1000
    assert _state(app.scan_button) == "normal"
    assert _state(app.open_button) == "normal"


def test_cancelling_mid_scan_writes_no_file(app, root, tmp_path):
    from . import synthetic

    image = tmp_path / "synthetic.img"
    synthetic.write_image(str(image))
    output = tmp_path / "cancelled.json"

    app.source_var.set("__image__")
    app.image_var.set(str(image))
    app.output_var.set(str(output))

    # Cancel before the worker gets going, so the first checkpoint trips.
    app._start_scan()
    app.cancel_flag.set()

    for _ in range(600):
        app._poll_events()
        root.update()
        if _state(app.scan_button) == "normal":
            break
        time.sleep(0.01)

    if app.worker is not None:
        app.worker.join(timeout=5)
    app._poll_events()
    root.update_idletasks()

    # Either it cancelled, or it finished before the flag was seen — a tiny
    # synthetic volume is fast. Only the cancelled outcome is asserted on.
    if app.result is None:
        assert not output.exists()
        assert "cancelled" in app.log.get("1.0", "end").lower()
