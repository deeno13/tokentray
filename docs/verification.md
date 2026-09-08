# Verification — 2026-09-08

Source build: `2565c65927a6e8866610dd7a4c73bc48d27b904a`.

[Windows CI run](https://github.com/deeno13/tokentray/actions/runs/34235903612): **passed**.

- 15 Rust regression tests passed in release mode with the committed dependency lockfile.
- 5 JavaScript model tests passed: provider inventory, unknown versus zero, derived counts, countdowns, stale readings, and signed-out cache hiding.
- Windows x64 release compilation passed. Portable executable: 12,759,040 bytes.
- Native executable launched successfully on Windows build 26200.
- Native live reads succeeded for Codex (three returned quota windows) and GitHub Copilot (two metered windows). Other providers reported absent/sign-in-needed states; no eligible local sessions were available to verify them live.
- Native popup screenshot and accessibility tree were inspected: real readings, Acrylic-enabled surface, provider statuses, reset labels, accessible progress indicators, and all eight provider entries were present.
- Browser preview filtering and provider expansion were verified at the popup's 420 × 620 layout. Preview data is explicitly labelled synthetic and is excluded from native execution.

## Limits of this verification

Windows Computer Use could capture the inspection window but rejected input with `window is not a usable app window`; a refreshed lookup could not find it. Actual native tray clicking, light-dismiss, keyboard dismissal, and the Acrylic toggle still require a manual interaction pass. `--inspect` intentionally exposes the window to automation and disables light-dismiss; normal launches do not use this mode.

Provider parser fixtures and authentication header tests are not a substitute for signed-in live checks of Claude Code, Cursor, Antigravity, GLM, Grok and OpenCode. Internal endpoints can change. Multi-account discovery, WSL-only sessions, notifications, an installer, code signing and automatic updates are not part of this first build.

SHA-256 of the final executable:

`c639f3d9de195e2b982d5217321a3fb87e226ba29af694d865fee8f408c68317`
