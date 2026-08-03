<#
.SYNOPSIS
    Builds checkup.exe with PyInstaller.

.DESCRIPTION
    Produces a single-file executable in dist/. The analyzer has no runtime
    dependencies beyond the standard library, so the bundle is only Python
    itself.

    Expect Defender or SmartScreen to flag the result: an unsigned binary that
    requires Administrator and opens raw disk handles matches a heuristic
    profile closely. Publish the printed SHA-256 alongside the release so it can
    be verified.

.EXAMPLE
    .\build.ps1
#>

[CmdletBinding()]
param(
    [string]$Name = 'checkup'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host '[*] checking toolchain' -ForegroundColor Cyan

# Prefer the project virtual environment, so the build uses the same
# interpreter and pinned tooling the tests ran against.
$venvPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

if (Test-Path $venvPython) {
    $python = $venvPython
    Write-Host "    using venv: $python"
} else {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $python) {
        throw @'
No interpreter found. Either create the project venv:
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -r requirements.txt
or put Python 3.11+ on PATH (install from python.org, not the Store stub).
'@
    }
    Write-Host "    using PATH: $python"
}

# Native executables are checked via $LASTEXITCODE, not $?. Windows PowerShell
# sets $? to false whenever a native command writes anything to stderr, and
# PyInstaller logs its progress there — so $? would report a clean build as a
# failure.
& $python -c "import sys; assert sys.version_info >= (3, 11), sys.version"
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 or newer is required.' }

Write-Host '[*] ensuring build dependencies' -ForegroundColor Cyan
& $python -m pip install --quiet --disable-pip-version-check -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'pip install failed.' }

Write-Host '[*] running tests' -ForegroundColor Cyan
& $python -m pytest -q
if ($LASTEXITCODE -ne 0) { throw 'tests failed; not building.' }

# Two artifacts from one codebase:
#   checkup.exe      windowed GUI - what a person double-clicks
#   checkup-cli.exe  console CLI  - what a script calls
# A single binary cannot be both: --windowed leaves no console for CLI output,
# and --console flashes a black window when the GUI launches.

Write-Host '[*] building GUI' -ForegroundColor Cyan
& $python -m PyInstaller `
    --onefile `
    --name $Name `
    --windowed `
    --clean `
    --noconfirm `
    --paths . `
    checkup_gui.py
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed building the GUI.' }

Write-Host '[*] building CLI' -ForegroundColor Cyan
& $python -m PyInstaller `
    --onefile `
    --name "$Name-cli" `
    --console `
    --noconfirm `
    --paths . `
    checkup.py
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed building the CLI.' }

Write-Host ''
foreach ($artifactName in @($Name, "$Name-cli")) {
    $artifact = Join-Path $PSScriptRoot "dist\$artifactName.exe"
    if (-not (Test-Path $artifact)) { throw "expected artifact not found: $artifact" }

    $hash = (Get-FileHash -Algorithm SHA256 -Path $artifact).Hash.ToLower()
    $bytes = (Get-Item $artifact).Length
    $size = [math]::Round($bytes / 1MB, 1)

    Write-Host "    $artifactName.exe" -ForegroundColor Green
    Write-Host "      size    $size MB ($bytes bytes)"
    Write-Host "      sha256  $hash"
}

Write-Host ''
Write-Host 'Attach both to a GitHub Release and publish the SHA-256 values with them.'

# An unsigned PyInstaller binary is exactly what Smart App Control exists to
# block, so warn at build time rather than letting it fail mysteriously later.
$sacPolicy = 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy'
$sac = (Get-ItemProperty -Path $sacPolicy -Name VerifiedAndReputablePolicyState -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState

if ($sac -eq 1) {
    Write-Host ''
    Write-Host 'WARNING: Smart App Control is ENFORCED on this machine.' -ForegroundColor Yellow
    Write-Host '  It will refuse to run this binary because it is unsigned and has no' -ForegroundColor Yellow
    Write-Host '  reputation. Run the script directly instead - python.exe is signed:' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '    .venv\Scripts\python.exe checkup.py E: -o case.json' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  Do not disable Smart App Control to work around this: it cannot be' -ForegroundColor Yellow
    Write-Host '  re-enabled without reinstalling Windows.' -ForegroundColor Yellow
}
