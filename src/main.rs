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

use std::{collections::BTreeMap, sync::Mutex};
use tauri::{AppHandle, Manager};
use usage::UsageSnapshot;

pub struct AppState {
    startup_menu: Mutex<Option<tauri::menu::CheckMenuItem<tauri::Wry>>>,
    interaction: Mutex<popup::Interaction>,
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
        let p=popup::fit((area.position.x,area.position.y),(area.size.width,area.size.height),(pos.x,pos.y+old.height as i32-height as i32),(width,height),scale);
        let _ = w.set_size(tauri::PhysicalSize::new(p.width,p.height));
        let _ = w.set_position(tauri::PhysicalPosition::new(p.x,p.y));
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
    app.state::<AppState>().interaction.lock().unwrap().cancel();
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
    app.state::<AppState>().interaction.lock().unwrap().cancel();
    let Some(w) = app.get_webview_window("main") else { return };
    let (width, height) = *app.state::<AppState>().popup_size.lock().unwrap();
    // Tray click coordinates and monitor working areas are physical pixels.
    let cursor = app.cursor_position().unwrap_or_default();
    if let Ok(Some(mon)) = app.monitor_from_point(cursor.x, cursor.y) {
        let area = mon.work_area();
        let scale = mon.scale_factor();
        let width = (width as f64 * scale).round().min(area.size.width as f64) as u32;
        let height = (height as f64 * scale).round().min(area.size.height as f64) as u32;
        let desired=(cursor.x as i32-width as i32/2,cursor.y as i32-height as i32-(12.0*scale).round() as i32);
        let p=popup::fit((area.position.x,area.position.y),(area.size.width,area.size.height),desired,(width,height),scale);
        let _ = w.set_size(tauri::PhysicalSize::new(p.width,p.height));
        let _ = w.set_position(tauri::PhysicalPosition::new(p.x,p.y));
    }
    let _ = w.show();
    let _ = w.set_focus();
}

fn main() {
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
            popup_size: Mutex::new((744, 182)),
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
            tauri::WindowEvent::Focused(true) => { w.app_handle().state::<AppState>().interaction.lock().unwrap().cancel(); }
            tauri::WindowEvent::CloseRequested { api, .. } => { api.prevent_close(); hide_popup(w.app_handle().clone()); }
            _ => {}
        })
        .setup(|app| {
            use tauri::{menu::{Menu, MenuItem, CheckMenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};
            let open = MenuItem::with_id(app, "open", "Open TokenTray", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Refresh usage", true, None::<&str>)?;
            let auto = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart::is_enabled(), None::<&str>)?;
            *app.state::<AppState>().startup_menu.lock().unwrap()=Some(auto.clone());
            let quit = MenuItem::with_id(app, "quit", "Quit TokenTray", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &refresh, &auto, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .tooltip("TokenTray — AI usage limits")
                .menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, ev| {
                    let app=tray.app_handle();
                    let Some(w)=app.get_webview_window("main") else {return};
                    match ev {
                        TrayIconEvent::Click {button:MouseButton::Left,button_state:MouseButtonState::Down,..} | TrayIconEvent::DoubleClick {button:MouseButton::Left,..} => {app.state::<AppState>().interaction.lock().unwrap().press(w.is_visible().unwrap_or(false));}
                        TrayIconEvent::Click {button:MouseButton::Left,button_state:MouseButtonState::Up,..} => {
                            let close=app.state::<AppState>().interaction.lock().unwrap().release(w.is_visible().unwrap_or(false));
                            if close {hide_popup(app.clone());} else {show_popup(app);}
                        }
                        TrayIconEvent::Leave {..} => {
                            let pressed=app.state::<AppState>().interaction.lock().unwrap().is_pressed();
                            if pressed && !w.is_focused().unwrap_or(false) {hide_popup(app.clone());}
                        }
                        _=>{}
                    }
                })
                .on_menu_event(move |app, ev| match ev.id.as_ref() {
                    "open" => show_popup(app), "refresh" => refresh_usage(), "quit" => app.exit(0),
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

