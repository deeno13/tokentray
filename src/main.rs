#![cfg_attr(windows, windows_subsystem = "windows")]

mod usage;
mod account;
mod codex;
mod cursor;
mod antigravity;
mod extras;
mod config;
mod autostart;

use std::{collections::BTreeMap, sync::Mutex};
use tauri::{AppHandle, Manager};
use usage::UsageSnapshot;

pub struct AppState {
    accounts: Mutex<BTreeMap<String, account::Account>>,
    settings: Mutex<config::Settings>,
    popup_size: Mutex<(u32, u32)>,
    usage: Mutex<UsageSnapshot>,
    codex: Mutex<UsageSnapshot>,
    cursor: Mutex<UsageSnapshot>,
    antigravity: Mutex<UsageSnapshot>,
    extras: Mutex<BTreeMap<String, UsageSnapshot>>,
}

pub fn provider_enabled(app: &AppHandle, id: &str) -> bool { app.state::<AppState>().settings.lock().unwrap().enabled(id) }
#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> config::Settings { state.settings.lock().unwrap().clone() }
#[tauri::command]
fn save_settings(state: tauri::State<AppState>, settings: config::Settings) -> Result<(), String> {
    let mut current = state.settings.lock().unwrap();
    settings.save()?;
    let newly_enabled: Vec<_> = config::PROVIDERS.into_iter().filter(|id| !current.enabled(id) && settings.enabled(id)).collect();
    *current = settings;
    drop(current);
    for id in newly_enabled { match id { "codex" => codex::request_refresh(), "claude" => usage::request_refresh(), "cursor" => cursor::request_refresh(), "antigravity" => antigravity::request_refresh(), _ => extras::request_refresh() } }
    Ok(())
}
#[tauri::command]
fn resize_popup(app: AppHandle, width: u32, height: u32) {
    let (width, height) = (width.clamp(240, 1000), height.clamp(80, 1200));
    *app.state::<AppState>().popup_size.lock().unwrap() = (width, height);
    let Some(w) = app.get_webview_window("main") else { return };
    if let Ok(Some(mon)) = w.current_monitor() {
        let area = mon.work_area(); let scale = mon.scale_factor();
        let width = (width as f64 * scale).round().min(area.size.width as f64) as u32;
        let height = (height as f64 * scale).round().min(area.size.height as f64) as u32;
        let pos = w.outer_position().unwrap_or(area.position);
        let old = w.outer_size().unwrap_or_default();
        let _ = w.set_size(tauri::PhysicalSize::new(width, height));
        let x = pos.x.clamp(area.position.x, area.position.x + area.size.width as i32 - width as i32);
        let y = (pos.y + old.height as i32 - height as i32).clamp(area.position.y, area.position.y + area.size.height as i32 - height as i32);
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
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
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
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
    let Some(w) = app.get_webview_window("main") else { return };
    let (width, height) = *app.state::<AppState>().popup_size.lock().unwrap();
    // Tray click coordinates and monitor working areas are physical pixels.
    let cursor = app.cursor_position().unwrap_or_default();
    if let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) {
        let area = mon.work_area();
        let scale = mon.scale_factor();
        let width = (width as f64 * scale).round().min(area.size.width as f64) as u32;
        let height = (height as f64 * scale).round().min(area.size.height as f64) as u32;
        let _ = w.set_size(tauri::PhysicalSize::new(width, height));
        let x = (cursor.x as i32 - width as i32 / 2).clamp(area.position.x, area.position.x + area.size.width as i32 - width as i32);
        let y = (cursor.y as i32 - height as i32 - 10).clamp(area.position.y, area.position.y + area.size.height as i32 - height as i32);
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
    let _ = w.show();
    let _ = w.set_focus();
}

fn main() {
    let data = config::config_path();
    if let Some(parent) = data.parent() { let _ = std::fs::create_dir_all(parent); }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show_popup(app)))
        .manage(AppState {
            accounts: Mutex::new(BTreeMap::new()),
            settings: Mutex::new(config::Settings::load()),
            popup_size: Mutex::new((744, 182)),
            usage: Mutex::new(usage::load_persisted()), codex: Mutex::new(codex::load_persisted()),
            cursor: Mutex::new(cursor::load_persisted()), antigravity: Mutex::new(antigravity::load_persisted()),
            extras: Mutex::new(extras::load_persisted()),
        })
        .invoke_handler(tauri::generate_handler![get_all, get_accounts, get_settings, save_settings, resize_popup, refresh_usage, hide_popup, set_material])
        .on_window_event(|w, event| match event {
            tauri::WindowEvent::Focused(false) => {
                if !std::env::args().any(|arg| arg == "--inspect") { let _ = w.hide(); }
            }
            tauri::WindowEvent::CloseRequested { api, .. } => { api.prevent_close(); let _ = w.hide(); }
            _ => {}
        })
        .setup(|app| {
            use tauri::{menu::{Menu, MenuItem, CheckMenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};
            let open = MenuItem::with_id(app, "open", "Open TokenTray", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
            let auto = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart::is_enabled(), None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit TokenTray", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &refresh, &auto, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .tooltip("TokenTray — AI usage limits")
                .menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, ev| {
                    if matches!(ev, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) { show_popup(tray.app_handle()); }
                })
                .on_menu_event(move |app, ev| match ev.id.as_ref() {
                    "open" => show_popup(app), "refresh" => refresh_usage(), "quit" => app.exit(0),
                    "autostart" => {
                        let result = if autostart::is_enabled() { autostart::disable() } else { autostart::enable() };
                        let _ = auto.set_checked(autostart::is_enabled());
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
            if inspect || std::env::args().any(|arg| arg == "--show") { show_popup(app.handle()); }
            Ok(())
        })
        .run(tauri::generate_context!()).expect("TokenTray could not start");
}

