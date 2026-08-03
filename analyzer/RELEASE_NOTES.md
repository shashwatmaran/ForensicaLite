# checkup v2.0.0-dev

Raw NTFS forensic analyzer. Parses `$MFT` directly from a volume opened for
sector-level access and writes a schema-v1 JSON case file for the
[ForensicaLite web app](https://shashwatmaran.github.io/ForensicaLite/).

## Verify the download

```
SHA-256  0d2aaff82d98253168fc245880d28e396b0f3fe8ff2e5443156e139a87134757
Size     7.1 MB (7,454,932 bytes)
Built    from commit 6330a07, Python 3.12.10, PyInstaller 6.21.0
```

```powershell
(Get-FileHash -Algorithm SHA256 .\checkup.exe).Hash
```

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

Tested against a synthetic NTFS image (66 tests) and verified on a real 57 GB
NTFS volume: geometry cross-checked against `fsutil`, fixups clean, deleted
files recovered.

**The packaged exe itself has not been executed** — Smart App Control blocked it
on the build machine. The source it was built from is tested and verified; the
bundle is not. Treat this as a pre-release.

## Authorised use only

Ensure you have authority over any system before examining it. The analyzer
requires Administrator and reads the volume at the sector level.
