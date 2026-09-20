# Changelog

All notable changes to TokenTray are recorded here. Versions follow [semantic versioning](https://semver.org/spec/v2.0.0.html); while the major version is 0, minor releases may change behavior.

## [0.1.0] - 2026-09-20

First public release. Early development build: provider availability depends on each installed tool, account and endpoint, and internal provider endpoints may change without notice.

### Added

- Windows tray icon with a compact Fluent flyout using native Acrylic, light/dark appearance and an opaque fallback for high-contrast or reduced-transparency preferences.
- Eight read-only provider adapters: Codex, Claude Code, Cursor, Antigravity, GLM, Grok, OpenCode Go and GitHub Copilot. Each reuses an existing local session; none add a login UI, backend service or telemetry.
- Overview with progress rings and reset countdowns, paired 5-hour and weekly limits as inner and outer rings, and a per-provider detail view of limit windows.
- Settings for enabling or disabling individual providers, switching the overview between a four-column ring grid and a full-width stack, and choosing ring colors (Urgency, One accent or Per provider).
- Start with Windows (opt-in, per-user, no administrator access) and Start minimized to tray (on by default), kept in sync with the tray menu.
- Tray menu with Refresh usage, Open TokenTray, Start with Windows, Settings and Quit; manual refresh honors per-provider cooldowns.
- Account display of the available email or username, reported plan and connection state, held in memory and never written to quota caches.
- `--show`, `--startup` and developer-only `--inspect` launch flags, with single-instance handling that reuses the running popup.
- Windows CI running Rust parser tests, JavaScript frontend model tests and a locked release build.

### Security

- Provider credentials are read and used only in Rust. They are never logged, persisted, or returned to the web frontend.
- Missing quota is reported as unavailable rather than as zero usage. Monitoring starts no agent turns and redeems no reset credits.
- Preferences are saved in `config.json` and quota snapshots are cached under `%APPDATA%\TokenTray`; no prompts or answers are stored.

### Known limitations

- The portable executable is unsigned; there is no installer and no automatic updates.
- Windows-native credentials only. WSL-only sign-ins and multiple accounts per provider are not supported.
- Antigravity may fall back to a derived local activity count, which is explicitly not a quota percentage.

[0.1.0]: https://github.com/deeno13/tokentray/releases/tag/v0.1.0
