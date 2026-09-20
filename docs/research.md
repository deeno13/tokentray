# Windows tray app research

Research date: 2026-09-08. Decision: **Tauri 2 + Rust + WebView2**, with framework-free HTML/CSS/JavaScript for this small flyout. Product name: **TokenTray**, selected after the user's initial AgentGauge choice. A limited web search found existing AgentGauge AI products and QuotaPeek apps; TokenTray has unrelated uses. This is not a name-clearance claim.

## Framework comparison

| Stack | Fits this project | Tradeoff |
|---|---|---|
| Tauri 2 / Rust / WebView2 | Native tray events, per-monitor popup placement, Windows Acrylic effects; existing MIT CodeNotch Windows adapters can be reused | Rust + MSVC build setup; web controls require explicit accessibility and desktop styling |
| C# / WinUI 3 / Windows App SDK | Microsoft's recommended framework for new native Windows apps; Fluent and DesktopAcrylicBackdrop | Tray integration requires Win32/interoperability work; existing Rust adapters need porting |
| C# / WPF + NotifyIcon | Mature desktop lifecycle and tray integration; powerful XAML layout | Acrylic needs interop; Windows-only; adapter porting |
| Electron / TypeScript | Excellent tray API and familiar web development | Ships Chromium and Node; less attractive for a small always-running utility |

This is a project-specific choice, not a measured memory or performance ranking. No footprint benchmark has yet been run. If fully native WinUI controls become a priority, WinUI 3 deserves another look. No React or Svelte dependency is needed for eight expandable provider rows. No database or cloud service is needed for small local quota snapshots.

## Reference findings

CodeNotch already contains a Windows Rust/Tauri port in `windows/`. It offers four Windows adapters; the eight providers listed in its main README include four additional Swift adapters. Its screen-edge interaction differs from the requested click-to-open tray flyout. TokenTray reuses relevant adapter code and supplies its own tray-first shell. It keeps the MIT notices.

Provider integration is the main maintenance risk. Codex has a documented app-server method, so TokenTray uses that instead of directly copying ChatGPT's internal HTTP endpoint. It prefers `rateLimitsByLimitId` when present and labels windows by their reported duration. The other adapters rely on the owning applications' internal services. A valid credential does not guarantee that the account exposes a quota. Copilot unlimited entitlements do not become fabricated percentage bars, and Antigravity counts are labelled as derived.

Provider errors must not become zero-percent success. Cache freshness is visible. Auth failures hide prior readings. HTTP 429 cooldowns must survive manual refresh and relaunch where the provider returns a deadline. A cooldown belongs to the account that earned it: a Claude account switch retires the previous account's reading and cooldown instead of applying them to the new credential. Live testing all eight requires eight eligible signed-in accounts; parsing synthetic fixtures does not establish live compatibility.

## Acrylic decision

The user's requested material is Windows **Acrylic**. Microsoft's guidance specifically recommends background Acrylic for transient flyouts. TokenTray requests Tauri's native `Effect::Acrylic`; CSS provides content styling and the opaque fallback. This is a native Windows backdrop behind a WebView2 UI, not a WinUI control tree. System theme, high contrast, reduced transparency and the manual Acrylic toggle affect rendering. Exact behavior still needs native visual verification on target Windows versions.

## Sources

- [CodeNotch main README and provider caveats](https://github.com/vinzdg/codenotch)
- [CodeNotch Windows implementation](https://github.com/vinzdg/codenotch/tree/main/windows)
- [Tauri system tray](https://v2.tauri.app/learn/system-tray/)
- [Tauri native window effects](https://docs.rs/tauri/latest/tauri/window/struct.EffectsBuilder.html)
- [Microsoft: choose a Windows development path](https://learn.microsoft.com/en-us/windows/apps/get-started/)
- [Microsoft: Acrylic material](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)
- [Microsoft: WPF overview](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/overview/)
- [Microsoft: NotifyIcon](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.notifyicon)
- [Electron tray API](https://www.electronjs.org/docs/latest/api/tray)
- [OpenAI: Codex app-server](https://learn.chatgpt.com/docs/app-server)

Account details: Codex uses [account/read](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) with refreshToken false; Claude and Cursor use the display metadata from their existing local stores. Copilot uses copilot_plan and the same credential for GitHub /user (private email may be absent, so username is the fallback). Grok can expose its stored email; Antigravity exposes its returned tier; OpenCode identifies Go. GLM identity/tier is not exposed by the quota source. No identity metadata is added to quota caches.
