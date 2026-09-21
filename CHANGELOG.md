# Changelog

## [0.1.0] - 2026-09-21

First public release.

### Added

- Portable Windows tray app with light/dark Acrylic UI.
- Read-only adapters for Codex, Claude Code, Cursor, Antigravity, GLM, Grok, OpenCode Go, and GitHub Copilot.
- Usage rings, reset times, details, stack layout, provider settings, startup options, and CLI flags.
- Per-user NSIS installer registered in Apps & Features, alongside the portable executable. Its uninstaller clears the "Start with Windows" entry, and it installs the WebView2 Runtime when that is missing.
- `install.ps1` / `uninstall.ps1` one-liners that verify the release checksum before installing.
- Scoop manifest; winget manifests staged for submission.
- Windows CI and tagged-release workflow with SHA-256 checksums.

### Security

- Credentials stay in Rust and are never logged, stored, or returned to the frontend.
- Missing quota is *unavailable*, never zero.
- Monitoring starts no agent turns, redeems no reset credits, and edits no provider configuration.
- Release binaries carry a Sigstore-signed SLSA build provenance attestation; GitHub Actions are pinned to commit SHAs and `cargo-deny` gates dependencies in CI.
- TokenTray reports a missing WebView2 Runtime instead of failing to draw a window with no explanation.

### Known limitations

- Unsigned builds; SmartScreen warns and Smart App Control blocks them. No automatic updates.
- Windows-native credentials only; WSL-only sign-ins and multiple accounts are unsupported.
- Antigravity's fallback count is activity data, not a quota percentage.

[0.1.0]: https://github.com/deeno13/tokentray/releases/tag/v0.1.0
