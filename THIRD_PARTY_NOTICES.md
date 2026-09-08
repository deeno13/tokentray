# Third-party notices

TokenTray reuses and modifies code and icon assets from [CodeNotch](https://github.com/vinzdg/codenotch), specifically the Windows implementation contributed from [Im-Midi/codenotch-windows](https://github.com/Im-Midi/codenotch-windows).

Reference revision: `892c6d66f012dc0689a9f205c108c02434899bbf` (retrieved 2026-09-08).

`src/usage.rs`, `src/cursor.rs`, `src/antigravity.rs`, `src/autostart.rs`, `build.rs`, and the initial Cargo dependency list originate from that MIT Windows port. The GLM, Grok, OpenCode and Copilot wire-format implementations in `src/extras.rs` are adapted from the corresponding MIT Swift provider sources. The MIT notices are retained in [LICENSE](LICENSE). TokenTray is independent of those authors and the provider vendors. Names of providers remain their respective owners' marks. The TokenTray tray mark and icon assets are original; the retained historical icon notice in the upstream license describes upstream assets, which TokenTray replaces.

Tauri and all transitive dependencies retain their own licenses, recorded in package metadata; the source is available through the versions in Cargo.lock. The frontend is original TokenTray code.
