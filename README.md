# ForensicaLite

NTFS disk forensics from the filesystem up. A native Windows analyzer reads the volume at the
sector level and writes a self-contained JSON case file; a static web app turns that file into an
investigative report.

The web app never uploads anything. It is a static site with no backend, so evidence cannot leave
the examiner's machine — that is a structural property, not a policy.

## Status

Version 2 is a rebuild on a versioned data contract between analyzer and UI.

| Component | State |
|---|---|
| Case file schema (v1) | Done — [src/types/case.ts](src/types/case.ts), JSON Schema generated to [schema/](schema/case.schema.json) |
| Analyzer (`checkup.py`) | Done — 125 tests passing |
| `$ATTRIBUTE_LIST` following, buffered `$MFT` reads | Done |
| USN change journal | Done — rename, move and delete history in the timeline |
| Web app / report UI | Done — 31 tests, verified in browser |
| Report export | Done — self-contained HTML report and findings CSV |
| Recovered content | Done — text or hex view, download of the exact bytes |
| Contract test | Done — analyzer output validated against the schema in CI |
| Verified against a real volume | Done — 57 GB NTFS, geometry cross-checked against `fsutil` |
| Verified at scale | Done — 100,159 records on a 57 GB stick, 19/19 checks, 0 scan errors |
| Executables | `checkup.exe` (desktop) + `checkup-cli.exe`, built by [analyzer/build.ps1](analyzer/build.ps1); the CLI exe completes a full scan |

Load the bundled sample case from the landing page to explore the report without running a scan.

The analyzer is tested end to end against a **synthetic NTFS volume image**
([tests/synthetic.py](analyzer/tests/synthetic.py)) built byte by byte with planted artifacts — real
boot sector, real `$MFT` with correct fixups, real `$Bitmap`. That covers geometry parsing, the
`$MFT` extent map, enumeration, path reconstruction, recovery assessment, hashing, and every
detector, with no volume or privileges needed.

It was then run against a **real 57 GB NTFS volume** with artifacts planted by
[stage_evidence.ps1](scripts/stage_evidence.ps1). Cluster geometry, `$MFT` offset and record size
matched `fsutil fsinfo ntfsinfo` exactly; 40 records parsed with zero errors; both planted deletions
were found, one recovered byte-for-byte from its MFT record. A single data run decoded to
1280 clusters × 4096 = 5,242,880 bytes — exactly the file size, which is a direct check on the
signed-delta run decoding.

Three bugs surfaced only on real hardware, none in the parsing layer: the staging script was
reclaiming its own deleted MFT records, it was not re-runnable because of the attributes it set, and
the detectors were burying real findings under NTFS metafiles under `$Extend`.

The synthetic image now also has a two-extent `$MFT` and a file reassembled from two extension
records through `$ATTRIBUTE_LIST`, plus a planted USN journal.

The scale case was then run on the same stick with
[verify_volume.ps1](scripts/verify_volume.ps1) `-BulkFiles 100000`: 100,159 MFT records parsed in
5.7 s (17,517 records/s, 98 physical `$MFT` reads), a file with 40 hard links reassembled through a
real `$ATTRIBUTE_LIST` with no errors, a junction and a symlink parsed cleanly, and 24 MB of USN
journal — 300,367 records, 100,196 operations — read including the planted cross-directory move.
All 19 checks passed with zero scan errors; the whole scan, hashing included, took 49 s.

## Architecture

```
checkup.exe  (Administrator, on the target machine)
   raw volume handle -> $Boot geometry -> $MFT records -> findings
        |
        v
   one JSON case file  (schemaVersion: 1)
        |
        v
web app  ->  caseLoader validates the version  ->  report
```

The schema is a versioned contract. There is no normalization or shape-guessing layer: a case file
either matches the version the app understands or it is rejected with a message saying why. See
[src/utils/caseLoader.ts](src/utils/caseLoader.ts).

## The analyzer

