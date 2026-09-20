# Security policy

## Supported versions

TokenTray is an early development build. Only the latest release receives fixes.

## Reporting a vulnerability

Report security issues privately through [GitHub security advisories](https://github.com/deeno13/tokentray/security/advisories/new). Please do not open a public issue for a vulnerability.

Include the affected version, your Windows build, the provider adapter involved if any, and the steps needed to reproduce the problem. Expect an initial response within a week.

## What TokenTray does with credentials

TokenTray reads existing provider sessions that other tools already store on your machine, and contacts those providers directly to read usage. It adds no login flow, no backend service, no telemetry and no key upload.

Credentials are handled only in the Rust process. They are never logged, never written to TokenTray's own files, and never passed to the WebView frontend. Preferences live in `config.json` and quota snapshots are cached under `%APPDATA%\TokenTray`; neither contains credentials, prompts or answers.

Anything that breaks those guarantees is a security bug worth reporting: a credential reaching the frontend, a log line or cache file, an unexpected network destination, or a code path that writes to a provider's own credential store.

## Release integrity

Release executables are built by the `Release` GitHub Actions workflow from a tagged commit and published with a `SHA256SUMS.txt`. Verify a download before running it:

```powershell
Get-FileHash .\tokentray-v0.1.0-windows-x64.exe -Algorithm SHA256
```

Builds are **not** code signed, so Windows SmartScreen warns on first run. Treat any TokenTray binary obtained outside this repository's Releases page as untrusted.
