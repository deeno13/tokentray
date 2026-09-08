# Verification — automatic sizing and account details

Source build: 516f5635e93621ce5aae9f4e7f4aef67a0d2a059.

[Windows CI](https://github.com/deeno13/tokentray/actions/runs/34241172146) passed: 19 Rust release tests, 8 JavaScript tests, and Windows x64 release compilation. New checks cover metadata projection without credentials, invalid/missing metadata, signed-out identity hiding and provider-dependent width.

Browser checks: eight providers fit at 744 px wide, three at 294 px, and one at the 260 px header minimum. The only space after the provider row was the 1 px window border. Opening details expands the reading width and fits their actual height. Settings shows labelled synthetic account metadata.

Native Windows checks on the compiled binary: saved three-provider selection rendered in a compact window without the former bottom gap; Settings expanded to its content height and displayed the live Codex email and reported plan. Disabling OpenCode through the native switch, then clicking Back, visibly shrank the popup to two providers. Re-enabled OpenCode and hash-verified the settings file exactly matched its original content, including the user's Acrylic preference. Restarted in normal tray mode after inspection.

The native input pass used --inspect to keep the window open on blur. Tray clicks, light-dismiss and multi-monitor/DPI transitions were not re-tested. Other providers' account metadata still needs eligible signed-in sessions for live validation. Copilot falls back to username when GitHub does not expose an email; GLM's quota source does not report identity or tier. Account metadata is memory-only.

Executable SHA-256: b71f95899255087b6482d6cbeab4224064272b4782b1cac84a0c369e2cc9fe0b
