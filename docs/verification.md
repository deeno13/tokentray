# Verification — tray toggle and edge spacing

Source build: fef90ad37653040ee76275365fdb17dcfd3d53d8.

[Windows CI](https://github.com/deeno13/tokentray/actions/runs/34255150746) passed: 25 Rust release tests, 8 JavaScript tests and Windows x64 release compilation. Six new tests exercise tray open/close decisions, cancellation of delayed blur dismissal, direct release fallback, scaled work-area gaps, negative monitor origins and unusually small work areas.

The compiled executable was installed into the portable output folder and restarted in normal tray mode. The ZIP contents were hash-verified against the extracted deliverables.

Windows automation does not expose the taskbar as a targetable window in this session. Actual repeated tray clicks and taskbar-edge placement therefore still need a manual pass; the event decisions and placement mathematics passed regression tests. Prior native auto-fit and account display checks are recorded in the preceding verification revision. Provider settings and credentials were not changed by this update.

Executable SHA-256: 7e16aad547d6fd3823566ef17977566971350d3c7d3e504233a1d0c878a6f1b8
