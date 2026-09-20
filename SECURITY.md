# Security policy

Only the latest release receives security fixes.

## Report a vulnerability

Use [GitHub Security Advisories](https://github.com/deeno13/tokentray/security/advisories/new). Do not open a public issue.

Include the affected version, Windows build, provider adapter, and reproduction steps. An initial response is expected within a week.

## Credential guarantees

TokenTray reads existing provider sessions and contacts providers directly. It has no login flow, backend, telemetry, or key upload.

Credentials stay in Rust. They are never logged, written to TokenTray files, or passed to the WebView. Preferences and quota snapshots under `%APPDATA%\TokenTray` contain no credentials, prompts, or answers.

Report any violation of these guarantees, unexpected network destination, or write to a provider credential store.

## Release integrity

Releases are built from tagged commits and include `SHA256SUMS.txt`:

```powershell
Get-FileHash .\tokentray-v0.1.0-windows-x64.exe -Algorithm SHA256
```

Builds are unsigned. Treat binaries from outside the repository's [Releases](https://github.com/deeno13/tokentray/releases) page as untrusted.
