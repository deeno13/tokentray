# TokenTray

**Monitor AI coding-tool usage from the Windows notification area.**

[![Windows](https://github.com/deeno13/tokentray/actions/workflows/windows.yml/badge.svg)](https://github.com/deeno13/tokentray/actions/workflows/windows.yml)
[![Latest release](https://img.shields.io/github/v/release/deeno13/tokentray?sort=semver)](https://github.com/deeno13/tokentray/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/overview-dark.png">
    <img src="docs/media/overview-light.png" width="400" alt="TokenTray showing usage rings for supported AI coding tools.">
  </picture>
</p>

TokenTray is a portable Windows app. It reads the sessions already stored by your AI tools and shows usage, reset times, and connection status in one flyout. It has no login screen, backend, or telemetry.

> Early development build. Provider availability depends on the installed tool, account, and endpoint. Missing data is shown as *unavailable*, never as zero.

## Install

Requirements:

- Windows 10 or 11, x64
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
- At least one supported tool, installed and signed in

Download `tokentray-<version>-windows-x64.exe` from the [latest release](https://github.com/deeno13/tokentray/releases/latest). There is no installer and no administrator access is required. Keep the executable in a permanent folder if you enable **Start with Windows**.

Releases include `SHA256SUMS.txt`:

```powershell
Get-FileHash .\tokentray-v0.1.0-windows-x64.exe -Algorithm SHA256
```

The executable is unsigned, so Windows SmartScreen may warn on first run. Verify the hash before choosing **More info → Run anyway**.

## Supported providers

TokenTray reuses credentials from the vendor's own Windows tool. It never asks you to sign in.

| Provider | Source | Requirement |
|---|---|---|
| **Codex** | `codex app-server` / `account/rateLimits/read` | Native Codex CLI signed in with ChatGPT |
| **Claude Code** | Usage endpoint | `.claude/.credentials.json`; honors `CLAUDE_CONFIG_DIR` |
| **Cursor** | Usage summary | Signed-in editor; reads `state.vscdb` only |
| **Antigravity** | Local bridge, quota API, or derived activity count | Installed and signed in; a derived count is not a quota percentage |
| **GLM** | Z.ai / BigModel Coding Plan | Existing key in Claude Code, ZCode, or OpenCode |
| **Grok** | Grok Build billing endpoint | `.grok/auth.json` with an xAI session |
| **OpenCode** | OpenCode Go usage | `opencode-go` credential; other API keys are ignored |
| **GitHub Copilot** | Copilot quota endpoint | GitHub CLI sign-in or `GH_TOKEN` / `GITHUB_TOKEN` |

Unsigned or unavailable providers remain visible with their status.

## Use TokenTray

- **Click** the tray icon to open or close the flyout.
- **Right-click** for Refresh usage, Open TokenTray, Start with Windows, Settings, and Quit.
- **Click a provider** to see its limit windows and reset times.
- **Press Escape** to return, then close the flyout.

The flyout opens at the bottom-right of the tray monitor with a DPI-scaled 12-pixel inset. Clicking elsewhere closes it.

Settings controls:

- Providers: enable or disable checks.
- Layout: four-column rings or full-width stack.
- Ring color: Urgency, One accent, or Per provider.
- Acrylic: use an opaque surface instead.
- Start with Windows: per-user and off by default.
- Start minimized to tray: on by default.

Settings survive restarts. Account metadata is shown in memory only.

Command-line flags:

| Flag | Effect |
|---|---|
| `--show` | Open the flyout at launch |
| `--startup` | Mark a Windows sign-in launch |
| `--inspect` | Keep the flyout visible for Windows UI automation |

Launching an existing executable reuses the running instance.

## Privacy and security

- Credentials stay in Rust. They are never logged, persisted, or sent to JavaScript.
- Monitoring is read-only: it starts no agent turns, redeems no reset credits, and edits no provider configuration.
- Manual refresh honors provider cooldowns.
- `%APPDATA%\TokenTray\config.json` stores preferences. Quota snapshots are cached there.
- Credentials, prompts, answers, and account metadata are not stored in those files.
- Stale readings retain their original timestamp.

Report security issues privately through [SECURITY.md](SECURITY.md).

## Build from source

You need Windows 10/11 x64, Rust stable with MSVC, Visual Studio C++ Build Tools, the Windows SDK, WebView2, and Node.js 22+.

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
.\target\release\tokentray.exe --show
```

The stack is Rust, Tauri 2, and plain HTML/CSS/JavaScript. Provider parsers use synthetic fixtures. To update the README images after a UI change:

```powershell
node tools/capture-screenshots.mjs
```

Windows CI runs the tests and locked release build. The Release workflow validates matching `vX.Y.Z` tags and publishes the executable with a SHA-256 checksum.

## Troubleshooting

- **SmartScreen warning:** verify `SHA256SUMS.txt`; the build is unsigned.
- **Missing tray icon:** open the `^` overflow and drag TokenTray into the notification area.
- **Provider unavailable:** sign in with the vendor's Windows tool. WSL-only sign-ins and multiple accounts are not supported.
- **Antigravity shows a count:** this is a derived activity count, not a quota percentage.
- **Startup stopped working:** disable and re-enable it after moving the executable.
- **Opaque popup:** Acrylic may be disabled or unavailable because of Windows accessibility settings.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Release history is in [CHANGELOG.md](CHANGELOG.md).

## License and attribution

MIT — see [LICENSE](LICENSE). TokenTray reuses MIT code and assets from [CodeNotch](https://github.com/vinzdg/codenotch); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

TokenTray is not affiliated with CodeNotch or any provider vendor.
