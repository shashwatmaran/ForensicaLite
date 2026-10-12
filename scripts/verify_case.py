"""
Check a case file from a staged volume against the planted ground truth.

    python scripts/verify_case.py case.json --cluster 4096 --mft-lcn 0xc0000 --record-size 1024

Run by verify_volume.ps1 after it stages and scans a test volume. Every check
prints PASS or FAIL with the value it saw, so the output can be read on its own
— and pasted into an issue — without opening the case file.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from typing import Any, Dict, List, Optional

results: List[bool] = []


def check(label: str, ok: bool, seen: Any = "") -> None:
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"  ({seen})" if seen != "" else ""))


def by_name(case: Dict[str, Any], name: str) -> Optional[Dict[str, Any]]:
    return next((f for f in case["files"]["entries"] if f["fileName"] == name), None)


def findings_for(case: Dict[str, Any], name: str) -> List[Dict[str, Any]]:
    return [f for f in case["findings"] if (f["filePath"] or "").endswith("\\" + name)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("case")
    parser.add_argument("--cluster", type=int, required=True)
    parser.add_argument("--mft-lcn", type=lambda v: int(v, 0), required=True)
    parser.add_argument("--record-size", type=int, required=True)
    parser.add_argument("--bulk", type=int, default=0)
    args = parser.parse_args()

    with open(args.case, encoding="utf-8") as handle:
        case = json.load(handle)

    volume, scan = case["volume"], case["scan"]

    print("\nGeometry against fsutil")
    check("bytes per cluster", volume["bytesPerCluster"] == args.cluster, volume["bytesPerCluster"])
    check("$MFT start cluster", volume["mftStartCluster"] == args.mft_lcn, volume["mftStartCluster"])
    check("MFT record size", volume["mftRecordSize"] == args.record_size, volume["mftRecordSize"])

    print("\nPlanted artifacts")
    detectors = {f["detectedBy"] for f in findings_for(case, "svchost.exe")}
    check("svchost.exe $SI/$FN timestomp", "si-fn-created-mismatch" in detectors, sorted(detectors))
    check("svchost.exe zeroed sub-seconds", "si-subsecond-zeroed" in detectors)
    check("svchost.exe hidden+system", "hidden-system-outside-system-path" in detectors)

    notes = by_name(case, "notes.txt")
    streams = [s["name"] for s in notes["streams"]] if notes else []
    check("notes.txt carries :payload", "payload" in streams, streams)

    handover = by_name(case, "handover-credentials.txt")
    recovery = (handover or {}).get("recovery") or {}
    content = base64.b64decode(recovery.get("residentContentBase64") or "")
    check("handover-credentials.txt deleted", bool(handover) and handover["status"] == "deleted")
    check("handover-credentials.txt fully recovered", recovery.get("confidence") == "full")
    check(
        "recovered bytes are the planted notes",
        b"# Handover notes" in content,
        f"{len(content)} bytes",
    )

    capture = by_name(case, "screen-capture.mp4")
    check(
        "screen-capture.mp4 deleted, non-resident",
        bool(capture) and capture["status"] == "deleted",
        ((capture or {}).get("recovery") or {}).get("confidence", ""),
    )

    install = {f["detectedBy"] for f in findings_for(case, "install.log")}
    check("install.log predates the volume", "si-before-volume-creation" in install, sorted(install))

    print("\nUSN journal")
    usn_rows = [r for r in case["timeline"]["entries"] if r["source"] == "usn-journal"]
    check("journal rows present", bool(usn_rows), f"{len(usn_rows)} rows")
    moved = [r for r in usn_rows if r["action"] == "moved" and "plan-final.txt" in r["detail"]]
    check("plan.txt move recorded", bool(moved), moved[0]["detail"] if moved else "")
    deleted = {r["detail"].split(" · ")[0] for r in usn_rows if r["action"] == "deleted"}
    check(
        "both deletions journalled",
        {"handover-credentials.txt", "screen-capture.mp4"} <= deleted,
        sorted(deleted),
    )
    cited = any(
        e["label"] == "USN BASIC_INFO_CHANGE"
        for f in findings_for(case, "svchost.exe")
        if f["type"] == "timestomp"
        for e in f["evidence"]
    )
    check("timestomp cites BASIC_INFO_CHANGE", cited)

    if args.bulk:
        print("\nScale")
        check(
            "records parsed covers the bulk load",
            scan["mftRecordsParsed"] >= args.bulk,
            f"{scan['mftRecordsParsed']:,} in {scan['durationSeconds']}s",
        )
        # With 40 names, which one is reported is the most descriptive of them;
        # what matters is that the record was reassembled at all.
        linked = [
            f for f in case["files"]["entries"] if "\\Links\\" in (f["filePath"] or "")
        ]
        check(
            "40-link file reassembled via $ATTRIBUTE_LIST",
            bool(linked),
            linked[0]["fileName"] if linked else "",
        )
        attribute_errors = [e for e in scan["errors"] if e["stage"] == "attribute"]
        check("no $ATTRIBUTE_LIST errors", not attribute_errors, attribute_errors[:3])

    print(f"\nScan errors: {len(scan['errors'])}")
    for error in scan["errors"][:10]:
        print(f"    [{error['stage']}] #{error['recordNumber']}: {error['message']}")

    failed = results.count(False)
    print(f"\n{len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
