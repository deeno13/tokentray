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

### Installer

Download `tokentray-<version>-windows-x64-setup.exe` from the [latest release](https://github.com/deeno13/tokentray/releases/latest) and run it.

It installs to `%LOCALAPPDATA%\TokenTray` for your user only, needs no administrator access, adds a Start Menu entry, registers in **Apps & Features**, and installs the WebView2 Runtime if it is missing.

### PowerShell

```powershell
irm https://raw.githubusercontent.com/deeno13/tokentray/main/install.ps1 | iex
```

This executes a script downloaded from the internet. If you would rather read it first:

```powershell
irm https://raw.githubusercontent.com/deeno13/tokentray/main/install.ps1 -OutFile install.ps1
notepad install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The script pins a single release, verifies its SHA-256 against `SHA256SUMS.txt`, and refuses to continue on a mismatch. It then runs the installer above silently, so the result is identical. Set `$env:TOKENTRAY_VERSION` to install a specific tag.

### Scoop

```powershell
scoop bucket add tokentray https://github.com/deeno13/tokentray
scoop install tokentray
```

Scoop manages its own copy of the portable executable rather than running the installer.

### Portable

Download `tokentray-<version>-windows-x64.exe` from the [latest release](https://github.com/deeno13/tokentray/releases/latest) and keep it in a permanent folder. Nothing is installed and no administrator access is required, but you need the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) already present — the portable build cannot fetch it for you. TokenTray says so and stops if it is missing.

The installer, `install.ps1`, and Scoop all place the executable at a stable per-user path, so **Start with Windows** keeps working across upgrades. A manually placed portable executable does not; re-enable the setting if you move it.

No install method enables **Start with Windows** for you. TokenTray owns that setting from its own tray menu.

## Verify a download

Both downloads are unsigned, so Windows SmartScreen warns on first run and Smart App Control blocks them outright.

Build provenance is the stronger check. It binds the download to the exact commit and workflow run that produced it, which a checksum cannot do:

```powershell
gh attestation verify .\tokentray-v0.1.0-windows-x64-setup.exe -R deeno13/tokentray
```

Checksums need no extra tooling and detect a corrupted or truncated download. Compare against `SHA256SUMS.txt` from the same release:

```powershell
Get-FileHash .\tokentray-v0.1.0-windows-x64-setup.exe -Algorithm SHA256
```

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
| `--silent` | Start hidden. Kept for startup entries written by older builds; current builds register `--startup` |

`--show` and `--inspect` take precedence over `--silent`. Launching an existing executable reuses the running instance.

## Privacy and security

- Credentials stay in Rust. They are never logged, persisted, or sent to JavaScript.
- Monitoring is read-only: it starts no agent turns, redeems no reset credits, and edits no provider configuration.
- Manual refresh honors provider cooldowns.
- `%APPDATA%\TokenTray\config.json` stores preferences. Quota snapshots are cached there.
- Credentials, prompts, answers, and account metadata are not stored in those files.
- Stale readings retain their original timestamp.

### Network destinations

This is every host TokenTray can contact, and it is the complete list. There is no analytics host and no update server. You can check it with a firewall.

| Provider | Hosts contacted |
|---|---|
| **Codex** | none — reads a local `codex app-server` process, so TokenTray makes no network call for Codex |
| **Claude Code** | `api.anthropic.com` |
| **Cursor** | `cursor.com` |
| **Antigravity** | `cloudcode-pa.googleapis.com`, and `127.0.0.1` for the local bridge |
| **GLM** | `api.z.ai`, `open.bigmodel.cn` |
| **Grok** | `cli-chat-proxy.grok.com` |
| **OpenCode** | `opencode.ai` |
| **GitHub Copilot** | `api.github.com` |

Disabling a provider in Settings stops its checks, and so stops its requests. The Antigravity bridge is reached over loopback only; its self-signed certificate is accepted for `127.0.0.1` and nowhere else.

Report security issues privately through [SECURITY.md](SECURITY.md).

## Uninstall

If you used the installer or `install.ps1`, TokenTray appears in **Settings → Apps → Installed apps** and uninstalls from there. It also removes the **Start with Windows** entry, so nothing is left pointing at a deleted executable.

Equivalently, from a terminal:

```powershell
.\uninstall.ps1                        # installer or install.ps1
scoop uninstall tokentray              # installed with Scoop
```

`uninstall.ps1` runs the registered uninstaller when there is one, and otherwise removes a portable copy. Either way it keeps your preferences; add `-RemoveSettings` to delete `%APPDATA%\TokenTray` too.

## Build from source

You need Windows 10/11 x64, Rust stable with MSVC, Visual Studio C++ Build Tools, the Windows SDK, WebView2, and Node.js 22+.

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
.\target\release\tokentray.exe --show
```

To build the installer as well you need the [Tauri CLI](https://v2.tauri.app/reference/cli/):

```powershell
cargo tauri build
```

That produces `target\release\bundle\nsis\TokenTray_<version>_x64-setup.exe` alongside the portable executable. See [packaging/README.md](packaging/README.md) for the NSIS hook and the winget manifests.

The stack is Rust, Tauri 2, and plain HTML/CSS/JavaScript. Provider parsers use synthetic fixtures. To update the README images after a UI change:

```powershell
node tools/capture-screenshots.mjs
```

Windows CI runs the tests, a `cargo-deny` dependency audit, and the locked release build. The Release workflow validates matching `vX.Y.Z` tags, attests build provenance, and publishes the executable with a SHA-256 checksum.

## Troubleshooting

- **SmartScreen warning:** verify the provenance attestation or `SHA256SUMS.txt`; the build is unsigned.
- **"WebView2 Runtime is not installed":** the portable build cannot install it. Use the installer instead, or install the runtime and start TokenTray again.
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
