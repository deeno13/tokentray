# Security policy

Only the latest release receives security fixes.

## Report a vulnerability

Use [GitHub Security Advisories](https://github.com/deeno13/tokentray/security/advisories/new). Do not open a public issue.

Include the affected version, Windows build, provider adapter, and reproduction steps. An initial response is expected within a week.

## Credential guarantees

TokenTray reads existing provider sessions and contacts providers directly. It has no login flow, backend, telemetry, or key upload.

Credentials stay in Rust. They are never logged, written to TokenTray files, or passed to the WebView. Preferences and quota snapshots under `%APPDATA%\TokenTray` contain no credentials, prompts, or answers.

Every host TokenTray can contact is listed in the [README](README.md#network-destinations). That list is complete, and you can check it with a firewall.

Report any violation of these guarantees, unexpected network destination, or write to a provider credential store.

## Release integrity

Every release binary — the installer and the portable executable — carries a Sigstore-signed [SLSA build provenance attestation](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) produced by the tagged GitHub Actions run that built it. Verify it with:

```powershell
gh attestation verify .\tokentray-v0.1.0-windows-x64-setup.exe -R deeno13/tokentray
```

This proves the bytes you hold were produced by a specific workflow, from a specific commit, in this repository. It does not prove that commit is free of bugs or that its author is trustworthy — only that the binary and the source you can read came from the same place.

`SHA256SUMS.txt` is published alongside each release and remains the no-extra-tooling check:

```powershell
Get-FileHash .\tokentray-v0.1.0-windows-x64-setup.exe -Algorithm SHA256
```

Be clear about what that checksum is worth. It is fetched from the same release page as the binary, so it detects a corrupted or truncated download and nothing more. It is not evidence against a compromised release or account; the attestation is.

Builds are unsigned. Windows SmartScreen therefore warns on first run, and Smart App Control blocks the executable outright. Treat binaries from outside the repository's [Releases](https://github.com/deeno13/tokentray/releases) page as untrusted.

The installer is per-user. It writes only to `%LOCALAPPDATA%\TokenTray`, the current user's Start Menu, and the current user's uninstall registry key. It never requests elevation. The one thing it installs on your behalf is the Microsoft Edge WebView2 Runtime, and only when that runtime is absent.

## Build hardening

- Every GitHub Action is pinned to a full commit SHA, not a mutable tag. Dependabot updates those pins.
- Builds run with `--locked`, so the dependency graph matches the committed `Cargo.lock`.
- `cargo-deny` runs in CI and fails the build on a security advisory, a disallowed licence, or an unknown registry or git source.
- The release job runs in a protected `release` environment, so publishing can require a reviewer.
- The build tools downloaded by CI (`cargo-deny`, Komac) are pinned by version, and `cargo-deny` is checksum-verified before it runs.

## Installation channels

The GitHub release is the source of truth. Everything else points at that same asset:

- The Scoop manifest (and the winget manifest, once submitted) carries the SHA-256 of the release asset, so the package manager verifies integrity before installing.
- `install.ps1` pins one release, downloads its `SHA256SUMS.txt`, and refuses to install on a checksum mismatch. The check has no override flag.
- The build tools the release workflow downloads — the Tauri CLI, `cargo-deny`, Komac — are pinned by version, and the first two are checksum-verified before they run.

No installation channel enables **Start with Windows**; the application manages that per-user setting itself.
