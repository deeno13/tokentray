# Tray popup

Operate mode. Compact Windows Acrylic flyout. The header carries the mark, the name, the age of the oldest reading on screen, and refresh, Settings and close controls on 30-pixel targets.

Overview has two layouts, chosen in Settings. Grid is the default: a fixed four-column grid of provider rings, each ring showing the first reported allowance's used percentage, with the provider name and one short line beneath it. A second reported allowance (a weekly limit beside a 5-hour limit) adds a dimmer inner ring. That short line is the next reset while a reading holds, and otherwise the reason there is none. Stack trades the rings for full-width rows: name, percentage, a bar, the window label and its reset, and a thinner second bar when a second allowance is reported. Select any provider to reveal all allowance windows, reset times, account identity and connection guidance below.

A reading TokenTray cannot stand behind never draws a filled ring or bar. Signed-out providers show a dashed track and a dash, unreachable ones a broken red arc, and a stale reading drops to muted ink with its age called out. Do not combine unrelated limits. Missing quota is a dash, never zero. Status text always reserves its row, and background readings update existing buttons so pointer clicks and keyboard focus are preserved.

Ring color has three modes. Urgency is the default and tints each reading by how close it is to its limit, turning amber past 60% and red past 85%. One accent paints every ring a single hue chosen from six presets. Per provider keeps each brand's own accent. Segoe UI, system light/dark, native Acrylic with an opaque accessibility fallback.

Settings is a separate in-popup page, grouped as Layout, Ring color, Providers and System. Providers has one persistent switch per provider and reports how many are on against how many are actually reporting. Disabled providers disappear and their background workers skip new quota reads; an in-flight read may finish. All eight providers default on. Settings save locally, with errors surfaced. Escape returns from Settings or details before hiding the popup. The tray retains refresh, open, startup, Settings and quit. Browser previews clearly label synthetic readings.

A profile that has not been through first run opens on a welcome page instead of the overview: what TokenTray does, which providers this PC already has a session for, and one control to start monitoring. It replaces the header while it is shown.

With no providers enabled the overview states that there is nothing to watch and offers a route into Settings.

Overview, details, and Settings share a 400 logical-pixel width so header controls stay in the same horizontal position. The width shrinks only when the monitor work area requires it. Header and back controls share 30-pixel targets; settings rows are at least 32 pixels high. Height is measured after every content or state change, with scrolling only when the monitor work area limits it. Settings rows show the available account identity, plan and connection state. Account display metadata is memory-only; an identity the borrowed credential does not carry is omitted, and an unreported plan stays explicit.

Entering a page or revealing details uses a brief fade with a small directional offset so changes do not cut instantly; background readings never replay it. Reduced-motion preferences keep every transition instant, and motion never delays window resizing.

Left tray clicks toggle the popup. Mouse-down captures its prior visibility so taskbar focus changes cannot immediately reopen a dismissed popup. Outside focus loss has a short cancellable dismissal delay. Anchor the popup to the bottom-right of the tray monitor work area on opening and resizing, with a 12 logical-pixel inset scaled to that display. Keep the chosen monitor when content changes; clamp oversized content to the available area.

Settings ends with Start with Windows, Start minimized to tray and the Acrylic switch. Startup is opt-in through a per-user Windows Run entry and shares its state with the tray menu. Minimized launch defaults on and is saved alongside other preferences. Windows launches use --startup and respect that preference. Automatic launches do not reopen an existing instance; manual repeat launches do. Explicit --show and --inspect open the popup, while --silent keeps it hidden.

# App icon

An open dial, three-quarters round, with the opening at the bottom: the same ring the flyout is built from, and the only mark that can carry a reading at tray size. Rendered from `tools/render-icon.mjs` into `icons/tray.png` and a four-size `icons/icon.ico`, in the shipped teal so it reads on a light or dark taskbar. The 16-pixel raster takes a heavier stroke than the larger ones.

The same dial is the mark inside the popup, in the header and on the welcome page, drawn inline from the same geometry so the tray and the app never show different marks.
