<#
.SYNOPSIS
    Plants known forensic artifacts on an NTFS test volume.

.DESCRIPTION
    Creates a controlled ground truth so analyzer output can be checked against
    what is actually there, rather than eyeballed. Every artifact here maps to
    one detector:

      Docs\quarterly-report.docx    control - should raise nothing
      Tools\svchost.exe             timestomp: $SI backdated, sub-second zeroed
                                    hidden-system-file: HIDDEN + SYSTEM set
      Docs\notes.txt:payload        alternate-data-stream
      Docs\handover-credentials.txt deleted-recoverable, confidence "full"
                                    (resident: content lives in the MFT record)
      Media\screen-capture.mp4      deleted-recoverable, non-resident
      Tools\install.log             impossible-timestamp (predates the volume)

    Refuses to run against the system drive. Use a USB stick formatted NTFS, or
    a VHD created with diskpart.

.PARAMETER Drive
    Target drive, e.g. "E:".

.PARAMETER Force
    Skip the confirmation prompt.

.EXAMPLE
    .\stage_evidence.ps1 -Drive E:
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Drive,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# --- Safety -----------------------------------------------------------------

$letter = $Drive.TrimEnd('\').TrimEnd(':')
if ($letter.Length -ne 1) {
    throw "Drive must be a single letter, e.g. 'E:' (got '$Drive')."
}
$root = "${letter}:\"

$systemDrive = $env:SystemDrive.TrimEnd(':')
if ($letter -ieq $systemDrive) {
    throw "Refusing to stage evidence on the system drive ($env:SystemDrive). Use a test volume."
}

if (-not (Test-Path $root)) {
    throw "Drive $root is not available."
}

$volume = Get-Volume -DriveLetter $letter
if ($volume.FileSystem -ne 'NTFS') {
    throw "Drive $root is $($volume.FileSystem), not NTFS. Reformat it as NTFS first."
}

Write-Host ''
Write-Host "  Target      $root" -ForegroundColor Cyan
Write-Host "  Label       $($volume.FileSystemLabel)"
Write-Host "  Size        $([math]::Round($volume.Size / 1GB, 2)) GB"
Write-Host ''
Write-Host '  This will create and delete files on that volume.' -ForegroundColor Yellow

if (-not $Force) {
    $answer = Read-Host '  Continue? (y/N)'
    if ($answer -ne 'y') {
        Write-Host '  Aborted.'
        return
    }
}

# --- Layout -----------------------------------------------------------------

$docs = Join-Path $root 'Docs'
$tools = Join-Path $root 'Tools'
$media = Join-Path $root 'Media'

foreach ($dir in @($docs, $tools, $media)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

# --- Reset any previous run -------------------------------------------------

# The script must be re-runnable. A previous run leaves svchost.exe with the
# HIDDEN and SYSTEM attributes set, and Copy-Item -Force cannot overwrite a
# hidden or system file — -Force clears read-only, not those — so a second run
# died with "Access to the path is denied".
#
# Only the exact paths this script creates are touched. Nothing else on the
# volume is modified.

$stagedPaths = @(
    (Join-Path $docs 'quarterly-report.docx'),
    (Join-Path $tools 'svchost.exe'),
    (Join-Path $docs 'notes.txt'),
    (Join-Path $docs 'handover-credentials.txt'),
    (Join-Path $media 'screen-capture.mp4'),
    (Join-Path $tools 'install.log')
)

$reset = 0
foreach ($staled in $stagedPaths) {
    if (Test-Path -LiteralPath $staled) {
        $existing = Get-Item -LiteralPath $staled -Force
        # Clear HIDDEN/SYSTEM/READONLY so the file can be replaced.
        $existing.Attributes = [System.IO.FileAttributes]::Normal
        Remove-Item -LiteralPath $staled -Force
        $reset++
    }
}

if ($reset -gt 0) {
    Write-Host ''
    Write-Host "[*] cleared $reset artifact(s) from a previous run" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '[*] planting artifacts' -ForegroundColor Cyan

# --- 1. Control file --------------------------------------------------------

$control = Join-Path $docs 'quarterly-report.docx'
$filler = [byte[]]::new(46129)
(New-Object Random 1208).NextBytes($filler)
[System.IO.File]::WriteAllBytes($control, $filler)
Write-Host '    control        Docs\quarterly-report.docx'

# --- 2. Timestomped + hidden system executable ------------------------------

# Copy a real PE so the file is a plausible executable rather than random bytes.
$stomped = Join-Path $tools 'svchost.exe'
Copy-Item -Path (Join-Path $env:SystemRoot 'System32\svchost.exe') -Destination $stomped -Force

# PowerShell's timestamp setters call SetFileTime, which writes $SI only -
# $FN keeps the real creation time. That divergence is the detection.
# Whole-second values also leave the 100ns remainder at zero.
$backdated = [datetime]::new(2019, 3, 12, 8, 0, 0, [DateTimeKind]::Utc)
$item = Get-Item $stomped -Force
$item.CreationTimeUtc = $backdated
$item.LastWriteTimeUtc = $backdated
$item.LastAccessTimeUtc = $backdated

Set-ItemProperty -Path $stomped -Name Attributes -Value 'Hidden, System, Archive'
Write-Host '    timestomp      Tools\svchost.exe            ($SI -> 2019-03-12, $FN unchanged)'
Write-Host '    hidden+system  Tools\svchost.exe'

# --- 3. Alternate Data Stream -----------------------------------------------

$carrier = Join-Path $docs 'notes.txt'
Set-Content -Path $carrier -Value 'Meeting notes. Nothing unusual here.' -Encoding UTF8
$payload = 'A' * 2048
Set-Content -Path $carrier -Stream 'payload' -Value $payload -Encoding UTF8
Write-Host '    hidden stream  Docs\notes.txt:payload       (2048 bytes)'

# --- 4. Files that will be deleted, created now -----------------------------

# IMPORTANT: nothing may be created after the deletions below.
#
# NTFS reuses the lowest-numbered free MFT record. An earlier version of this
# script deleted each file and then created the next one, so every freed record
# was immediately reclaimed and the scan found zero deleted records — the script
# destroyed the exact evidence it exists to plant. All creation happens here;
# deletion happens last.

# Well under the ~700 byte resident threshold, so the content lives inside the
# MFT record and survives deletion byte-for-byte.
$resident = Join-Path $docs 'handover-credentials.txt'
$lines = @(
    '# Handover notes - delete before leaving',
    'jump host: 10.14.22.8',
    'service account: svc_backup',
    'shared vault path: \\fileserver\ops\vault',
    'rotation due: 2026-08-01'
)
Set-Content -Path $resident -Value $lines -Encoding UTF8
$residentSize = (Get-Item $resident).Length

$nonResident = Join-Path $media 'screen-capture.mp4'
$blob = [byte[]]::new(5MB)
(New-Object Random 77).NextBytes($blob)
[System.IO.File]::WriteAllBytes($nonResident, $blob)

# --- 5. Impossible timestamp ------------------------------------------------

$ancient = Join-Path $tools 'install.log'
Set-Content -Path $ancient -Value 'Setup completed successfully.' -Encoding UTF8
$ancientTime = [datetime]::new(1998, 11, 4, 2, 15, 0, [DateTimeKind]::Utc)
$item = Get-Item $ancient -Force
$item.CreationTimeUtc = $ancientTime
$item.LastWriteTimeUtc = $ancientTime
# Zero the access time too, so the sub-second detector fires consistently.
$item.LastAccessTimeUtc = $ancientTime
Write-Host '    impossible ts  Tools\install.log            (created 1998, before the volume)'

# --- 6. Deletions, last, so the freed records stay unallocated ---------------

Remove-Item -Path $resident -Force
Write-Host "    deleted (res)  Docs\handover-credentials.txt ($residentSize bytes, expect full recovery)"

Remove-Item -Path $nonResident -Force
Write-Host '    deleted (non)  Media\screen-capture.mp4     (5 MB, expect partial recovery)'

# --- Summary ----------------------------------------------------------------

Write-Host ''
Write-Host '[*] staged. Expected findings:' -ForegroundColor Green
Write-Host '      timestomp                2  (si-fn-created-mismatch, si-subsecond-zeroed)'
Write-Host '      alternate-data-stream    1'
Write-Host '      deleted-recoverable      2  (one full, one partial)'
Write-Host '      hidden-system-file       1'
Write-Host '      impossible-timestamp     1'
Write-Host ''
Write-Host '    Now run, from an elevated prompt:' -ForegroundColor Cyan
Write-Host "      python analyzer\checkup.py ${letter}: -o case.json"
Write-Host ''
Write-Host '    Flushing the volume so the changes are on disk...'
Write-Host ''

# Deleted files only leave recoverable records once the metadata is committed.
try {
    Write-VolumeCache -DriveLetter $letter -ErrorAction Stop
    Write-Host '    Volume cache flushed.' -ForegroundColor Green
} catch {
    Write-Host "    Could not flush automatically: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '    Safely eject and reattach the volume before scanning.' -ForegroundColor Yellow
}
