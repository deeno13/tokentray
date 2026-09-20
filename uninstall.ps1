<#
.SYNOPSIS
    Removes TokenTray for the current user.

.DESCRIPTION
    Runs the registered uninstaller when TokenTray was installed with the
    setup executable or install.ps1. Falls back to removing a portable copy
    under %LOCALAPPDATA%\TokenTray when no uninstaller is registered.

    You can also uninstall from Windows Settings -> Apps & Features. This
    script exists so the one-liner install has a symmetric one-liner removal.

    Preferences under %APPDATA%\TokenTray are kept unless -RemoveSettings is
    given.

.PARAMETER RemoveSettings
    Also delete %APPDATA%\TokenTray (preferences and cached quota snapshots).
    When this script is piped to iex, param() cannot be bound -- set the
    environment variable TOKENTRAY_REMOVE_SETTINGS to any value instead.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
#>
param(
    [switch] $RemoveSettings
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RemoveSettings -and -not [string]::IsNullOrWhiteSpace($env:TOKENTRAY_REMOVE_SETTINGS)) {
    $RemoveSettings = $true
}

$appDir      = Join-Path $env:LOCALAPPDATA 'TokenTray'
$settingsDir = Join-Path $env:APPDATA 'TokenTray'
$uninstKey   = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\TokenTray'
$runKey      = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'

# Stop the app first; neither the uninstaller nor a manual delete can remove a
# running binary.
$running = Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Stopping TokenTray...'
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ((Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue) -and ([DateTime]::UtcNow -lt $deadline)) {
        Start-Sleep -Milliseconds 250
    }
    if (Get-Process -Name 'tokentray' -ErrorAction SilentlyContinue) {
        throw 'TokenTray is still running. Quit it from the tray menu and re-run this script.'
    }
}

$entry = Get-ItemProperty -Path $uninstKey -ErrorAction SilentlyContinue
if ($entry -and $entry.PSObject.Properties.Name -contains 'UninstallString') {
    # Installed with the setup executable. Its uninstaller also clears the
    # "Start with Windows" entry and the Apps & Features registration.
    $exe = $entry.UninstallString.Trim('"')
    Write-Host 'Running the registered uninstaller...'
    $proc = Start-Process -FilePath $exe -ArgumentList '/S' -PassThru -Wait
    if ($proc.ExitCode -ne 0) {
        throw "The uninstaller exited with code $($proc.ExitCode)."
    }
    Write-Host 'TokenTray removed.'
} else {
    # Portable copy, or a Scoop install. Remove what we can see.
    Write-Host 'No registered uninstaller found; removing a portable installation.'
    $removed = @()
    $shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\TokenTray.lnk'
    if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force; $removed += $shortcut }
    if (Test-Path -LiteralPath $appDir)   { Remove-Item -LiteralPath $appDir -Recurse -Force; $removed += $appDir }

    # The application owns this value; a portable removal has to clear it or
    # Windows keeps launching a deleted executable at every sign-in.
    $run = Get-ItemProperty -Path $runKey -ErrorAction SilentlyContinue
    if ($run -and $run.PSObject.Properties.Name -contains 'TokenTray') {
        Remove-ItemProperty -Path $runKey -Name 'TokenTray'
        $removed += "$runKey\TokenTray"
    }

    if ($removed.Count -eq 0) {
        Write-Host 'Nothing to remove; TokenTray does not appear to be installed for this user.'
    } else {
        Write-Host 'Removed:'
        $removed | ForEach-Object { Write-Host "  $_" }
    }
}

if ($RemoveSettings) {
    if (Test-Path -LiteralPath $settingsDir) {
        Remove-Item -LiteralPath $settingsDir -Recurse -Force
        Write-Host "Removed $settingsDir"
    }
} else {
    Write-Host ''
    Write-Host "Preferences kept at $settingsDir (re-run with -RemoveSettings to delete them)."
}
