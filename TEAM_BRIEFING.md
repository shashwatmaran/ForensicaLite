# ForensicaLite — Team Briefing

A raw NTFS disk forensics tool: a Python analyzer that reads a Windows drive at the
sector level and writes one JSON case file, and a static web app that turns that file
into an investigative report. Built to answer one question — what does the disk
actually contain, regardless of what the OS says.

**Stack:** Python 3.11+ analyzer, standard library only · React/TypeScript static web app
**Status:** v2.0.0 — v1 scope complete, verified on a real volume at 100k-file scale

---

## 1. Prerequisite knowledge

When Windows deletes a file, it does not erase the data. It flips one bit that means
*"this space is free now"* and moves on. The bytes stay exactly where they were until
something else happens to overwrite them.

That gap between what the filesystem **reports** and what the disk **contains** is the
entire premise of this project.

| Term | What it means |
|---|---|
| **cluster** | The disk's smallest addressable chunk — usually 4096 bytes. Every file's data is a set of clusters; nothing is addressed byte-by-byte. |
| **NTFS** | The filesystem format almost every Windows drive uses — the scheme that tracks which clusters belong to which file, plus names, timestamps, and permissions. |
| **$MFT** | Master File Table. One giant table where *every* object on the volume — every file, folder, even NTFS's own internal bookkeeping — has exactly one entry. |
| **MFT record** | One entry in that table, fixed at 1024 bytes, built from a sequence of self-describing *attributes*: name, timestamps, content, on-disk location. |
| **resident / non-resident** | A file under ~700 bytes is stored *inside* its own MFT record. Bigger files just store a pointer to clusters elsewhere. This split decides whether a deleted file is recoverable byte-for-byte or not at all. |
| **$SI vs $FN** | Two separate timestamp copies per file. `$STANDARD_INFORMATION` is user-writable — anyone can forge it. `$FILE_NAME` is written only by the kernel, only on create/rename/move. One can lie; the other can't. |
| **$Bitmap** | One bit per cluster on the whole volume: used or free. Checking it against a deleted file's old clusters is how recovery confidence gets graded instead of guessed. |
| **USN journal** | `$Extend\$UsnJrnl:$J` — the kernel's running log of every create, delete, rename and move. The $MFT shows the volume as it is; the journal shows how it got there. |

---

## 2. How the whole thing is built

Two independent programs joined by one file format. Neither trusts the other blindly.

```
01 · ANALYZER                02 · CONTRACT              03 · REPORT
checkup.exe            →     case.json             →    Web app
Runs elevated, on the        One self-contained          Static site, zero
target machine. Opens        file. Versioned              backend. Findings,
the volume as a raw          schema — a mismatched        timeline, recovered
device — bypasses             file is rejected with        files — rendered
Windows file APIs             a reason, never              entirely in the
and their locks               silently mis-rendered.       browser.
entirely.
```

**Why this matters more than it sounds:** because the report side has no server to send
anything to, evidence cannot leave the examiner's machine by accident. It's not a policy
in a settings menu — there's simply no code path for it to happen.

---

## 3. The parts that were actually hard

Reading the $MFT correctly is not a straightforward parse. Four specific traps, each
with its own test.

**Fixups.** NTFS deliberately overwrites the last 2 bytes of every sector in a record
with a marker, and stashes the real bytes in the record header. Skip undoing this and
you silently get wrong timestamps and sizes — no error thrown, just quietly corrupt data.

**Signed data runs.** A file's on-disk location is a list of runs (start cluster,
length) — but every run after the first stores its start as a *signed offset* from the
previous run, not an absolute address. Read it unsigned and every fragmented file's data
lands in the wrong place.

**$MFT describes itself.** Record #0 in the table is the $MFT's own entry, using that
same run-list mechanism. Assume the table is one contiguous block instead of reading
record 0's real layout, and the parser breaks the moment the $MFT itself is fragmented —
which it is, on any real, well-used drive.

