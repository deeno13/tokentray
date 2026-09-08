//! Codex's documented app-server protocol. No direct auth.json access, no turns.
use crate::{usage::{LimitWindow, UsageSnapshot}, AppState};
use serde_json::{json, Value};
use std::{io::{BufRead, BufReader, Write}, process::{Command, Stdio}, sync::{atomic::{AtomicBool, Ordering}, mpsc}, time::{Duration, Instant}};
use tauri::{AppHandle, Emitter, Manager};

static REFRESH: AtomicBool = AtomicBool::new(false);
pub fn request_refresh() { REFRESH.store(true, Ordering::Relaxed); }
pub fn load_persisted() -> UsageSnapshot { crate::extras::load_cache("codex") }

fn executable() -> Option<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Some(p) = dirs::data_local_dir() { paths.push(p.join("Programs/OpenAI/Codex/bin/codex.exe")); }
    if let Some(p) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&p) { paths.push(dir.join("codex.exe")); }
    }
    paths.into_iter().find(|p| p.is_file())
}

pub fn parse(v: &Value) -> Vec<LimitWindow> {
    let mut out = Vec::new();
    let buckets: Vec<(String, &Value)> = match v.get("rateLimitsByLimitId").and_then(Value::as_object).filter(|m| !m.is_empty()) {
        Some(map) => map.iter().map(|(id, value)| (id.clone(), value)).collect(),
        None => v.get("rateLimits").map(|x| vec![("codex".into(), x)]).unwrap_or_default(),
    };
    for (bucket, snap) in buckets {
        for slot in ["primary", "secondary"] {
            let Some(w) = snap.get(slot) else { continue };
            let Some(pct) = w.get("usedPercent").and_then(Value::as_f64).filter(|p| p.is_finite() && *p >= 0.0) else { continue };
            let duration = w.get("windowDurationMins").and_then(Value::as_u64);
            let label = match duration {
                Some(300) => "5-hour limit".into(), Some(10080) => "Weekly limit".into(),
                Some(m) if m % 1440 == 0 => format!("{}-day limit", m / 1440),
                Some(m) if m % 60 == 0 => format!("{}-hour limit", m / 60),
                Some(m) => format!("{m}-minute limit"), None => format!("{slot} limit"),
            };
            out.push(LimitWindow { id: format!("{bucket}/{slot}"), label: if bucket == "codex" { label } else { format!("{bucket} · {label}") }, used: pct / 100.0,
                resets_at: w.get("resetsAt").and_then(Value::as_u64).and_then(|s| s.checked_mul(1000)), ..Default::default() });
        }
    }
    out
}

fn read_once() -> Result<Vec<LimitWindow>, &'static str> {
    let exe = executable().ok_or("Install the native Codex CLI and sign in with ChatGPT.")?;
    let mut cmd = Command::new(exe);
    cmd.arg("app-server").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x0800_0000); }
    let mut child = cmd.spawn().map_err(|_| "Could not start Codex CLI.")?;
    let mut input = child.stdin.take().unwrap();
    let output = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(output).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) { if tx.send(value).is_err() { break; } }
        }
    });
    let result = (|| {
        writeln!(input, "{}", json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"tokentray","title":"TokenTray","version":"0.1.0"}}})).map_err(|_| "Codex connection closed.")?;
        input.flush().map_err(|_| "Codex connection closed.")?;
        let deadline = Instant::now() + Duration::from_secs(25);
        loop {
            let value = rx.recv_timeout(deadline.saturating_duration_since(Instant::now())).map_err(|_| "Codex timed out. Check your CLI sign-in and connection.")?;
            if value.get("id").and_then(Value::as_u64) == Some(1) {
                if value.get("error").is_some() { return Err("Codex initialization failed. Update your CLI."); }
                writeln!(input, "{}", json!({"method":"initialized"})).map_err(|_| "Codex connection closed.")?;
                writeln!(input, "{}", json!({"id":2,"method":"account/rateLimits/read"})).map_err(|_| "Codex connection closed.")?;
                input.flush().map_err(|_| "Codex connection closed.")?;
            }
            if value.get("id").and_then(Value::as_u64) == Some(2) {
                if value.get("error").is_some() { return Err("Codex could not read quotas. Sign in to the CLI with ChatGPT."); }
                let windows = parse(&value["result"]);
                return if windows.is_empty() { Err("Codex returned no metered limits for this account.") } else { Ok(windows) };
            }
        }
    })();
    drop(input);
    let _ = child.kill();
    let _ = child.wait();
    drop(rx);
    let _ = reader.join();
    result
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        let prev = app.state::<AppState>().codex.lock().unwrap().clone();
        let snapshot = match read_once() {
            Ok(windows) => UsageSnapshot { status:"ok".into(), windows, fetched_at:crate::extras::now_ms(), note:"Codex app-server".into(), ..Default::default() },
            Err(note) => UsageSnapshot { status: if prev.windows.is_empty() { "unavailable" } else { "stale" }.into(), note:note.into(), ..prev },
        };
        crate::extras::save_cache("codex", &snapshot);
        *app.state::<AppState>().codex.lock().unwrap() = snapshot.clone();
        let _ = app.emit("codex", snapshot);
        // A manual refresh can shorten the five-minute poll, never below 60 s.
        for second in 0..300 { std::thread::sleep(Duration::from_secs(1)); if second >= 59 && REFRESH.swap(false, Ordering::Relaxed) { break; } }
    });
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn missing_is_not_zero() { assert!(parse(&json!({"rateLimits":{"primary":{"usedPercent":null}}})).is_empty()); }
    #[test] fn maps_win_and_duration_defines_label() {
        let w = parse(&json!({"rateLimits":{"primary":{"usedPercent":99}},"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":25,"windowDurationMins":10080,"resetsAt":1800000000}},"spark":{"secondary":{"usedPercent":7,"windowDurationMins":300}}}}));
        assert_eq!(w.len(), 2); assert_eq!(w[0].label,"Weekly limit"); assert_eq!(w[0].used,0.25); assert_eq!(w[0].resets_at,Some(1800000000000)); assert!(w[1].label.contains("spark"));
    }
}

