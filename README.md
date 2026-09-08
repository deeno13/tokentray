# TokenTray

AI agent usage limits, one click from your Windows tray. A compact Fluent flyout with native Windows Acrylic, light/dark appearance, usage bars and reset countdowns.

**Early development build.** Eight provider adapters are implemented; availability depends on each installed tool, account and endpoint. Internal provider endpoints may change. Missing data is shown as unavailable, never as zero usage.

## Run

Download `TokenTray-windows-x64` from the private repository's **Actions → Windows → Artifacts**, extract it and run `tokentray.exe`. Windows 10/11 x64 with Microsoft Edge WebView2 Runtime is required. The build is unsigned; signing and an installer are future work.

Click the tray icon to open the flyout. Click a provider to expand its limit windows. Escape or clicking outside closes it. Right click the tray for Refresh, Start with Windows (opt-in), or Quit. If Windows puts the icon in the overflow, drag it into the visible notification area. `tokentray.exe --show` opens the flyout at launch.

The Acrylic checkbox switches to an opaque surface. High-contrast and reduced-transparency browser preferences request the same fallback. Native material rendering varies with Windows version and compositor settings.

## Provider connections

| Provider | Source | Setup |
|---|---|---|
| Codex | Documented `codex app-server` / `account/rateLimits/read` | Native Codex CLI signed in with ChatGPT; API-key-only quotas are not subscription allowances |
| Claude Code | Claude usage endpoint | Existing `.claude/.credentials.json`; honors `CLAUDE_CONFIG_DIR` |
| Cursor | Usage summary endpoint | Signed-in editor; read-only `state.vscdb` |
| Antigravity | Local language-server bridge, Google quota API, then derived activity count | Installed and signed-in Antigravity; a count is explicitly not a quota percentage |
| GLM | Z.ai / BigModel Coding Plan monitor | Existing Z.ai key in Claude Code, ZCode or OpenCode; encrypted ZCode keys are skipped |
| Grok | Grok Build billing endpoint | xAI-issued Grok CLI session in `.grok/auth.json` |
| OpenCode | OpenCode **Go plan** usage | `opencode-go` credential; unrelated vendor API keys are not counted as Go usage |
| GitHub Copilot | GitHub Copilot quota endpoint | GitHub CLI signed in to a Copilot account, or inherited `GH_TOKEN` / `GITHUB_TOKEN` |

No new login UI, backend service, telemetry, or key uploads. Credentials never enter the web frontend or repository. Native adapters read existing sessions and contact the corresponding provider directly. Codex owns its own authentication when its app-server is invoked; TokenTray does not manage its credentials. Monitoring starts no AI turns and redeems no reset credits.

Only quota snapshots are cached under `%APPDATA%\TokenTray`; no prompts or answers are saved. Antigravity's inherited fallback scans local activity logs to derive a count. Stale readings retain their timestamp. Windows-native credentials are supported; WSL-only sign-ins and multiple accounts need later work.

## Develop and verify

Install Rust stable with the MSVC toolchain, Visual Studio C++ Build Tools, Windows SDK and WebView2. Then:

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
.\target\release\tokentray.exe --show
```

Windows CI runs the parser tests, frontend model tests and release compilation, then uploads a private portable executable. It does not publish a release or deploy anything. The committed Cargo.lock records the dependency versions resolved by the Windows runner; CI enforces it with `--locked`.

The `ui/` folder can be served by any static server for design review. Browser preview always labels its synthetic sample data; native execution uses only provider readings.

For Windows UI automation, `tokentray.exe --inspect` exposes the same flyout as a taskbar window and keeps it open on blur. This developer-only mode makes it discoverable to automation tools that filter out tray/tool windows. Escape and Close still hide it. Normal launches keep tray-only behavior and dismiss on blur.

See [stack research](docs/research.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
