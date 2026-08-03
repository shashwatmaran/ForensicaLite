#!/usr/bin/env python3
"""
checkup — ForensicaLite's NTFS analyzer.

Reads a volume at the sector level, parses $MFT directly, and writes a
schema-v1 JSON case file for the ForensicaLite web app.

    checkup.py E:                          scan drive E:
    checkup.py E: -o case.json             choose the output path
    checkup.py E: --full --max-files 50000 emit every record
    checkup.py disk.img                    work from an image, no admin needed

Requires Administrator when given a drive letter: opening a raw volume handle
is a privileged operation. Image files can be read unprivileged.
"""

from __future__ import annotations

import argparse
import ctypes
import sys
from pathlib import Path

from forensica import __version__
from forensica.analyze import ScanOptions, run_scan, write_case_file
from forensica.boot import NotNtfsError
from forensica.mft import MftParseError
from forensica.volume import VolumeReadError


def _is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return False


def _looks_like_drive(target: str) -> bool:
    stripped = target.strip()
    if len(stripped) == 1 and stripped.isalpha():
        return True
    return len(stripped) == 2 and stripped[0].isalpha() and stripped[1] == ":"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="checkup",
        description="Raw NTFS forensic analyzer — parses $MFT and writes a JSON case file.",
    )
    parser.add_argument(
        "target",
        help="Drive letter to scan (E, E:) or the path to a raw disk image.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Case file path. Defaults to case-<caseid>.json in the working directory.",
    )
    parser.add_argument("--case-id", default=None, help="Override the generated case identifier.")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Emit every parsed record instead of the triaged subset.",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=5_000,
        help="Ceiling on emitted file records (default: 5000).",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=None,
        help="Stop after this many MFT records. Useful for a quick look at a huge volume.",
    )
    parser.add_argument(
        "--hash-limit",
        type=int,
        default=16 * 1024 * 1024,
        help="Largest non-resident stream to read and hash, in bytes (default: 16 MiB).",
    )
    parser.add_argument("--no-hash", action="store_true", help="Skip content hashing entirely.")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress progress output.")
    parser.add_argument("--version", action="version", version=f"checkup {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if sys.platform != "win32" and _looks_like_drive(args.target):
        print(
            "error: scanning a drive letter requires Windows. Point at a disk image instead.",
            file=sys.stderr,
        )
        return 2

    if _looks_like_drive(args.target) and not _is_admin():
        print(
            "error: opening a raw volume handle requires Administrator.\n"
            "       Re-run from an elevated prompt, or point checkup at a disk image.",
            file=sys.stderr,
        )
        return 2

    options = ScanOptions(
        target=args.target,
        output=args.output or "",
        case_id=args.case_id,
        full=args.full,
        max_files=args.max_files,
        max_records=args.max_records,
        hash_limit=args.hash_limit,
        no_hash=args.no_hash,
        quiet=args.quiet,
    )

    try:
        case = run_scan(options)
    except NotNtfsError as error:
        print(f"error: {error}", file=sys.stderr)
        return 3
    except PermissionError:
        print(
            "error: access denied opening the volume. Administrator is required.",
            file=sys.stderr,
        )
        return 2
    except FileNotFoundError:
        print(f"error: no such volume or image: {args.target}", file=sys.stderr)
        return 3
    except (MftParseError, VolumeReadError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 4

    destination = Path(args.output) if args.output else Path(f"case-{case['scan']['caseId']}.json")

    try:
        written = write_case_file(case, destination)
    except OSError as error:
        print(f"error: could not write {destination}: {error}", file=sys.stderr)
        return 5

    if not args.quiet:
        statistics = case["statistics"]["fileCounts"]
        severities = case["statistics"]["findingsBySeverity"]
        print()
        print(f"    case      {case['scan']['caseId']}")
        print(f"    volume    {case['volume']['label'] or '(unlabelled)'} "
              f"({case['volume']['driveLetter'] or 'image'})")
        print(f"    records   {statistics['total']} "
              f"({statistics['deleted']} deleted, {statistics['orphaned']} orphaned)")
        print(f"    hidden    {statistics['withAlternateStreams']} records with alternate streams")
        print(f"    findings  {len(case['findings'])} "
              f"({severities['critical']} critical, {severities['high']} high, "
              f"{severities['medium']} medium)")
        print(f"    written   {destination}  ({written:,} bytes, verified)")
        print()
        print("Upload the case file at the ForensicaLite web app to view the report.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
