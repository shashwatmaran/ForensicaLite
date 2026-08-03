# checkup v2.0.0-dev

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
checkup.exe      10,592,683 bytes
  sha256         9e40a39b8948971122f1151ca311114d7b7c1eb2854c1afbcbdeadb3b3fc31ed

checkup-cli.exe   7,458,599 bytes
  sha256         d85c765a5f09f6ec456b42d8fc3b34e458d8e99dd5b7218131b2ed271bade469

Built            Python 3.12.10, PyInstaller 6.21.0
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
```

Upload the resulting JSON at the web app. Nothing is transmitted — it is a
static site with no backend.

## What it detects

| Detector | Mechanism |
|---|---|
| `si-fn-created-mismatch` | `$STANDARD_INFORMATION` is writable from user mode; `$FILE_NAME` is kernel-only. `$SI` earlier than `$FN` cannot occur normally. |
| `si-subsecond-zeroed` | NTFS counts in 100ns intervals. Whole-second values across every field suggest a timestomping tool. |
| `si-before-volume-creation` | A file cannot predate the filesystem containing it. |
| `named-data-stream-present` | Alternate Data Streams — invisible to Explorer and `dir`. |
| `deleted-resident-content` | Files under ~700 bytes live inside the MFT record; deletion leaves them byte-for-byte intact. |
| `deleted-nonresident-runs` | Recoverability graded against `$Bitmap` cluster reuse. |
| `parent-sequence-mismatch` | Orphaned records whose parent directory has been reused. |
| `hidden-system-outside-system-path` | HIDDEN+SYSTEM outside a Windows system directory. |

## Known gaps

- `$ATTRIBUTE_LIST` extension records are reported as a parse error but not followed
- No USN journal (`$Extend\$UsnJrnl:$J`), so rename/move history is absent
- No `$LogFile`, Prefetch, registry, Shellbags or event log parsing
- No known-good hash suppression
- Unbuffered reads — roughly one aligned read per record, slow across a full disk

## Status

Tested against a synthetic NTFS image (84 tests, including a full scan driven
through the desktop interface) and verified on a real 57 GB NTFS volume:
geometry cross-checked against `fsutil`, fixups clean, both planted deletions
recovered — one byte-for-byte from its MFT record.

What has and has not been proven about the **packaged binaries**:

- `checkup-cli.exe` starts and reaches its argument parser.
- `checkup.exe` starts and stays running.
- Neither has completed a full scan *as a packaged exe* — the engine behind them
  has, both from source and against a real volume.

Smart App Control blocks unsigned binaries on the build machine, which limited
what could be exercised there. Treat this as a pre-release.

## Authorised use only

Ensure you have authority over any system before examining it. The analyzer
requires Administrator and reads the volume at the sector level.
