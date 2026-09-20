; NSIS hooks for the TokenTray installer.
;
; TokenTray writes its own "Start with Windows" entry: a per-user HKCU Run
; value named TokenTray, managed from the tray menu (see src/autostart.rs).
; The bundler does not know about it, so uninstalling with the setting enabled
; would leave a Run value pointing at a deleted executable. Windows would then
; fail that launch silently at every sign-in.
;
; Remove it before the files go. DeleteRegValue is a no-op when the value is
; absent, so this is safe whether or not the user ever enabled the setting.

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TokenTray"
!macroend
