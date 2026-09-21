<#
.SYNOPSIS
    Installs TokenTray for the current user.

.DESCRIPTION
    Downloads a pinned TokenTray release from GitHub, verifies its SHA-256
    against the SHA256SUMS.txt published with that same release, and runs the
    installer silently. Installs to %LOCALAPPDATA%\TokenTray for the current
    user only; no administrator rights are required.

    The installer registers TokenTray in Apps & Features, so it can also be
    removed from Windows Settings. It installs the Microsoft Edge WebView2
    Runtime if that is missing.

    This script does NOT enable "Start with Windows". TokenTray manages that
    setting itself from its tray menu; a second mechanism here would fight it.

.PARAMETER Version
    Release tag to install, for example v0.1.0. Defaults to the latest release.
    When this script is piped to iex, param() cannot be bound -- set the
    environment variable TOKENTRAY_VERSION instead.

.EXAMPLE
    irm https://raw.githubusercontent.com/deeno13/tokentray/main/install.ps1 | iex

.EXAMPLE
    # Inspect before running (recommended)
    irm https://raw.githubusercontent.com/deeno13/tokentray/main/install.ps1 -OutFile install.ps1
    notepad install.ps1
    powershell -ExecutionPolicy Bypass -File .\install.ps1
#>
param(
    [string] $Version = $env:TOKENTRAY_VERSION
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo    = 'deeno13/tokentray'
$headers = @{ 'User-Agent' = 'tokentray-install' }
$work    = Join-Path ([IO.Path]::GetTempPath()) ("tokentray-" + [Guid]::NewGuid().ToString('N'))

try {
    New-Item -ItemType Directory -Path $work -Force | Out-Null

    # 1. Resolve the version once, then pin it. Never build a "latest/download"
    #    URL: the release could move between the checksum fetch and the binary
    #    fetch, and the hash we verified would no longer describe what we got.
    if ([string]::IsNullOrWhiteSpace($Version)) {
        Write-Host 'Resolving the latest release...'
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
        $Version = $rel.tag_name
    }
    if ($Version -notmatch '^v\d+\.\d+\.\d+$') {
        throw "Unexpected version '$Version'. Expected a tag like v0.1.0."
    }

    $asset    = "tokentray-$Version-windows-x64-setup.exe"
    $base     = "https://github.com/$repo/releases/download/$Version"
    $tmpSetup = Join-Path $work $asset
    $tmpSums  = Join-Path $work 'SHA256SUMS.txt'

    Write-Host "Downloading TokenTray $Version..."
    Invoke-WebRequest -Uri "$base/$asset"         -OutFile $tmpSetup -Headers $headers -UseBasicParsing
    Invoke-WebRequest -Uri "$base/SHA256SUMS.txt" -OutFile $tmpSums  -Headers $headers -UseBasicParsing

    # 2. Verify the checksum. This is mandatory and has no override flag.
    #    SHA256SUMS.txt is sha256sum format: "<hex>  <filename>".
    $expected = $null
    foreach ($line in Get-Content -LiteralPath $tmpSums) {
        $parts = $line -split '\s+', 2
        if ($parts.Count -eq 2 -and $parts[1].Trim() -eq $asset) { $expected = $parts[0].Trim() }
    }
    if (-not $expected) { throw "SHA256SUMS.txt has no entry for $asset." }

    $actual = (Get-FileHash -LiteralPath $tmpSetup -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpperInvariant()) {
        throw "Checksum mismatch for $asset.`n  expected $expected`n  actual   $actual`nRefusing to install."
    }
    Write-Host "Checksum verified: $actual"

    # 3. Stop a running instance so the installer can replace the binary.
    $running = Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host 'Stopping the running TokenTray instance...'
        $running | Stop-Process -Force -ErrorAction SilentlyContinue
        $deadline = [DateTime]::UtcNow.AddSeconds(15)
        while ((Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue) -and ([DateTime]::UtcNow -lt $deadline)) {
            Start-Sleep -Milliseconds 250
        }
        if (Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue) {
            throw 'TokenTray is still running. Quit it from the tray menu and re-run this installer.'
        }
    }

    # 4. Run the installer silently. /S is NSIS silent mode. The installer
    #    creates the Start Menu shortcut, registers the uninstaller in Apps &
    #    Features, and installs WebView2 if it is missing.
    Write-Host 'Running the installer...'
    $proc = Start-Process -FilePath $tmpSetup -ArgumentList '/S' -PassThru -Wait
    if ($proc.ExitCode -ne 0) {
        throw "The installer exited with code $($proc.ExitCode)."
    }

    Write-Host ''
    Write-Host "TokenTray $Version installed to $env:LOCALAPPDATA\TokenTray"
    Write-Host 'Listed in Apps & Features as "TokenTray".'
    Write-Host ''
    Write-Host 'Enable "Start with Windows" from the TokenTray tray menu; this installer deliberately does not set it.'
    Write-Host "Settings live in $env:APPDATA\TokenTray and survive an uninstall."
}
finally {
    if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
