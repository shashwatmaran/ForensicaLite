# ForensicaLite — Class Project Pitch

Raw NTFS disk forensics, built from the sector up. A native analyzer reads a Windows
volume directly, off the disk, and a zero-backend web app turns what it finds into an
auditable report — so evidence never has to leave the machine it came from.

**Stack:** Python 3.11+, standard library only · React/TypeScript static web app
**Status:** v2.0.0 — v1 scope complete, verified on real hardware at 100k-file scale

| | | | |
|---|---|---|---|
| **156** tests passing | **100k** files verified on a real 57 GB drive | **7** detectors, 10 rules | **17.5k** records/s |

**Agenda:** 01 Architecture · 02 Functionalities · 03 Demo · 04 Implementation · 05 Where it stands

---

## 01 — Architecture

Two independent programs, joined by one versioned file format. Neither side trusts the
other blindly.

```
01 · ANALYZER                02 · CONTRACT              03 · REPORT
checkup.exe            →     case.json             →    Web app
Runs elevated, on the        One self-contained          Static site, zero
target machine. Opens        file, schemaVersion: 1.      backend. Findings,
the volume as a raw          A mismatched file is          timeline, recovered
device — bypasses             rejected with a reason —      files — rendered
Windows file APIs             never silently                entirely in the
and the locks they            mis-rendered.                 browser.
hold on $MFT entirely.
```

**The structural guarantee:** the report side has no server to send anything to, so
evidence cannot leave the examiner's machine — not a policy switch, there's simply no
code path for it to happen.

**The contract is tested, not trusted.** A JSON Schema is generated from the web app's
TypeScript types, and CI runs the real analyzer against a synthetic disk and validates
its output against that schema. Rename a field on one side only and the build fails.

**Core modules:**

| Module | Job |
|---|---|
| `volume.py` | Opens `\\.\E:` directly, sector-aligned reads, no OS file lock in the way |
| `boot.py` | Parses the $Boot sector — cluster size, sectors/cluster, where $MFT begins |
| `mft.py` | The core parser: fixups, attribute decoding, signed data runs, $ATTRIBUTE_LIST |
| `usn.py` | The USN change journal — the kernel's log of creates, deletes, renames and moves |
| `findings.py` | Seven detectors (ten rule ids), each citing the raw evidence it fired on |

---

## 02 — Functionalities

What it actually finds, and how the report surfaces it — six purpose-built views, not
one generic results page.

| Detector | Severity | What it proves |
|---|---|---|
| `si-fn-created-mismatch` · `si-fn-modified-mismatch` | critical (≥1 day) / high | $SI timestamp earlier than $FN — impossible under normal use. Direct evidence of timestomping, and the USN journal's record of the change is attached. |
| `si-subsecond-zeroed` | high | All timestamps land on an exact whole second — a tool-generated artifact, not organic activity. |
| `si-before-volume-creation` | medium | A file claiming to predate the volume it lives on. |
| `si-timestamp-in-future` | medium | A timestamp later than the scan itself. |
| `named-data-stream-present` | high / medium | Alternate Data Streams — a hidden second payload attached to a normal-looking file. High when the hidden stream outweighs the visible one. |
| `deleted-resident-content` | high | Deleted file under ~700 bytes — recovered byte-for-byte from inside its own MFT record. |
| `deleted-nonresident-runs` | medium / low | Larger deleted file — recovery graded against $Bitmap cluster reuse. |
| `parent-sequence-mismatch` | medium | Orphaned record — file provably existed, its old location no longer resolvable. |
| `hidden-system-outside-system-path` | medium (executable) / low | HIDDEN+SYSTEM attributes on a file living outside a Windows system folder. |

**Report views:**

- **Overview** — leads with raw $Boot geometry, how you check the tool read the disk correctly before trusting anything else
- **Findings** — every flag, sorted by severity, expandable into its raw evidence
- **Timeline** — every dated event, each row labeled with its source: $SI, $FN, or the USN journal — including renames, moves and deletions the $MFT no longer shows
- **Records** — a browsable grid of every MFT record, with the $SI/$FN comparison one click away, and recovered content as text or hex, downloadable byte-for-byte
- **Stats** — file types, sizes, severity distribution as bars with exact counts, not pie slices
- **Case list** — multiple scans open side by side, for comparing the same drive at two points in time

**Export:** one click produces a self-contained HTML examination report (prints to PDF)
and a findings CSV — generated in the browser, still nothing uploaded.

---

## 03 — Live Demo

Run against a USB stick staged with known, planted evidence — so every result on screen
has a predicted answer before the scan even starts.

1. **Stage the evidence** — the script turns on the USB stick's change journal, then
   plants a control file and the artifacts: a timestomped executable, a file carrying a
   hidden stream, a small deleted file, a large deleted file, an impossible-dated file,
   and a file moved between folders.
   `scripts/stage_evidence.ps1 -Drive E:`
2. **Launch the desktop analyzer, elevated** — volume picker shows only NTFS volumes;
   the system drive is labeled and effectively off-limits. Pick the USB stick, start
   the scan.
   `checkup_gui.py → Start Scan`
