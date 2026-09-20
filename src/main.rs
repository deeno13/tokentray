#![cfg_attr(windows, windows_subsystem = "windows")]

mod usage;
mod account;
mod popup;
mod codex;
mod cursor;
mod antigravity;
mod extras;
mod config;
mod autostart;
mod webview2;

use std::{collections::BTreeMap, sync::Mutex};
use tauri::{AppHandle, Manager};
use usage::UsageSnapshot;

pub struct AppState {
    startup_menu: Mutex<Option<tauri::menu::CheckMenuItem<tauri::Wry>>>,
    interaction: Mutex<popup::Interaction>,
    accounts: Mutex<BTreeMap<String, account::Account>>,
    settings: Mutex<config::Settings>,
    popup_size: Mutex<(u32, u32)>,
    popup_monitor: Mutex<Option<tauri::PhysicalPosition<f64>>>,
    usage: Mutex<UsageSnapshot>,
    codex: Mutex<UsageSnapshot>,
    cursor: Mutex<UsageSnapshot>,
    antigravity: Mutex<UsageSnapshot>,
    extras: Mutex<BTreeMap<String, UsageSnapshot>>,
}

pub fn provider_enabled(app: &AppHandle, id: &str) -> bool { app.state::<AppState>().settings.lock().unwrap().enabled(id) }
#[tauri::command]
fn get_startup() -> bool { autostart::is_enabled() }
#[tauri::command]
fn set_startup(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let result=if enabled {autostart::enable()} else {autostart::disable()};
    let actual=autostart::is_enabled();
    let menu=app.state::<AppState>().startup_menu.lock().unwrap().clone();
    if let Some(menu)=menu {let _=menu.set_checked(actual);}
    use tauri::Emitter;
    let _=app.emit("startup-changed",actual);
    result?;
    if actual!=enabled {return Err("Windows did not apply the startup setting.".into());}
    Ok(actual)
}
#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> config::Settings { state.settings.lock().unwrap().clone() }
#[tauri::command]
fn save_settings(state: tauri::State<AppState>, settings: config::Settings) -> Result<(), String> {
    let mut current = state.settings.lock().unwrap();
    // Older builds registered --silent. Refresh an enabled entry when this
    // preference changes so Windows launches respect it and use this executable.
    if settings.start_minimized != current.start_minimized && autostart::is_enabled() {
        autostart::enable()?;
    }
    settings.save()?;
    let newly_enabled: Vec<_> = config::PROVIDERS.into_iter().filter(|id| !current.enabled(id) && settings.enabled(id)).collect();
    *current = settings;
    drop(current);
    for id in newly_enabled { match id { "codex" => codex::request_refresh(), "claude" => usage::request_refresh(), "cursor" => cursor::request_refresh(), "antigravity" => antigravity::request_refresh(), _ => extras::request_refresh() } }
    Ok(())
}
#[tauri::command]
fn resize_popup(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    *app.state::<AppState>().popup_size.lock().unwrap() =
        (width.clamp(240, 1000), height.clamp(80, 1200));
    position_popup(&app, None)
}

// A point inside the selected monitor keeps content resizes on that display,
// while resolving its current work area and DPI afresh each time.
fn position_popup(
    app: &AppHandle,
    target: Option<tauri::PhysicalPosition<f64>>,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Popup window unavailable")?;
    let state = app.state::<AppState>();
    let target = target.or(*state.popup_monitor.lock().unwrap());
    let monitor = target.and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .ok_or("Popup monitor unavailable")?;
    let area = monitor.work_area();
    *state.popup_monitor.lock().unwrap() = Some(tauri::PhysicalPosition::new(
        area.position.x as f64 + area.size.width as f64 / 2.0,
        area.position.y as f64 + area.size.height as f64 / 2.0,
    ));
    let logical_size = *state.popup_size.lock().unwrap();
    let placement = popup::bottom_right(
        (area.position.x, area.position.y),
        (area.size.width, area.size.height),
        logical_size,
        monitor.scale_factor(),
    );
    let position = tauri::PhysicalPosition::new(placement.x, placement.y);
    let size = tauri::PhysicalSize::new(placement.width, placement.height);
    // Move first so Windows applies the destination monitor's DPI before sizing.
    if window.outer_position().ok() != Some(position) {
        window.set_position(position).map_err(|_| "Could not position popup")?;
    }
    if window.inner_size().ok() != Some(size) {
        window.set_size(size).map_err(|_| "Could not resize popup")?;
    }
    Ok(())
}

