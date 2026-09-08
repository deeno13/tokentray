# Tray popup

Operate mode. Compact Windows Acrylic flyout with one horizontal row of provider progress rings. Each ring shows the first reported allowance's used percentage, provider name, and status. Select a ring to reveal all allowance windows, reset times, and connection guidance below. Do not combine unrelated limits. Missing quota is a dash, never zero. Narrow monitors scroll the ring row horizontally. Segoe UI, system light/dark, native Acrylic with an opaque accessibility fallback.

Settings is a separate in-popup page with one persistent switch per provider and the Acrylic switch. Disabled providers disappear and their background workers skip new quota reads; an in-flight read may finish. All eight providers default on. Settings save locally, with errors surfaced. Escape returns from Settings or details before hiding the popup. The tray retains refresh, autostart and quit. Browser previews clearly label synthetic readings.

Popup dimensions follow visible content: compact overview width follows enabled provider count (minimum width keeps header actions usable), detail view has a readable minimum, and Settings uses a narrow reading width. Height is measured after every content or state change, with scrolling only when the monitor work area limits it. Settings rows show available account identity, plan and connection state. Account display metadata is memory-only and missing fields are explicit.

Left tray clicks toggle the popup. Mouse-down captures its prior visibility so taskbar focus changes cannot immediately reopen a dismissed popup. Outside focus loss has a short cancellable dismissal delay. Keep a 12 logical-pixel inset from the monitor work-area edges on opening and resizing.
