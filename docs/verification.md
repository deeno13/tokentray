# Verification — startup preferences

Source build: eee9efd0e4c0dbd9358443f3b7d7d194828f743c.

[Windows CI](https://github.com/deeno13/tokentray/actions/runs/34608358353) passed: 29 Rust release tests, 8 JavaScript tests and Windows x64 release compilation. Launch regression tests cover minimized and visible startup, explicit open and silent flags, automatic versus manual repeat launches, and quoted executable paths containing spaces. Settings tests cover the backward-compatible minimized default and preference serialization.

The final executable was tested on Windows using its existing --inspect mode. Both new settings render above the provider switches. Changing Start minimized to tray saved the preference and upgraded the existing legacy --silent startup entry to the current executable with --startup. Turning Start with Windows off removed the per-user Run value; turning it back on wrote the exact quoted path to the updated portable executable. Both switches remained enabled after restarting the app. The saved provider selection and Acrylic preference matched their pre-test values.

With minimized startup temporarily off, an automatic second --startup launch left the existing hidden popup closed and retained one process. Manual reopening was observed on recheck, and --show also reopened the same instance. Initial manual reopening was not immediately visible to automation; a repeat check passed without a code change. The final executable was restarted with --startup and minimized startup enabled.

This did not sign out of or reboot Windows. Actual sign-in launch remains a manual verification step. Cold-launch visibility decisions are covered by Rust tests; --inspect deliberately forces the popup open for native settings inspection. The taskbar itself is not exposed to Windows automation here, so tray menu checkmark synchronization and real tray clicks were not manually exercised in this pass.

Executable SHA-256: c061dfa5b7838b98f831c2967ec0b7857f0e0d81401ad200292ada77b8dd8ee7
