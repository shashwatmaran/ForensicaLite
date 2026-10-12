<#
.SYNOPSIS
    Stages a test volume, scans it, and checks the case file against ground truth.

.DESCRIPTION
    The end-to-end check on real hardware. In order:

      1. Optionally bulk-loads the volume: N small files, a file with 40 hard
         links (more $FILE_NAME attributes than fit in one MFT record, which
         forces NTFS to create a real $ATTRIBUTE_LIST), a junction and a
         symbolic link (reparse points).
      2. Runs stage_evidence.ps1, which creates the USN journal and plants the
         known artifacts.
      3. Scans the volume with the analyzer from source.
      4. Checks geometry against fsutil and every planted artifact, printing
         PASS/FAIL lines.

    Needs an elevated prompt. Refuses the system drive.

.PARAMETER Drive
    Target drive, e.g. "E:".

.PARAMETER BulkFiles
    Number of bulk files to create first. 0 skips the scale load. 100000 takes
    several minutes on a USB stick.

.EXAMPLE
    .\verify_volume.ps1 -Drive E:

.EXAMPLE
    .\verify_volume.ps1 -Drive E: -BulkFiles 100000
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Drive,

    [int]$BulkFiles = 0
)

$ErrorActionPreference = 'Stop'

$letter = $Drive.TrimEnd('\').TrimEnd(':')
if ($letter.Length -ne 1) { throw "Drive must be a single letter, e.g. 'E:' (got '$Drive')." }
if ($letter -ieq $env:SystemDrive.TrimEnd(':')) { throw 'Refusing to run against the system drive.' }

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell: the scan opens a raw volume handle.'
}

$repo = Split-Path -Parent $PSScriptRoot
$root = "${letter}:\"
$venvPython = Join-Path $repo 'analyzer\.venv\Scripts\python.exe'
$python = if (Test-Path $venvPython) { $venvPython } else { (Get-Command python).Source }

# --- 1. Scale load ------------------------------------------------------------

if ($BulkFiles -gt 0) {
    Write-Host "[*] bulk-loading $BulkFiles files" -ForegroundColor Cyan
    $bulk = Join-Path $root 'Bulk'
    New-Item -ItemType Directory -Force -Path $bulk | Out-Null

    $small = [Text.Encoding]::UTF8.GetBytes('x' * 200)      # resident
    $large = [byte[]]::new(8192)                            # non-resident
    $timer = [Diagnostics.Stopwatch]::StartNew()
    for ($i = 0; $i -lt $BulkFiles; $i++) {
        # [math]::Floor returns a double, which the integer format d4 rejects.
        $dir = Join-Path $bulk ('{0:d4}' -f [int][math]::Floor($i / 1000))
        if ($i % 1000 -eq 0) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        $bytes = if ($i % 2) { $large } else { $small }
        [IO.File]::WriteAllBytes((Join-Path $dir "f$i.bin"), $bytes)
        if ($i % 10000 -eq 0 -and $i) { Write-Host "    $i files ($([int]$timer.Elapsed.TotalSeconds)s)" }
    }

    # 40 hard links: their $FILE_NAME attributes overflow one 1 KiB record, so
    # NTFS moves them to extension records listed in $ATTRIBUTE_LIST. The ADS
    # makes the default (triaged) scan emit the file so it can be checked.
    $links = Join-Path $root 'Links'
    if (Test-Path $links) { Remove-Item -Recurse -Force $links }
    New-Item -ItemType Directory -Path $links | Out-Null
    $target = Join-Path $links 'many-links.txt'
    Set-Content -Path $target -Value 'one file, many names' -Encoding UTF8
    Set-Content -Path $target -Stream 'tag' -Value 'scale-test' -Encoding UTF8
    for ($i = 1; $i -le 40; $i++) {
        New-Item -ItemType HardLink -Path (Join-Path $links "alias-with-a-long-name-$i.txt") -Target $target | Out-Null
    }
    Write-Host '    40 hard links      Links\many-links.txt'

    $junction = Join-Path $root 'JunctionToDocs'
    if (-not (Test-Path $junction)) {
        New-Item -ItemType Directory -Force -Path (Join-Path $root 'Docs') | Out-Null
        New-Item -ItemType Junction -Path $junction -Target (Join-Path $root 'Docs') | Out-Null
    }
    $symlink = Join-Path $root 'symlink.txt'
    if (-not (Test-Path $symlink)) {
        New-Item -ItemType SymbolicLink -Path $symlink -Target $target | Out-Null
    }
    Write-Host '    reparse points     JunctionToDocs, symlink.txt'
}

# --- 2. Stage ground truth ----------------------------------------------------

& (Join-Path $PSScriptRoot 'stage_evidence.ps1') -Drive "${letter}:" -Force

# --- 3. Scan ------------------------------------------------------------------

$caseFile = Join-Path $env:TEMP "forensica-verify-$letter.json"
Write-Host ''
Write-Host "[*] scanning ${letter}: with $python" -ForegroundColor Cyan
& $python (Join-Path $repo 'analyzer\checkup.py') "${letter}:" -o $caseFile
if ($LASTEXITCODE -ne 0) { throw "checkup exited with $LASTEXITCODE" }

# --- 4. Check -----------------------------------------------------------------

$ntfs = (& fsutil fsinfo ntfsinfo "${letter}:") -join "`n"
function Get-NtfsValue([string]$name) {
    if ($ntfs -match "(?m)^$([regex]::Escape($name))\s*:\s*(\S+)") { return $Matches[1] }
    throw "fsutil output has no '$name'"
}
$cluster = Get-NtfsValue 'Bytes Per Cluster'
$mftLcn = Get-NtfsValue 'Mft Start Lcn'
$recordSize = Get-NtfsValue 'Bytes Per FileRecord Segment'

& $python (Join-Path $PSScriptRoot 'verify_case.py') $caseFile `
    --cluster $cluster --mft-lcn $mftLcn --record-size $recordSize --bulk $BulkFiles
$verdict = $LASTEXITCODE

Write-Host ''
Write-Host "Case file: $caseFile"
Write-Host 'Paste everything from "[*] scanning" down when reporting results.'
exit $verdict
