# TokenTray

AI agent usage limits, one click from your Windows tray. A compact Fluent flyout with native Windows Acrylic, light/dark appearance, a compact grid of progress rings and reset countdowns.

**Early development build.** Eight provider adapters are implemented; availability depends on each installed tool, account and endpoint. Internal provider endpoints may change. Missing data is shown as unavailable, never as zero usage.

## Run

Download `TokenTray-windows-x64` from the private repository's **Actions → Windows → Artifacts**, extract it and run `tokentray.exe`. Windows 10/11 x64 with Microsoft Edge WebView2 Runtime is required. The build is unsigned; signing and an installer are future work.

The popup keeps a consistent 440 logical-pixel width across overview, details and Settings. Provider rings wrap into rows of up to four; height follows the visible content, with scrolling when needed to fit the monitor work area. Settings shows available email or username, reported plan and connection state. Account display metadata stays in memory; it is not saved in quota caches. Missing details are explicitly marked as not reported.

Click the tray icon to open the flyout; click it again to close it. It opens at the bottom-right of the tray monitor, with a 12 logical-pixel gap from the taskbar and screen edges. This gap scales with the monitor DPI and stays anchored when the content changes. Click a provider ring to reveal its limit windows. Settings lets you enable or disable each provider; choices survive restarts and disabled providers skip future checks (an in-flight check may finish). Escape returns from Settings or details, then closes the popup. Clicking outside closes it. Right click the tray for Refresh, Start with Windows (opt-in), or Quit. If Windows puts the icon in the overflow, drag it into the visible notification area. `tokentray.exe --show` opens the flyout at launch.

Settings also has **Start with Windows** (off by default) and **Start minimized to tray** (on by default). The first registers this executable for your Windows sign-in, without administrator access; the second controls whether a new launch opens the popup. Turning minimized startup off opens the popup on both manual and Windows startup launches. Opening the executable while it is already running shows the existing popup; an automatic startup launch leaves that instance undisturbed. Keep the portable executable in a permanent folder before enabling startup; if you move it, switch startup off and on to update its path. The tray menu's startup switch stays in sync with Settings.

The Acrylic switch in Settings switches to an opaque surface. High-contrast and reduced-transparency browser preferences request the same fallback. Native material rendering varies with Windows version and compositor settings.

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

Provider, appearance and minimized-start preferences are saved in config.json; quota snapshots are cached under `%APPDATA%\TokenTray`; no prompts or answers are saved. Antigravity's inherited fallback scans local activity logs to derive a count. Stale readings retain their timestamp. Windows-native credentials are supported; WSL-only sign-ins and multiple accounts need later work.

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

With an existing Playwright installation and Microsoft Edge, run `node tests/browser-smoke.mjs` for layout and click checks. Optional positional arguments accept the Playwright package path and a Chromium browser executable path. The harness starts a temporary local server, uses synthetic provider data and a mocked native bridge, and saves screenshots under `ui-test-results/`. It checks UI behavior; native placement is covered by the Rust geometry tests and needs a live Windows tray check for end-to-end verification.

For Windows UI automation, `tokentray.exe --inspect` exposes the same flyout as a taskbar window and keeps it open on blur. This developer-only mode makes it discoverable to automation tools that filter out tray/tool windows. Escape and Close still hide it. Normal launches keep tray-only behavior and dismiss on blur.

See [stack research](docs/research.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