// Upstream adapters call this with provider error details. Deliberately discard
// those strings: server bodies, local paths and credential diagnostics are not logs.
pub fn applog(_line: &str) {}

#[tauri::command]
fn get_accounts(state: tauri::State<AppState>) -> BTreeMap<String, account::Account> { state.accounts.lock().unwrap().clone() }
#[tauri::command]
fn get_all(state: tauri::State<AppState>) -> BTreeMap<String, UsageSnapshot> {
    let mut out = state.extras.lock().unwrap().clone();
    out.insert("claude".into(), state.usage.lock().unwrap().clone());
    out.insert("codex".into(), state.codex.lock().unwrap().clone());
    out.insert("cursor".into(), state.cursor.lock().unwrap().clone());
    out.insert("antigravity".into(), state.antigravity.lock().unwrap().clone());
    out
}

#[tauri::command]
fn refresh_usage() {
    usage::request_refresh();
    codex::request_refresh();
    cursor::request_refresh();
    antigravity::request_refresh();
    extras::request_refresh();
}

#[tauri::command]
fn hide_popup(app: AppHandle) {
    app.state::<AppState>().interaction.lock().unwrap().cancel();
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
    // The webview persists across hides; let it leave sub-pages like Settings
    // so the next open starts from the main view.
    use tauri::Emitter;
    let _ = app.emit("popup-hidden", ());
}

#[tauri::command]
fn set_material(app: AppHandle, enabled: bool, dark: bool) -> bool {
    use tauri::window::{EffectsBuilder, Effect, Color};
    let Some(w) = app.get_webview_window("main") else { return false };
    if !enabled { let _ = w.set_effects(EffectsBuilder::new().build()); return false; }
    let color = if dark { Color(28, 28, 32, 210) } else { Color(245, 245, 248, 210) };
    w.set_effects(EffectsBuilder::new().effect(Effect::Acrylic).color(color).build()).is_ok()
}

fn show_popup(app: &AppHandle) {
    app.state::<AppState>().interaction.lock().unwrap().cancel();
    let Some(window) = app.get_webview_window("main") else { return };
    // Tauri's tray rectangle is physical, including in the Windows overflow.
    // Opening from the menu or a repeat launch uses the same monitor as a click.
    let target = app.tray_by_id("main").and_then(|tray| tray.rect().ok().flatten()).map(|rect| {
        let position = rect.position.to_physical::<f64>(1.0);
        let size = rect.size.to_physical::<f64>(1.0);
        tauri::PhysicalPosition::new(position.x + size.width / 2.0, position.y + size.height / 2.0)
    });
    let _ = position_popup(app, target);
    let _ = window.show();
    let _ = window.set_focus();
}