```
analyzer/
├── checkup.py            CLI entry point
├── checkup_gui.py        desktop entry point
├── build.ps1             builds both exes, prints the SHA-256 values
├── pytest.ini
├── forensica/
│   ├── volume.py         raw \\.\X: access, sector-aligned reads
│   ├── boot.py           $Boot / BPB — cluster geometry, $MFT location
│   ├── mft.py            fixups, records, attributes, data runs
│   ├── bitmap.py         $Bitmap — is a deleted file's space reused?
│   ├── entries.py        the intermediate file model
│   ├── findings.py       detectors
│   ├── usn.py            $UsnJrnl:$J — rename, move and delete history
│   ├── filetime.py       FILETIME conversion, whole-second detection
│   ├── progress.py       progress reporting + cancellation
│   ├── volumes.py        volume enumeration and elevation, via ctypes
│   ├── gui.py            tkinter desktop interface
│   └── analyze.py        orchestration + case file assembly
└── tests/                parsing, end-to-end, GUI
```

### Two binaries

`build.ps1` produces both:

| Artifact | Purpose |
|---|---|
| `checkup.exe` | Desktop application — volume picker, live progress, cancellable |
| `checkup-cli.exe` | Console version for scripting |

One binary cannot serve both: a windowed build has no console for CLI output,
and a console build flashes a black window when the GUI opens.

The interface is **tkinter**, chosen so the analyzer keeps its property of
having no third-party runtime dependencies. Qt would look better untouched and
cost roughly forty times the bundle size; as it is, the GUI build is ~10 MB
against the CLI's ~7 MB, and the difference is Tcl/Tk.

The scan runs on a worker thread and posts to a queue that the UI thread drains
on a timer — tkinter is not thread-safe, so no widget is ever touched from the
worker. `run_scan` takes an optional progress callback and cancel check, which
is how the bar moves and how **Cancel** interrupts a long scan without leaving a
partial case file behind. Record-level updates are throttled; emitting one per
MFT record would swamp the queue and make the scan slower than the work it is
reporting on.

No third-party runtime dependencies — every structure is parsed with the standard library, so the
path from sector to finding is readable end to end.

Requires Python 3.11+. Install from python.org; the Microsoft Store stub will not do.

Set up the virtual environment once:

```bash
cd analyzer && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt
```

Then run the tests (125 of them, about a second, no volume or privileges needed):

```bash
cd analyzer && .venv/Scripts/python.exe -m pytest -q
```

Launch the desktop interface from source:

```bash
cd analyzer && .venv/Scripts/pythonw.exe checkup_gui.py
```

Scanning a drive letter needs an elevated prompt, because opening a raw volume handle is privileged.
A disk image can be read unprivileged, which is the easier way to iterate:

```bash
python analyzer/checkup.py E: -o case.json
```

Useful flags: `--full` emits every parsed record instead of the triaged subset, `--max-records`
stops early on a large volume, `--no-hash` skips content hashing, `--hash-limit` caps how large a
stream will be read for hashing, `--usn-limit` caps how much of the USN journal is read (newest
first, default 64 MiB), and `--no-usn` skips the journal.

### Implementation notes

Four details are where a naive MFT parser goes wrong, and each has a test:

- **Fixups.** NTFS overwrites the last two bytes of every sector in a record with an update sequence
  number and stashes the originals in a header array. Skip the fixup pass and you silently read two
  corrupt bytes per sector — wrong timestamps, wrong sizes, no error.
- **Signed run offsets.** A data run's offset is a *signed delta* from the previous run's LCN. Read
  it unsigned and reads land in the wrong place on any fragmented file.
- **The `$MFT` extent map.** Record 0 describes `$MFT` itself. Using its run list, rather than
  assuming the table is contiguous, is what makes the parser work on a real fragmented volume.

- **`$ATTRIBUTE_LIST`.** A file with more attributes than fit in one record — many hard links, a
  heavily fragmented stream — keeps the rest in extension records. The reader follows the list,
  refuses an extension record that no longer points back to its base (a reused slot), and joins
  split `$DATA` segments in VCN order. Unfollowed, such a file loses its name and is silently
  dropped.

`$MFT` reads go through a 1 MiB chunk cache, so a sequential scan costs one physical read per 1024
records; the scan log reports records/s and the read count.

### The USN journal

`$Extend\$UsnJrnl:$J` is the kernel's log of every create, delete, rename and move. The analyzer
reads its allocated tail (the stream is mostly sparse — released history), parses V2 and V3
records, and emits one timeline row per CLOSE record, pairing each rename with the name it
replaced. Rows link to findings on the same file, and a timestomp finding cites the journal's
`BASIC_INFO_CHANGE` — the kernel's record of when `SetFileTime` actually ran. Removable media often
has no journal; [stage_evidence.ps1](scripts/stage_evidence.ps1) creates one.

