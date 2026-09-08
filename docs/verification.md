# Verification — horizontal rings and settings

Source build: f05c7b7987ada5996377aad273517ded23ae98ff.

[Windows CI](https://github.com/deeno13/tokentray/actions/runs/34238750979) passed: 17 Rust release tests, 6 JavaScript tests, and Windows x64 release compilation. Settings tests cover default-enabled providers and serialized disabled-provider/appearance preferences. Frontend tests cover filtering, all-disabled state, and existing quota edge cases.

Browser interaction checks verified all eight rings fit at 760 × 260 CSS pixels, provider details expand and collapse with Escape, a disabled provider stays hidden after reload, settings reflects the saved switch state, all providers can be disabled, and all can be enabled again. Settings layout was inspected. Preview data remains explicitly labelled synthetic.

The updated native executable launched successfully in normal tray mode. Native tray clicking, popup resizing, settings writes through IPC, and Acrylic switching still need a manual interaction pass; browser tests do not prove those Windows interactions. The previous build's live Codex/Copilot checks remain prior-build evidence, not a fresh test of this binary. The six other adapters still need eligible signed-in sessions for live checks.

Disabled providers skip future quota reads; a request already in flight may finish. Enabling a provider respects existing polling and cooldown behavior. Preferences save to %APPDATA%\TokenTray\config.json. The build remains unsigned.

Executable SHA-256: 6a758e95c72e8be06e63ad7301d6d357576e07c7ccde768f6792c4eea7495631
