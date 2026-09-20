# Contributing

TokenTray is a small Windows tray app. Keep changes focused and open an issue before larger work. Report security problems through [SECURITY.md](SECURITY.md), not a public issue.

## Setup

Windows 10/11 x64 is required, with Rust stable/MSVC, Visual Studio C++ Build Tools, the Windows SDK, WebView2, and Node.js 22+.

Run the full gate:

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
```

Run `.\target\release\tokentray.exe --show` to inspect the app. After a visual change, regenerate the sample README images:

```powershell
node tools/capture-screenshots.mjs
```

The screenshot tool uses synthetic readings and a mocked native bridge. Do not use real accounts in screenshots.

## Rules

- Keep credentials in Rust. Never log, persist, or return them to JavaScript.
- Reuse existing provider sessions read-only. Do not refresh credentials or edit provider stores.
- Show missing quota as *unavailable*, never zero.
- Monitoring must not start agent turns, redeem reset credits, or edit provider configuration.
- Manual refresh must honor cooldowns.
- Keep provider parsing testable with synthetic fixtures and preserve third-party attribution.

## Pull requests

Add focused regression tests for non-trivial changes. Describe manual checks, especially for tray and monitor behavior that CI cannot cover. Windows CI is the native build gate.

For a release, update `Cargo.toml`, `tauri.conf.json`, and `CHANGELOG.md`, then push a matching `vX.Y.Z` tag. The Release workflow checks the versions and publishes the executable with its checksum.