## Analyzer scope

The analyzer covers the NTFS story end to end, and deliberately nothing else:

- **Raw volume access** — opens `\\.\X:` directly, bypassing the Windows file APIs and the locks
  they impose on `$MFT`, registry hives and event logs
- **`$MFT` enumeration** — every record, including unallocated ones that still hold a parseable file
- **Deleted file recovery** — files under roughly 700 bytes are stored *resident* inside their MFT
  record, so deletion leaves the content byte-for-byte intact. Larger files are best-effort: the
  data runs may since have been reallocated, and the report says which case applies
- **Timestomp detection** — `$STANDARD_INFORMATION` timestamps are writable from user mode;
  `$FILE_NAME` timestamps are only written by the kernel on create, rename and move. `$SI` preceding
  `$FN` cannot happen through normal activity. Zeroed sub-second precision is a second tell
- **Alternate Data Stream detection** — named `$DATA` attributes, invisible to Explorer and `dir`
- **USN journal reconstruction** — rename, move and delete history from `$Extend\$UsnJrnl:$J`

Explicitly out of scope: `$LogFile` parsing, NSRL hash triage, YARA scanning, code signing, and
the Prefetch / registry / shellbag / EVTX artifact set.

Every finding carries the raw values it was derived from, and the detector that fired, so a
conclusion can be audited rather than taken on trust.

## Development

```bash
npm install
```

```bash
npm run dev
```

Other scripts:

| Script | Purpose |
|---|---|
| `npm run sample` | Regenerate `public/samples/sample-case.json` |
| `npm run schema` | Regenerate `schema/case.schema.json` from `src/types/case.ts` |
| `npm run typecheck` | `tsc` across app and node configs |
| `npm run lint` | ESLint |
| `npm test` | Vitest: utilities, loader, report export, and the analyzer contract test |
| `npm run build` | Production build to `dist/` |

The contract test ([tests/contract.test.ts](tests/contract.test.ts)) validates the bundled sample
and the analyzer's real output on the synthetic image against the generated schema, with unknown
fields disallowed, and fails if the schema is stale. It needs Python on `PATH` (or `PYTHON` set);
without it the analyzer half is skipped locally and fails in CI.

### The sample case

[scripts/make-sample-case.mjs](scripts/make-sample-case.mjs) generates a schema-v1 case file
describing a small NTFS test volume with planted artifacts: a timestomped binary, a file carrying a
hidden ADS, a deleted resident file that recovers perfectly, a deleted non-resident file that only
recovers partially, and an orphaned record whose parent directory is gone.

It serves two purposes — it lets the UI be developed and demoed before the analyzer exists, and it
is the reference output the analyzer must reproduce.

### Testing the analyzer against a real volume

Don't scan `C:`. Format a USB stick as NTFS (or create and attach a VHD with `diskpart`), then,
from an elevated PowerShell:

```powershell
.\scripts\verify_volume.ps1 -Drive E:                     # stage, scan, check
.\scripts\verify_volume.ps1 -Drive E: -BulkFiles 100000   # plus the scale load
```

It creates the USN journal, plants the artifacts, scans, and checks geometry against `fsutil` and
every planted artifact, printing PASS/FAIL lines. With `-BulkFiles` it first adds that many files,
a file with 40 hard links (which forces a real `$ATTRIBUTE_LIST`), a junction and a symlink.

To plant artifacts by hand instead:

```powershell
(Get-Item .\report.docx).CreationTime = '2019-03-12 08:00:00'
```

```powershell
Set-Content -Path .\notes.txt -Stream payload -Value 'hidden'
```

A small volume also keeps the MFT small, which keeps the case file small.

## Project structure

