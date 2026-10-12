# checkup v2.0.0

Raw NTFS forensic analyzer. Parses `$MFT` directly from a volume opened for
sector-level access and writes a schema-v1 JSON case file for the
[ForensicaLite web app](https://shashwatmaran.github.io/ForensicaLite/).

## Two downloads

| File | What it is |
|---|---|
| **`checkup.exe`** | Desktop application. Double-click it. Volume picker, options, live progress, cancellable. |
| **`checkup-cli.exe`** | Console version for scripting. Same engine, argparse interface. |

Both come from the same codebase; a single binary cannot be both, because a
windowed build has no console for CLI output and a console build flashes a
black window when the GUI opens.

## Verify the download

```
checkup.exe      10,661,786 bytes
  sha256         55f79ff52ff20ab306628a8297cef6a5ac9bb14de4ad465e36ef35ccd910ac5f

checkup-cli.exe   7,521,590 bytes
  sha256         8b144191529076319a41aed182c7c3c7ecbe720c73a76ff286e404cb6e5be4e9

Built            Python 3.13.15, PyInstaller 6.22.3
```

```powershell
(Get-FileHash -Algorithm SHA256 .\checkup.exe).Hash
```

The GUI is larger because it bundles Tcl/Tk. It is still standard library only —
the analyzer has no third-party runtime dependencies.

## Using the desktop application

1. Launch `checkup.exe`. If you are not elevated it says so and offers to
   restart with a UAC prompt — scanning a drive letter needs a raw volume
   handle, which is privileged.
2. Pick a volume from the list, or browse for a disk image. Only NTFS volumes
   are offered; the system drive is labelled as such.
3. Choose where to write the case file, and optionally cap the record count for
   a quick look at a large volume.
4. Start the scan. Progress shows the current stage and records parsed, and
   **Cancel** stops it cleanly without writing a partial file.
5. When it finishes the summary appears in the log, and **Show case file**
   opens the folder.

## Read this before running the exe

**Windows Smart App Control will block this binary.** It is unsigned and has no
established reputation, which is exactly what Smart App Control exists to stop.
On a machine where it is enforced you will get:

```
Program 'checkup.exe' failed to run: An Application Control policy has blocked this file
```

Check the state on your machine:

```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState).VerifiedAndReputablePolicyState
```

`0` off · `1` enforced · `2` evaluation

If it is enforced, **run from source instead** — `python.exe` is signed by the
Python Software Foundation, so it is permitted:

```powershell
git clone https://github.com/shashwatmaran/ForensicaLite
cd ForensicaLite/analyzer
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe checkup.py E: -o case.json
```

Do **not** disable Smart App Control to work around this. Once disabled it
cannot be re-enabled without reinstalling Windows.

## Usage

Scanning a drive letter needs an elevated prompt — opening a raw volume handle
is privileged. A disk image can be read unprivileged.

```powershell
checkup.exe E: -o case.json          # scan drive E:
checkup.exe disk.img -o case.json    # scan an image, no admin needed
checkup.exe E: --full                # emit every record, not the triaged subset
checkup.exe E: --max-records 50000   # stop early on a large volume
checkup.exe E: --usn-limit 268435456 # read up to 256 MiB of the USN journal
checkup.exe E: --no-usn              # skip the journal
```

Upload the resulting JSON at the web app. Nothing is transmitted — it is a
static site with no backend.

## What it detects

| Detector | Mechanism |
|---|---|
| `si-fn-created-mismatch`, `si-fn-modified-mismatch` | `$STANDARD_INFORMATION` is writable from user mode; `$FILE_NAME` is kernel-only. `$SI` earlier than `$FN` cannot occur normally. Cites the USN journal's `BASIC_INFO_CHANGE` when present. |
| `si-subsecond-zeroed` | NTFS counts in 100ns intervals. Whole-second values across every field suggest a timestomping tool. |
| `si-before-volume-creation` | A file cannot predate the filesystem containing it. |
| `si-timestamp-in-future` | `$SI` created or modified later than the scan itself. |
| `named-data-stream-present` | Alternate Data Streams — invisible to Explorer and `dir`. |
| `deleted-resident-content` | Files under ~700 bytes live inside the MFT record; deletion leaves them byte-for-byte intact. |
| `deleted-nonresident-runs` | Recoverability graded against `$Bitmap` cluster reuse. |
| `parent-sequence-mismatch` | Orphaned records whose parent directory has been reused. |
| `hidden-system-outside-system-path` | HIDDEN+SYSTEM outside a Windows system directory. |

## What's new since the first pre-release

- **USN change journal.** Rename, move and delete history from `$Extend\$UsnJrnl:$J` joins the
  timeline, one row per operation, linked to the findings on the same file. Timestomp findings
  cite the kernel's `BASIC_INFO_CHANGE` record.
- **`$ATTRIBUTE_LIST` is followed.** Files whose attributes overflow into extension records — many
  hard links, heavy fragmentation — are reassembled instead of dropped.
- **Buffered `$MFT` reads.** One physical read per 1024 records instead of one per record.
- Extension records no longer inflate the deleted-record count.

## Known gaps

- Only the newest 64 MiB of the USN journal is read by default (`--usn-limit`); removable media
  often has no journal at all
- A file with several hard links is reported under one name
- No `$LogFile`, Prefetch, registry, Shellbags or event log parsing
- No known-good hash suppression
- Unsigned — see Smart App Control above

## Status

Tested against a synthetic NTFS image (125 tests, including a full scan driven
through the desktop interface, a two-extent `$MFT`, a file reassembled through
`$ATTRIBUTE_LIST`, and a planted USN journal) and verified on a real 57 GB NTFS
volume: geometry cross-checked against `fsutil`, fixups clean, both planted
deletions recovered — one byte-for-byte from its MFT record.

What has and has not been proven about the **packaged binaries**:

- `checkup-cli.exe` completes a full scan of the synthetic image, unprivileged,
  with output identical in shape to a scan from source.
- `checkup.exe` starts and stays running; its scan path is the same engine,
  exercised end to end by the GUI tests from source.

Verified at scale on a real 57 GB NTFS stick with `scripts/verify_volume.ps1
-BulkFiles 100000`: 100,159 records parsed in 5.7 s (17,517 records/s, 98
physical `$MFT` reads), a real `$ATTRIBUTE_LIST` from 40 hard links reassembled
without error, reparse points parsed, 300,367 USN records read, and all 19
ground-truth checks passed with zero scan errors.

## Authorised use only

Ensure you have authority over any system before examining it. The analyzer
requires Administrator and reads the volume at the sector level.
