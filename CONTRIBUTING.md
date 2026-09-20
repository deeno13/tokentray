# Contributing to TokenTray

Thanks for looking. TokenTray is a small Windows tray app; contributions that keep it small are the easiest to merge.

## Before you start

Open an issue for anything beyond a bug fix or a doc correction, so we can agree on the approach first. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Development setup

You need Windows 10/11 x64 with:

- Rust stable, MSVC toolchain
- Visual Studio C++ Build Tools and the Windows SDK
- Microsoft Edge WebView2 Runtime
- Node.js 22 or newer, for the frontend tests

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
.\target\release\tokentray.exe --show
```

The first build takes a while: `rusqlite` compiles the bundled SQLite C sources.

For UI work, serve `ui/` with any static server for design review, or run `node tests/browser-smoke.mjs` with an existing Playwright installation and Microsoft Edge. The harness uses synthetic data and a mocked native bridge, and writes screenshots to `ui-test-results/`. Native placement is covered by the Rust geometry tests and still needs a live tray check.

`tokentray.exe --inspect` exposes the flyout as an ordinary taskbar window so Windows UI automation can see it.

## Ground rules

These are hard requirements, not style preferences:

- Provider credentials stay in Rust. Never log them, never persist them, never return them to JavaScript.
- Reuse existing provider sessions read-only. Do not write to a provider's credential store or refresh its credentials.
- Missing quota is **unavailable**, never zero.
- Monitoring must not start agent turns, redeem reset credits, or edit provider configuration.
- Manual refresh honors the existing cooldowns.
- Keep provider parsing separately testable with synthetic fixtures, and preserve third-party attribution in [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Adding a provider adapter

Provider quotas come from endpoints these vendors do not document as public APIs. A new adapter should read a session the vendor's own tool already created, parse the response in a function covered by synthetic fixture tests, and degrade to unavailable when the shape changes. Say in the pull request how you obtained the wire format and what happens when the endpoint moves.

## Pull requests

Run the full gate before you open one:

```powershell
cargo test --release --locked
node --test tests/*.test.mjs
cargo build --release --locked
```

Windows CI is the native build gate and runs the same checks. Describe what you verified manually, since most tray and placement behavior cannot be asserted in CI. Add a focused regression test for changed non-trivial logic.

## Releases

Maintainers cut a release by bumping the version in `Cargo.toml` and `tauri.conf.json`, updating `CHANGELOG.md`, then pushing a matching `vX.Y.Z` tag. The `Release` workflow verifies that the tag and both manifests agree, runs the gate, and publishes the portable executable with its SHA-256 checksum.