3. **Watch it run** — live progress bar, current stage and record count. Cancel stops
   cleanly with no partial case file — worth saying out loud, it's a real engineering
   detail (worker thread, cancel check, atomic write).
4. **Open the case file in the report** — static web app, no upload, no network call,
   load the JSON straight off disk into the browser.
5. **Walk the Findings panel against the answer key** — narrate each expected finding
   before it appears, which reads as command of the material, not a lucky demo.
   Expected, 12 findings across 5 files: `6 timestomp · 2 impossible-timestamp ·
   2 deleted-recoverable · 1 ADS · 1 hidden-system`. Both backdated files (`svchost.exe`,
   `install.log`) trip all three timestamp rules and predate the volume — verified on
   the real stick, not estimated.
6. **Open the Timeline, filter to USN** — the move from `Media\plan.txt` to
   `Docs\plan-final.txt` and both deletions, none of which the $MFT alone can show. Then
   open the timestomp finding: the journal's `BASIC_INFO_CHANGE` says when the forgery
   actually happened.
7. **Export the report** — one self-contained HTML file, ready to hand over.

**Fallback if live hardware misbehaves:** a case file generated during rehearsal,
loadable without re-scanning, plus the bundled sample case on the landing page that
needs no scan at all.

---

## 04 — Implementation

Reading the $MFT correctly is not a straightforward parse. Four traps, each with its
own test — this is where the real depth is.

**Fixups.** NTFS overwrites the last 2 bytes of every sector in a record with a marker,
and stashes the real bytes in the header. Skip undoing this and timestamps and sizes
silently corrupt — no error thrown.

**Signed data runs.** A file's on-disk location is a run list — but each run's start
cluster is a *signed offset* from the previous run, not an absolute address. Read it
unsigned and any fragmented file's data lands in the wrong place.

**$MFT describes itself.** Record #0 is the $MFT's own entry, using that same run-list
mechanism. Read its real layout instead of assuming contiguity, or the parser breaks on
any real, fragmented drive.

**Files bigger than their record.** A file with many hard links or a heavily
fragmented stream doesn't fit in one 1 KB record; NTFS spills attributes into extension
records and lists them in `$ATTRIBUTE_LIST`. Ignore the list and such a file loses its
name and vanishes from the results. The parser follows it, refuses extension records
that no longer point back (a reused slot), and stitches split data back together in
order.

**Alternate streams.** A $DATA attribute (type `0x80`) with a non-empty name field is,
by NTFS's own rules, invisible to Explorer. The parser walks every attribute rather than
stopping at the first, unnamed one — nothing exotic, just refusing to only look where
Explorer looks.

**The change journal.** `$UsnJrnl:$J` is mostly sparse — NTFS releases old history — so
only allocated runs are read, newest first. Several records make up one operation; the
analyzer emits one row per completed operation and pairs each rename with the name it
replaced.

**Stdlib only.** No third-party runtime dependency, by design — every structure is
parsed by hand, so the path from sector to finding stays fully auditable. Tkinter over
Qt for the same reason: zero extra runtime footprint.

**Tested three ways.** 125 analyzer tests against a synthetic NTFS image built
byte-by-byte with planted ground truth — including a fragmented $MFT, an
$ATTRIBUTE_LIST file and a planted journal — plus 31 web tests and the contract test;
then a full pass against a real 57 GB drive, cross-checked against Windows' own
`fsutil`, byte-exact recovery confirmed.

---

## 05 — Where It Stands

The v1 scope is built and tested. Named precisely, not glossed over.

**Built & verified**

- Raw volume access, $Boot geometry parsing
- Full $MFT parsing — fixups, signed runs, self-describing extent map, $ATTRIBUTE_LIST
- Buffered reads — one disk read per thousand records
- All 7 detectors, every finding evidence-backed
- USN journal — rename, move and delete history, corroborating timestomp findings
- Deleted-file recovery, graded by confidence, downloadable byte-for-byte
- Desktop GUI + CLI, cancellable, atomic case-file write
- Versioned schema with a contract test in CI; static report UI with HTML/CSV export

**Verified at scale on real hardware**

- 100,159 records on a 57 GB USB stick, parsed at 17,517 records/s with 98 disk reads
- A real `$ATTRIBUTE_LIST` (40 hard links) reassembled, reparse points parsed cleanly
- 300,367 USN journal records read; the planted move and deletions all recovered
- 19 of 19 ground-truth checks passed, zero scan errors — one command,
  `scripts/verify_volume.ps1 -Drive E: -BulkFiles 100000`

**Deliberately out of scope**

- **Code signing** — unsigned exe is blocked by Smart App Control; run from source there
- **$LogFile, Prefetch, registry, event logs** — this is an NTFS filesystem tool, not a
  full artifact suite
- **Content scanning (YARA)** — the structural detectors catch *tampering*; matching
  file contents against known-bad patterns is a natural next layer, not part of v1
