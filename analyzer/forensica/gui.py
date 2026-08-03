"""
The checkup desktop interface.

Built on tkinter, which is in the standard library — so the packaged exe stays
around 7 MB and the analyzer keeps its property of having no third-party
runtime dependencies. Qt would look better out of the box and cost forty times
the bundle size.

Threading model: the scan runs on a worker thread and posts messages to a
queue; the UI thread drains that queue on a timer. tkinter is not thread-safe,
so no widget is ever touched from the worker.
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import threading
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import tkinter as tk
from tkinter import filedialog, ttk

from . import __version__
from .analyze import ScanOptions, run_scan
from .boot import NotNtfsError
from .mft import MftParseError
from .progress import Progress, ScanCancelled
from .volumes import VolumeEntry, is_elevated, relaunch_elevated, scannable_volumes
from .volumes import _format_size as format_size

# --- Palette ---------------------------------------------------------------
# Mirrors the web report: neutral ink surfaces, one accent, colour reserved for
# severity. ttk's native Windows themes ignore most colour options, so the
# 'clam' theme is used as the base because it honours them.

BG = "#0a0b0d"
SURFACE = "#101216"
SURFACE_ALT = "#15181d"
BORDER = "#262b33"
TEXT = "#dde1e7"
TEXT_DIM = "#8f97a3"
TEXT_FAINT = "#6b737f"
ACCENT = "#1faa6d"
ACCENT_BRIGHT = "#35c08a"
SEV_CRITICAL = "#f2555a"
SEV_HIGH = "#f0913f"
SEV_MEDIUM = "#dcbb45"

MONO = ("Consolas", 9)
MONO_SMALL = ("Consolas", 8)
UI = ("Segoe UI", 9)
UI_BOLD = ("Segoe UI", 9, "bold")
UI_SMALL = ("Segoe UI", 8)
TITLE = ("Segoe UI", 13, "bold")


@dataclass
class ScanResult:
    case: Dict[str, Any]
    output_path: Path


class CheckupApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.events: "queue.Queue[tuple]" = queue.Queue()
        self.cancel_flag = threading.Event()
        self.worker: Optional[threading.Thread] = None
        self.result: Optional[ScanResult] = None
        self.volumes: List[VolumeEntry] = []

        self.source_var = tk.StringVar(value="")
        self.image_var = tk.StringVar(value="")
        self.output_var = tk.StringVar(value=str(Path.cwd() / "case.json"))
        self.full_var = tk.BooleanVar(value=False)
        self.hash_var = tk.BooleanVar(value=True)
        self.max_records_var = tk.StringVar(value="")

        self._build_style()
        self._build_layout()
        self._refresh_volumes()
        self._poll_events()

    # -- Styling ------------------------------------------------------------

    def _build_style(self) -> None:
        self.root.title(f"checkup — NTFS forensic analyzer {__version__}")
        self.root.configure(bg=BG)
        self.root.geometry("780x680")
        self.root.minsize(680, 600)

        style = ttk.Style(self.root)
        # 'clam' respects background/foreground settings; 'vista' does not.
        style.theme_use("clam")

        style.configure(".", background=BG, foreground=TEXT, font=UI)
        style.configure("TFrame", background=BG)
        style.configure("Surface.TFrame", background=SURFACE)
        style.configure("TLabel", background=BG, foreground=TEXT, font=UI)
        style.configure("Surface.TLabel", background=SURFACE, foreground=TEXT, font=UI)
        style.configure("Dim.TLabel", background=BG, foreground=TEXT_DIM, font=UI_SMALL)
        style.configure(
            "Eyebrow.TLabel", background=BG, foreground=TEXT_FAINT, font=("Segoe UI", 8, "bold")
        )
        style.configure("Mono.TLabel", background=BG, foreground=TEXT, font=MONO)
        style.configure("Title.TLabel", background=BG, foreground=TEXT, font=TITLE)

        style.configure(
            "TButton",
            background=SURFACE_ALT,
            foreground=TEXT,
            bordercolor=BORDER,
            focuscolor=BORDER,
            relief="flat",
            padding=(12, 6),
            font=UI,
        )
        style.map(
            "TButton",
            background=[("active", BORDER), ("disabled", SURFACE)],
            foreground=[("disabled", TEXT_FAINT)],
        )

        style.configure(
            "Accent.TButton", background=ACCENT, foreground="#ffffff", font=UI_BOLD
        )
        style.map(
            "Accent.TButton",
            background=[("active", ACCENT_BRIGHT), ("disabled", SURFACE_ALT)],
            foreground=[("disabled", TEXT_FAINT)],
        )

        style.configure(
            "TRadiobutton", background=BG, foreground=TEXT, font=MONO, focuscolor=BG
        )
        style.map("TRadiobutton", background=[("active", BG)], foreground=[("active", ACCENT_BRIGHT)])

        style.configure("TCheckbutton", background=BG, foreground=TEXT, font=UI, focuscolor=BG)
        style.map("TCheckbutton", background=[("active", BG)])

        style.configure(
            "TEntry",
            fieldbackground=SURFACE_ALT,
            foreground=TEXT,
            bordercolor=BORDER,
            insertcolor=TEXT,
            padding=6,
        )

        style.configure(
            "Thin.Horizontal.TProgressbar",
            troughcolor=SURFACE_ALT,
            background=ACCENT,
            bordercolor=SURFACE_ALT,
            lightcolor=ACCENT,
            darkcolor=ACCENT,
            thickness=6,
        )

        style.configure("TSeparator", background=BORDER)

    # -- Layout -------------------------------------------------------------

    def _section(self, parent: tk.Widget, title: str) -> ttk.Frame:
        ttk.Label(parent, text=title.upper(), style="Eyebrow.TLabel").pack(
            anchor="w", pady=(14, 6)
        )
        frame = ttk.Frame(parent)
        frame.pack(fill="x")
        return frame

    def _build_layout(self) -> None:
        outer = ttk.Frame(self.root, padding=(18, 14, 18, 14))
        outer.pack(fill="both", expand=True)

        header = ttk.Frame(outer)
        header.pack(fill="x")
        ttk.Label(header, text="checkup", style="Title.TLabel").pack(side="left")
        ttk.Label(
            header, text=f"  raw NTFS analyzer · {__version__}", style="Dim.TLabel"
        ).pack(side="left", pady=(5, 0))

        self.elevation_frame = ttk.Frame(outer)
        self._build_elevation_notice()

        # --- source ---
        source = self._section(outer, "Source")
        self.volume_container = ttk.Frame(source)
        self.volume_container.pack(fill="x")

        image_row = ttk.Frame(source)
        image_row.pack(fill="x", pady=(6, 0))
        ttk.Radiobutton(
            image_row, text="Disk image", value="__image__", variable=self.source_var
        ).pack(side="left")
        ttk.Entry(image_row, textvariable=self.image_var, width=42).pack(
            side="left", padx=(8, 6), fill="x", expand=True
        )
        ttk.Button(image_row, text="Browse", command=self._browse_image).pack(side="left")

        refresh_row = ttk.Frame(source)
        refresh_row.pack(fill="x", pady=(6, 0))
        ttk.Button(refresh_row, text="Refresh volumes", command=self._refresh_volumes).pack(
            side="left"
        )

        # --- options ---
        options = self._section(outer, "Options")
        ttk.Checkbutton(
            options,
            text="Emit every parsed record  (--full)",
            variable=self.full_var,
        ).pack(anchor="w")
        ttk.Checkbutton(
            options, text="Hash stream content", variable=self.hash_var
        ).pack(anchor="w", pady=(2, 0))

        limit_row = ttk.Frame(options)
        limit_row.pack(fill="x", pady=(6, 0))
        ttk.Label(limit_row, text="Stop after", style="Dim.TLabel").pack(side="left")
        ttk.Entry(limit_row, textvariable=self.max_records_var, width=10).pack(
            side="left", padx=6
        )
        ttk.Label(limit_row, text="MFT records  (blank = all)", style="Dim.TLabel").pack(
            side="left"
        )

        # --- output ---
        output = self._section(outer, "Output")
        output_row = ttk.Frame(output)
        output_row.pack(fill="x")
        ttk.Entry(output_row, textvariable=self.output_var).pack(
            side="left", fill="x", expand=True, padx=(0, 6)
        )
        ttk.Button(output_row, text="Browse", command=self._browse_output).pack(side="left")

        ttk.Separator(outer, orient="horizontal").pack(fill="x", pady=(16, 0))

        # --- progress ---
        progress_frame = ttk.Frame(outer)
        progress_frame.pack(fill="x", pady=(12, 0))

        self.stage_label = ttk.Label(progress_frame, text="Idle", style="Mono.TLabel")
        self.stage_label.pack(anchor="w")

        self.progress = ttk.Progressbar(
            progress_frame, style="Thin.Horizontal.TProgressbar", maximum=1000
        )
        self.progress.pack(fill="x", pady=(6, 4))

        self.count_label = ttk.Label(progress_frame, text="", style="Dim.TLabel")
        self.count_label.pack(anchor="w")

        # --- log ---
        log_frame = tk.Frame(outer, bg=BORDER, highlightthickness=0, bd=0)
        log_frame.pack(fill="both", expand=True, pady=(12, 0))

        self.log = tk.Text(
            log_frame,
            bg=SURFACE,
            fg=TEXT_DIM,
            insertbackground=TEXT,
            font=MONO_SMALL,
            relief="flat",
            padx=10,
            pady=8,
            height=10,
            wrap="word",
            state="disabled",
        )
        self.log.pack(fill="both", expand=True, padx=1, pady=1)

        for tag, colour in (
            ("info", TEXT_DIM),
            ("good", ACCENT_BRIGHT),
            ("warn", SEV_HIGH),
            ("bad", SEV_CRITICAL),
            ("head", TEXT),
        ):
            self.log.tag_configure(tag, foreground=colour)

        # --- actions ---
        actions = ttk.Frame(outer)
        actions.pack(fill="x", pady=(12, 0))

        self.scan_button = ttk.Button(
            actions, text="Start scan", style="Accent.TButton", command=self._start_scan
        )
        self.scan_button.pack(side="right")

        self.cancel_button = ttk.Button(
            actions, text="Cancel", command=self._cancel_scan, state="disabled"
        )
        self.cancel_button.pack(side="right", padx=(0, 8))

        self.open_button = ttk.Button(
            actions, text="Show case file", command=self._reveal_output, state="disabled"
        )
        self.open_button.pack(side="left")

        self.status_label = ttk.Label(actions, text="", style="Dim.TLabel")
        self.status_label.pack(side="left", padx=(12, 0))

    def _build_elevation_notice(self) -> None:
        if is_elevated():
            return

        self.elevation_frame.pack(fill="x", pady=(12, 0))
        bar = tk.Frame(self.elevation_frame, bg=SURFACE, highlightthickness=0)
        bar.pack(fill="x")

        stripe = tk.Frame(bar, bg=SEV_HIGH, width=2)
        stripe.pack(side="left", fill="y")

        inner = tk.Frame(bar, bg=SURFACE, padx=10, pady=8)
        inner.pack(side="left", fill="x", expand=True)

        tk.Label(
            inner,
            text="Not running as Administrator",
            bg=SURFACE,
            fg=SEV_HIGH,
            font=UI_BOLD,
            anchor="w",
        ).pack(fill="x")
        tk.Label(
            inner,
            text=(
                "Scanning a drive letter needs a raw volume handle, which is privileged. "
                "Disk images can still be read without elevation."
            ),
            bg=SURFACE,
            fg=TEXT_DIM,
            font=UI_SMALL,
            anchor="w",
            justify="left",
            wraplength=560,
        ).pack(fill="x", pady=(2, 6))

        ttk.Button(
            inner, text="Restart as Administrator", command=self._elevate
        ).pack(anchor="w")

    # -- Volume list --------------------------------------------------------

    def _refresh_volumes(self) -> None:
        for child in self.volume_container.winfo_children():
            child.destroy()

        self.volumes = scannable_volumes()

        if not self.volumes:
            ttk.Label(
                self.volume_container,
                text="No NTFS volumes detected — select a disk image below.",
                style="Dim.TLabel",
            ).pack(anchor="w")
            if self.source_var.get() != "__image__":
                self.source_var.set("__image__")
            return

        for volume in self.volumes:
            row = ttk.Frame(self.volume_container)
            row.pack(fill="x", pady=1)

            ttk.Radiobutton(
                row,
                text=volume.describe(),
                value=volume.letter,
                variable=self.source_var,
            ).pack(side="left")

            if volume.is_system_drive:
                ttk.Label(
                    row, text="system drive", style="Eyebrow.TLabel"
                ).pack(side="left", padx=(8, 0))

        if not self.source_var.get():
            # Prefer a non-system volume: scanning C: is slow and rarely what
            # someone wants first.
            preferred = next(
                (v for v in self.volumes if not v.is_system_drive), self.volumes[0]
            )
            self.source_var.set(preferred.letter)

    # -- Dialogs ------------------------------------------------------------

    def _browse_image(self) -> None:
        path = filedialog.askopenfilename(
            title="Select a disk image",
            filetypes=[("Disk images", "*.img *.dd *.raw *.bin"), ("All files", "*.*")],
        )
        if path:
            self.image_var.set(path)
            self.source_var.set("__image__")

    def _browse_output(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Save case file as",
            defaultextension=".json",
            initialfile="case.json",
            filetypes=[("JSON case file", "*.json")],
        )
        if path:
            self.output_var.set(path)

    def _elevate(self) -> None:
        if relaunch_elevated([]):
            self.root.destroy()
        else:
            self._append("Elevation was declined or unavailable.", "warn")

    def _reveal_output(self) -> None:
        if self.result is None:
            return
        target = self.result.output_path
        try:
            if sys.platform == "win32":
                subprocess.Popen(["explorer", "/select,", str(target)])
            else:
                subprocess.Popen(["xdg-open", str(target.parent)])
        except OSError as error:
            self._append(f"Could not open the folder: {error}", "warn")

    # -- Logging ------------------------------------------------------------

    def _append(self, text: str, tag: str = "info") -> None:
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n", tag)
        self.log.see("end")
        self.log.configure(state="disabled")

    def _clear_log(self) -> None:
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

    # -- Scan lifecycle -----------------------------------------------------

    def _resolve_target(self) -> Optional[str]:
        selected = self.source_var.get()

        if selected == "__image__":
            image = self.image_var.get().strip()
            if not image:
                self._append("Select a disk image first.", "warn")
                return None
            if not Path(image).exists():
                self._append(f"No such image: {image}", "bad")
                return None
            return image

        if not selected:
            self._append("Select a volume or a disk image first.", "warn")
            return None

        if not is_elevated():
            self._append(
                "Scanning a drive letter needs Administrator. Restart elevated, "
                "or choose a disk image.",
                "warn",
            )
            return None

        return selected

    def _start_scan(self) -> None:
        if self.worker is not None and self.worker.is_alive():
            return

        target = self._resolve_target()
        if target is None:
            return

        output = self.output_var.get().strip()
        if not output:
            self._append("Choose an output path first.", "warn")
            return

        max_records: Optional[int] = None
        raw_limit = self.max_records_var.get().strip()
        if raw_limit:
            if not raw_limit.isdigit() or int(raw_limit) <= 0:
                self._append(f"'{raw_limit}' is not a positive record count.", "warn")
                return
            max_records = int(raw_limit)

        options = ScanOptions(
            target=target,
            output=output,
            full=self.full_var.get(),
            no_hash=not self.hash_var.get(),
            max_records=max_records,
            quiet=True,
        )

        self.cancel_flag.clear()
        self.result = None
        self._clear_log()
        self._set_running(True)
        self._append(f"Scanning {target}", "head")

        self.worker = threading.Thread(
            target=self._scan_worker, args=(options, Path(output)), daemon=True
        )
        self.worker.start()

    def _cancel_scan(self) -> None:
        if self.worker is not None and self.worker.is_alive():
            self.cancel_flag.set()
            self.cancel_button.configure(state="disabled")
            self.stage_label.configure(text="Cancelling…")

    def _set_running(self, running: bool) -> None:
        self.scan_button.configure(state="disabled" if running else "normal")
        self.cancel_button.configure(state="normal" if running else "disabled")
        self.open_button.configure(
            state="normal" if (not running and self.result is not None) else "disabled"
        )
        if running:
            self.progress.configure(value=0)
            self.status_label.configure(text="")

    # -- Worker thread ------------------------------------------------------

    def _scan_worker(self, options: ScanOptions, output: Path) -> None:
        """Runs off the UI thread. Communicates only through the queue."""

        def on_progress(update: Progress) -> None:
            self.events.put(("progress", update))

        try:
            case = run_scan(
                options,
                on_progress=on_progress,
                should_cancel=self.cancel_flag.is_set,
            )
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(case, indent=2) + "\n", encoding="utf-8")
            self.events.put(("done", ScanResult(case, output)))

        except ScanCancelled:
            self.events.put(("cancelled", None))
        except PermissionError:
            self.events.put(
                ("error", "Access denied. Scanning a drive letter requires Administrator.")
            )
        except FileNotFoundError:
            self.events.put(("error", f"No such volume or image: {options.target}"))
        except NotNtfsError as error:
            self.events.put(("error", f"Not an NTFS volume: {error}"))
        except MftParseError as error:
            self.events.put(("error", f"MFT parse failed: {error}"))
        except Exception:  # noqa: BLE001 - last resort, surfaced in the log
            self.events.put(("error", traceback.format_exc()))

    # -- Event pump ---------------------------------------------------------

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()

                if kind == "progress":
                    self._on_progress(payload)
                elif kind == "done":
                    self._on_done(payload)
                elif kind == "cancelled":
                    self._on_cancelled()
                elif kind == "error":
                    self._on_error(payload)

        except queue.Empty:
            pass

        self.root.after(60, self._poll_events)

    def _on_progress(self, update: Progress) -> None:
        self.stage_label.configure(text=update.label)

        fraction = update.fraction
        if fraction is None:
            self.count_label.configure(text=update.message)
        else:
            self.progress.configure(value=int(fraction * 1000))
            self.count_label.configure(
                text=f"{update.current:,} / {update.total:,} records"
            )

        if update.current == 0:
            self._append(update.message, "info")

    def _on_done(self, result: ScanResult) -> None:
        self.result = result
        self.progress.configure(value=1000)
        self.stage_label.configure(text="Complete")

        case = result.case
        counts = case["statistics"]["fileCounts"]
        severities = case["statistics"]["findingsBySeverity"]
        findings = case["findings"]

        self._append("", "info")
        self._append(f"case      {case['scan']['caseId']}", "head")
        self._append(
            f"volume    {case['volume']['label'] or '(unlabelled)'} "
            f"({case['volume']['driveLetter'] or 'image'})"
        )
        self._append(
            f"records   {counts['total']:,}  "
            f"({counts['deleted']:,} deleted, {counts['orphaned']:,} orphaned)"
        )
        self._append(f"recovered {case['scan']['filesRecovered']:,}")
        self._append(f"streams   {counts['withAlternateStreams']:,} records carrying ADS")

        if findings:
            tag = "bad" if severities.get("critical") else "warn"
            self._append(
                f"findings  {len(findings)}  "
                f"({severities.get('critical', 0)} critical, "
                f"{severities.get('high', 0)} high, "
                f"{severities.get('medium', 0)} medium)",
                tag,
            )
        else:
            self._append("findings  none", "good")

        self._append("", "info")
        self._append(f"written   {result.output_path}", "good")
        self._append("Upload the case file at the ForensicaLite web app to view the report.")

        self.count_label.configure(text=f"{counts['total']:,} records examined")
        self.status_label.configure(text=f"Saved to {result.output_path.name}")
        self._set_running(False)

    def _on_cancelled(self) -> None:
        self.stage_label.configure(text="Cancelled")
        self._append("Scan cancelled. No case file was written.", "warn")
        self.progress.configure(value=0)
        self.count_label.configure(text="")
        self._set_running(False)

    def _on_error(self, message: str) -> None:
        self.stage_label.configure(text="Failed")
        self._append(message, "bad")
        self.progress.configure(value=0)
        self._set_running(False)


def launch() -> int:
    root = tk.Tk()

    # Without this the window inherits a stock Tk icon; there is no bundled
    # .ico, so simply leave the default rather than ship a placeholder.
    try:
        root.call("tk", "scaling", 1.2)
    except tk.TclError:
        pass

    CheckupApp(root)
    root.mainloop()
    return 0