fn main() {
    // Tauri cannot create a window without WebView2, and this binary has no
    // console to report that in. Explain it before the builder runs.
    webview2::require();
    let data = config::config_path();
    if let Some(parent) = data.parent() { let _ = std::fs::create_dir_all(parent); }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            let minimized=app.state::<AppState>().settings.lock().unwrap().start_minimized;
            if autostart::should_show(&args,minimized,true) {show_popup(app);}
        }))
        .manage(AppState {
            startup_menu: Mutex::new(None),
            interaction: Mutex::new(popup::Interaction::default()),
            accounts: Mutex::new(BTreeMap::new()),
            settings: Mutex::new(config::Settings::load()),
            popup_size: Mutex::new(popup::INITIAL_SIZE),
            popup_monitor: Mutex::new(None),
            usage: Mutex::new(usage::load_persisted()), codex: Mutex::new(codex::load_persisted()),
            cursor: Mutex::new(cursor::load_persisted()), antigravity: Mutex::new(antigravity::load_persisted()),
            extras: Mutex::new(extras::load_persisted()),
        })
        .invoke_handler(tauri::generate_handler![get_startup, set_startup, get_all, get_accounts, get_settings, save_settings, resize_popup, refresh_usage, hide_popup, set_material])
        .on_window_event(|w, event| match event {
            tauri::WindowEvent::Focused(false) => {
                if !std::env::args().any(|arg| arg == "--inspect") {
                    // Windows may transfer focus before delivering the tray mouse-down.
                    // Let that event capture visibility before dismissing outside clicks.
                    let app=w.app_handle().clone();
                    let generation=app.state::<AppState>().interaction.lock().unwrap().blur();
                    let window=w.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        let dispatch=app.clone();
                        let _=app.run_on_main_thread(move || {
                            let dismiss=dispatch.state::<AppState>().interaction.lock().unwrap().should_dismiss(generation);
                            if dismiss && !window.is_focused().unwrap_or(false) { hide_popup(dispatch); }
                        });
                    });
                }
            }
            tauri::WindowEvent::ScaleFactorChanged { .. } => {
                let app = w.app_handle().clone();
                let dispatch = app.clone();
                let _ = app.run_on_main_thread(move || { let _ = position_popup(&dispatch, None); });
            }
            tauri::WindowEvent::Focused(true) => { w.app_handle().state::<AppState>().interaction.lock().unwrap().refocus(); }
            tauri::WindowEvent::CloseRequested { api, .. } => { api.prevent_close(); hide_popup(w.app_handle().clone()); }
            _ => {}
        })
        .setup(|app| {
            use tauri::{menu::{Menu, MenuItem, CheckMenuItem, PredefinedMenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};
            let refresh = MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open TokenTray", true, None::<&str>)?;
            let auto = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart::is_enabled(), None::<&str>)?;
            *app.state::<AppState>().startup_menu.lock().unwrap()=Some(auto.clone());
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit TokenTray", true, None::<&str>)?;
            let (first, second) = (PredefinedMenuItem::separator(app)?, PredefinedMenuItem::separator(app)?);
            let menu = Menu::with_items(app, &[&refresh, &open, &first, &auto, &settings, &second, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .tooltip("TokenTray — AI usage limits")
                .menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, ev| {
                    let app=tray.app_handle();
                    let Some(w)=app.get_webview_window("main") else {return};
                    match ev {
                        TrayIconEvent::Click {button:MouseButton::Left,button_state:MouseButtonState::Down,..} => {
                            app.state::<AppState>().interaction.lock().unwrap().press(w.is_visible().unwrap_or(false));
                        }
                        TrayIconEvent::DoubleClick {button:MouseButton::Left,..} => {
                            // The second release should keep the popup open.
                            app.state::<AppState>().interaction.lock().unwrap().press(false);
                        }
                        TrayIconEvent::Click {button:MouseButton::Left,button_state:MouseButtonState::Up,..} => {
                            let close=app.state::<AppState>().interaction.lock().unwrap().release(w.is_visible().unwrap_or(false));
                            if close {hide_popup(app.clone());} else {show_popup(app);}
                        }
                        TrayIconEvent::Leave {..} => {
                            let pressed=app.state::<AppState>().interaction.lock().unwrap().leave();
                            if pressed && !w.is_focused().unwrap_or(false) {hide_popup(app.clone());}
                        }
                        _=>{}
                    }
                })
                .on_menu_event(move |app, ev| match ev.id.as_ref() {
                    "open" => show_popup(app), "refresh" => refresh_usage(), "quit" => app.exit(0),
                    // The popup owns Settings; the tray only asks it to open there.
                    "settings" => { show_popup(app); use tauri::Emitter; let _ = app.emit("open-settings", ()); }
                    "autostart" => {
                        let result = set_startup(app.clone(),!autostart::is_enabled());
                        if result.is_err() { use tauri::Emitter; let _ = app.emit("notice", "Could not change Windows startup. Try again from the tray menu."); show_popup(app); }
                    }
                    _ => {}
                }).build(app)?;
            usage::start(app.handle().clone()); codex::start(app.handle().clone());
            cursor::start(app.handle().clone()); antigravity::start(app.handle().clone());
            extras::start(app.handle().clone());
            // Automation tools often exclude tray/tool windows from their inventory.
            // This explicit developer mode exposes the same flyout for inspection.
            let inspect = std::env::args().any(|arg| arg == "--inspect");
            if inspect { if let Some(w) = app.get_webview_window("main") { let _ = w.set_skip_taskbar(false); } }
            let minimized=app.state::<AppState>().settings.lock().unwrap().start_minimized;
            if autostart::should_show(&std::env::args().collect::<Vec<_>>(),minimized,false) { show_popup(app.handle()); }
            Ok(())
        })
        .run(tauri::generate_context!()).expect("TokenTray could not start");
}

