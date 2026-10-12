"""
Write case files from the synthetic volume, for the web app's contract test.

The analyzer and the web app are built against one schema, generated from
src/types/case.ts. The pytest suite checks what the analyzer finds; this lets
the JavaScript side check that what it *emits* actually matches the types the
UI was compiled against — both the full and the default triaged output.

    python -m tests.emit_case OUTPUT_DIR
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from forensica.analyze import ScanOptions, run_scan, write_case_file

from . import synthetic


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m tests.emit_case OUTPUT_DIR", file=sys.stderr)
        return 2

    out = Path(argv[0])
    out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as scratch:
        image = synthetic.write_image(str(Path(scratch) / "synthetic.img"))
        for name, full in (("synthetic-full.json", True), ("synthetic-triaged.json", False)):
            case = run_scan(ScanOptions(target=image, output="", quiet=True, full=full))
            write_case_file(case, out / name)
            print(out / name)

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
