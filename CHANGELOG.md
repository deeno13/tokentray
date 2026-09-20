# Changelog

## [0.1.0] - 2026-09-20

First public release.

### Added

- Portable Windows tray app with light/dark Acrylic UI.
- Read-only adapters for Codex, Claude Code, Cursor, Antigravity, GLM, Grok, OpenCode Go, and GitHub Copilot.
- Usage rings, reset times, details, stack layout, provider settings, startup options, and CLI flags.
- Windows CI and tagged-release workflow with SHA-256 checksums.

### Security

- Credentials stay in Rust and are never logged, stored, or returned to the frontend.
- Missing quota is *unavailable*, never zero.
- Monitoring starts no agent turns, redeems no reset credits, and edits no provider configuration.

### Known limitations

- Unsigned portable executable; no installer or automatic updates.
- Windows-native credentials only; WSL-only sign-ins and multiple accounts are unsupported.
- Antigravity's fallback count is activity data, not a quota percentage.

[0.1.0]: https://github.com/deeno13/tokentray/releases/tag/v0.1.0