**Files bigger than their record.** A file with many hard links or a badly fragmented
stream outgrows its 1 KB record, so NTFS moves some attributes into *extension records*
and lists where they went in `$ATTRIBUTE_LIST`. Skip the list and the file can lose its
name entirely and drop out of the results. The parser follows it, refuses an extension
record that no longer points back to its owner (the slot was reused), and joins split
data back together in order.

---

## 4. What it actually flags

Seven detectors, ten rule ids. Each one finds a fact that contradicts another fact that
should always agree with it — nothing here is a guess, and every finding ships with the
raw values it was computed from.

| Detector id | Severity | What it proves |
|---|---|---|
| `si-fn-created-mismatch` · `si-fn-modified-mismatch` | critical (≥1 day) / high | $SI timestamp earlier than $FN — impossible under normal use, since only $SI can be forged. Direct evidence of timestomping. When the USN journal logged the change, its `BASIC_INFO_CHANGE` record is attached: the real time of the forgery. |
| `si-subsecond-zeroed` | high | Created / modified / accessed all land on an exact whole second. NTFS's 100ns precision makes that coincidence vanishingly unlikely without a tool doing it. |
| `si-before-volume-creation` | medium | A file claiming to exist before the volume was formatted — physically impossible. |
| `si-timestamp-in-future` | medium | A timestamp later than the scan itself — written forward, or a wrong clock. |
| `named-data-stream-present` | high / medium | Alternate Data Streams — a second payload bolted onto a normal-looking file, invisible to Explorer and `dir`. |
| `deleted-resident-content` | high | Deleted file under ~700 bytes — content lived inside the MFT record, so recovery is byte-for-byte, guaranteed. |
| `deleted-nonresident-runs` | medium / low | Larger deleted file — recovery graded against $Bitmap: have its old clusters been reused yet or not. |
| `parent-sequence-mismatch` | medium | Orphaned record — parent folder's own entry was reused, so the file's existence is provable but its old location isn't. |
| `hidden-system-outside-system-path` | medium (executable) / low | HIDDEN+SYSTEM attributes on a file living outside `Windows\` or `Program Files\` — a classic way to stay invisible to a casual look. |

---

## 5. Where it actually stands

The v1 scope is built, tested, and verified on real hardware at scale. What is left out
is left out on purpose — say so in the review, precisely.

**By the numbers**

- **156** automated tests (125 analyzer, 31 web), seconds to run, no disk needed
- **57 GB** real NTFS volume, verified against `fsutil`
- **100k** files on that volume: 17,517 records/s, 19/19 ground-truth checks, 0 errors
- **7** detectors, 10 rule ids, each independently tested
- **2** binaries — desktop GUI + scriptable CLI, the CLI exe proven on a full scan

**Built & verified**

- Raw volume access, `$Boot` geometry parsing
- $MFT parsing — fixups, signed runs, self-describing extent map, `$ATTRIBUTE_LIST`
- Buffered reads — one disk read per ~1000 records instead of one per record
- USN journal — rename/move/delete history in the timeline, corroborating timestomps
- All 7 detectors, every finding evidence-backed
- Deleted-file recovery, graded by confidence, downloadable as the exact bytes
- Desktop GUI + CLI, same engine, cancellable scan
- Versioned JSON schema shared analyzer ↔ web app, enforced by a contract test in CI
- Static report UI — timeline, findings, file browser, HTML report and CSV export
- Tested on a synthetic image (including a fragmented $MFT, an `$ATTRIBUTE_LIST` file and
  a planted journal) *and* a real 57 GB drive

**Verified at scale**

- 100,159 records, a real `$ATTRIBUTE_LIST` from 40 hard links, a junction and a
  symlink, 300k USN records — all from one command,
  `scripts/verify_volume.ps1 -Drive E: -BulkFiles 100000`, 19 of 19 checks passing

**Out of scope by design**

- Code signing (the unsigned exe is blocked by Smart App Control — run from source there),
  $LogFile, NSRL hash triage, YARA, Prefetch/registry/EVTX