```
src/
├── components/
│   ├── shell/AppShell   fixed rail + top bar, the persistent chrome
│   ├── ui/primitives    Panel, SeverityMark, Field, Segmented, Notice
│   ├── common/          FileUpload
│   └── results/         CaseList, Overview, Findings,
│                        Timeline, Records, RecoveredContent, Stats
├── context/             AppContext (cases), ThemeContext, hooks
├── pages/               LandingPage (workspace), ResultsPage, AboutPage (method)
├── types/
│   ├── case.ts          versioned wire contract (shared with the analyzer)
│   └── app.ts           UI-only types
└── utils/
    ├── caseLoader.ts    parse + version + structure validation
    ├── caseStore.ts     IndexedDB persistence
    ├── report.ts        HTML report and findings CSV export
    ├── bytes.ts         recovered content: text detection, hex dump, download
    └── formatters.ts    UTC formatting, severity styling
schema/case.schema.json  generated from case.ts; the analyzer is validated against it
tests/contract.test.ts
scripts/
├── make-sample-case.mjs
├── stage_evidence.ps1
├── verify_volume.ps1    stage + scan + check a real test volume
└── verify_case.py
```

Cases are kept in IndexedDB in the browser profile, so a large `--full` case persists across
reloads. Nothing is uploaded.

### Interface conventions

The UI is built as an instrument rather than a landing page, and a few rules hold throughout:

- **Colour means severity.** The interface is carried by a neutral ink scale; a coloured pixel
  anywhere else would dilute the only signal that matters. Severity is a 2px bar, not a filled pill —
  five colours of pill turn a findings list into confetti.
- **Monospace for forensic data.** Paths, hashes, record numbers and timestamps are always
  monospaced with tabular figures, so columns align and values are comparable down a list.
- **Dark is the base theme.** Light mode is the override, applied by a `light` class on `<html>` and
  a custom `light:` Tailwind variant — so unprefixed classes read as the intended theme.
- **Hairline borders, no shadows.** Elevation is a surface value, the way native tooling does it.
- **Timestamps are UTC, always, with the zone stated.** Local-time rendering is a real hazard in
  casework: a reader in a different zone than the examiner will draw wrong conclusions about event
  ordering.

## Distribution

The analyzer ships via **GitHub Releases**, not from `public/`. A PyInstaller binary gets rebuilt
constantly during development; committing it would add a copy to git history every iteration.

Build it with [analyzer/build.ps1](analyzer/build.ps1), which runs the tests first and prints the
SHA-256 to publish alongside the release. Current build: **10.2 MB** (`checkup.exe`, which bundles
Tcl/Tk) and **7.2 MB** (`checkup-cli.exe`).

### Smart App Control will block the unsigned exe

This is not hypothetical — it happened on the development machine. Windows 11 refused to run the
freshly built binary:

```
Program 'checkup.exe' failed to run: An Application Control policy has blocked this file
```

Smart App Control was **enforced**. It blocks executables that are unsigned and have no established
reputation, which describes every PyInstaller build. The binary was fine — complete bundle, correct
SHA-256, no Mark-of-the-Web — it simply is not allowed to start.

Check the state on any machine you plan to demo on:

```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState).VerifiedAndReputablePolicyState
```

`0` off, `1` enforced, `2` evaluation.

Options, best first:

1. **Run the Python script instead of the exe.** `python.exe` is signed by the Python Software
   Foundation, so Smart App Control permits it and the analyzer runs normally. For a demo this is
   arguably better anyway — the source is visible rather than sealed in a bundle.
2. **Demo on a machine where it is off.** It is off by default on upgraded (rather than clean-
   installed) Windows 11, and on most managed or domain-joined machines.
3. **Sign the binary.** An EV certificate with a hardware token earns SmartScreen reputation
   immediately. A few hundred USD per year — real distribution, not a class demo.

Do **not** simply switch Smart App Control off to make this go away: once disabled it cannot be
re-enabled without reinstalling Windows. That is a poor trade for running one binary you could run
as a script instead.

## Deployment

Pushes to `main` build and deploy to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). The workflow runs the analyzer tests
on Windows, then typechecks, lints and runs the web tests (including the contract test), builds
with `VITE_BASE_URL=/ForensicaLite/`, and copies `index.html` to `404.html` — GitHub Pages has no
rewrite rules, so without that fallback a direct hit on `/results` would 404. A failure at any step
blocks the deploy.

## Legal

ForensicaLite is for legitimate forensic analysis, security assessment, and education. Ensure you
have authority over any system before analysing it. Unauthorised access to computer systems may
violate local and national law. The authors are not responsible for misuse.

Findings are integrity-hashed, which supports verification that a collected artifact has not
changed. That is not the same as legal chain of custody, and this tool should not be described as
providing it.
