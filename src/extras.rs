//! GLM, Grok, OpenCode Go and Copilot. Adapters derived from CodeNotch's MIT
//! wire-format implementations. Only provider-owned keys go to allowlisted hosts.
use crate::{usage::{LimitWindow, UsageSnapshot}, AppState};
use serde_json::Value;
use std::{collections::BTreeMap, path::{Path, PathBuf}, time::{Duration, SystemTime, UNIX_EPOCH}, sync::atomic::{AtomicU64, Ordering}};
use tauri::{AppHandle, Emitter, Manager};
static REFRESH: AtomicU64 = AtomicU64::new(0);
const IDS: [&str; 4] = ["glm", "grok", "opencode", "copilot"];
pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
pub fn request_refresh() { REFRESH.fetch_add(1, Ordering::Relaxed); }
pub fn load_cache(id: &str) -> UsageSnapshot {
    let mut s: UsageSnapshot = std::fs::read(crate::config::config_path().with_file_name(format!("{id}.json"))).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    if !s.windows.is_empty() { s.status = "stale".into(); } s
}
pub fn save_cache(id: &str, s: &UsageSnapshot) {
    if let Ok(text) = serde_json::to_string(s) { let _ = std::fs::write(crate::config::config_path().with_file_name(format!("{id}.json")), text); }
}
pub fn load_persisted() -> BTreeMap<String, UsageSnapshot> { IDS.into_iter().map(|id| (id.into(), load_cache(id))).collect() }
fn json_file(path: &Path) -> Option<Value> { serde_json::from_slice(&std::fs::read(path).ok()?).ok() }
fn secret(v: &Value) -> Option<String> {
    v.as_str().or_else(|| ["key","apiKey","api_key","token","accessToken","auth_token"].iter().find_map(|k| v.get(k).and_then(Value::as_str)))
        .filter(|s| !s.trim().is_empty() && !s.starts_with("enc:v1:")).map(str::to_owned)
}
fn opencode_auth(home: &Path) -> Option<Value> {
    let mut paths = Vec::new();
    if let Some(p) = std::env::var_os("XDG_DATA_HOME") { paths.push(PathBuf::from(p).join("opencode/auth.json")); }
    paths.push(home.join(".local/share/opencode/auth.json"));
    if let Some(p) = dirs::config_dir() { paths.push(p.join("opencode/auth.json")); }
    paths.into_iter().find_map(|p| json_file(&p))
}
fn zai_base(url: &str) -> Option<&'static str> {
    let parsed: url::Url = url.parse().ok()?;
    let host = parsed.host_str()?;
    if parsed.scheme() != "https" { return None; }
    if host == "z.ai" || host.ends_with(".z.ai") { Some("https://api.z.ai") }
    else if host == "bigmodel.cn" || host.ends_with(".bigmodel.cn") { Some("https://open.bigmodel.cn") } else { None }
}
fn glm_credential(home: &Path) -> Option<(String, String)> {
    let claude = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| home.join(".claude"));
    if let Some(v) = json_file(&claude.join("settings.json")) {
        if let Some(base) = v["env"]["ANTHROPIC_BASE_URL"].as_str().and_then(zai_base) {
            if let Some(token) = secret(&v["env"]["ANTHROPIC_AUTH_TOKEN"]).or_else(|| secret(&v["env"]["ANTHROPIC_API_KEY"])) { return Some((token,base.into())); }
        }
    }
    if let Some(v) = json_file(&home.join(".zcode/v2/config.json")) {
        if let Some(providers) = v["provider"].as_object() {
            for (id, p) in providers {
                if !id.contains("coding-plan") || p["enabled"] == false { continue; }
                if let (Some(token), Some(base)) = (secret(&p["options"]["apiKey"]), p["options"]["baseURL"].as_str().and_then(zai_base)) { return Some((token,base.into())); }
            }
        }
    }
    if let Some(v) = json_file(&home.join(".zcode/v2/credentials.json")) {
        if let Some(t) = secret(&v["oauth:zai:access_token"]) { return Some((t,"https://api.z.ai".into())); }
    }
    let v = opencode_auth(home)?;
    for id in ["zai-coding-plan","zai","z-ai","z.ai","zhipu","zhipuai"] {
        if let Some(t) = secret(&v[id]) { return Some((t, if id.starts_with("zhipu") { "https://open.bigmodel.cn" } else { "https://api.z.ai" }.into())); }
    }
    None
}
fn grok_token(v: &Value) -> Option<String> {
    let entries = v.as_object()?;
    entries.iter().filter(|(id, entry)| id.as_str() == "https://auth.x.ai" || id.starts_with("https://auth.x.ai::") || entry["oidc_issuer"] == "https://auth.x.ai")
        .filter(|(_, e)| iso(&e["expires_at"]).map(|t| t > now_ms()).unwrap_or(true)).find_map(|(_,e)| secret(&e["key"]))
}
fn gh_token() -> Option<String> {
    for key in ["GH_TOKEN","GITHUB_TOKEN"] { if let Ok(t) = std::env::var(key) { if !t.trim().is_empty() { return Some(t); } } }
    let mut cmd = std::process::Command::new("gh");
    cmd.args(["auth","token","--hostname","github.com"]).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null());
    #[cfg(windows)] { use std::os::windows::process::CommandExt; cmd.creation_flags(0x0800_0000); }
    let mut child = cmd.spawn().ok()?;
    let start = std::time::Instant::now();
    loop {
        if let Ok(Some(status)) = child.try_wait() { if !status.success() { return None; } break; }
        if start.elapsed() > Duration::from_secs(10) { let _ = child.kill(); let _ = child.wait(); return None; }
        std::thread::sleep(Duration::from_millis(50));
    }
    let output = child.wait_with_output().ok()?;
    String::from_utf8(output.stdout).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}
#[derive(Debug)] enum Failure { Auth, Backoff(u64), Invalid, Network }
fn fetch(url: &str, token: &str) -> Result<Value, Failure> {
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(15)).build();
    match agent.get(url).set("Authorization", &format!("Bearer {token}")).set("Accept","application/json").set("User-Agent","TokenTray/0.1.0").set("X-GitHub-Api-Version","2022-11-28").call() {
        Ok(r) => r.into_json().map_err(|_| Failure::Invalid),
        Err(ureq::Error::Status(401 | 403, _)) => Err(Failure::Auth),
        Err(ureq::Error::Status(429, r)) => Err(Failure::Backoff(r.header("retry-after").and_then(|s| s.parse::<u64>().ok()).unwrap_or(60).max(60))),
        Err(_) => Err(Failure::Network),
    }
}
fn iso(v: &Value) -> Option<u64> {
    if let Some(n) = v.as_u64() { return if n > 10_000_000_000 { Some(n) } else { n.checked_mul(1000) }; }
    let s = v.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis().max(0) as u64).or_else(|| chrono::NaiveDate::parse_from_str(s,"%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0,0,0)).map(|d| d.and_utc().timestamp_millis().max(0) as u64))
}
fn window(id: &str, label: &str, pct: &Value, reset: Option<u64>) -> Option<LimitWindow> {
    let pct = pct.as_f64().filter(|p| p.is_finite() && *p >= 0.0)?;
    Some(LimitWindow { id:id.into(), label:label.into(), used:pct/100.0, resets_at:reset, ..Default::default() })
}
pub fn parse(id: &str, v: &Value) -> Result<Vec<LimitWindow>, String> {
    let mut out = Vec::new();
    match id {
        "glm" => {
            if v["success"] == false || v["code"].as_i64().map(|c| c != 200).unwrap_or(false) { return Err("Provider rejected request".into()); }
            if let Some(limits) = v["data"]["limits"].as_array() { for (index,l) in limits.iter().enumerate() {
                let label = if l["type"] == "TIME_LIMIT" { "Monthly MCP" } else if l["unit"] == 3 && l["number"] == 5 { "5-hour limit" } else if l["unit"] == 6 && l["number"] == 1 { "Weekly limit" } else { "Usage limit" };
                if let Some(w) = window(&format!("glm-{index}"), label, &l["percentage"], l["nextResetTime"].as_u64()) { out.push(w); }
            }}
        }
        "grok" => {
            let c = &v["config"]; let reset = iso(&c["currentPeriod"]["end"]).or_else(|| iso(&c["billingPeriodEnd"]));
            if let Some(w) = window("credits", "Grok Build credits", &c["creditUsagePercent"],reset) { out.push(w); }
            else if let Some(products) = c["productUsage"].as_array() { for p in products { let name = p["product"].as_str().unwrap_or("Usage"); if let Some(w) = window(name,name,&p["usagePercent"],reset) { out.push(w); } } }
        }
        "opencode" => { for (key,label) in [("rolling","5-hour limit"),("weekly","Weekly limit"),("monthly","Monthly limit")] {
            if let Some(w) = window(key,label,&v["usage"][key]["percent"],iso(&v["usage"][key]["resetsAt"])) { out.push(w); }
        }}
        "copilot" => { for (key,label) in [("premium_interactions","Premium requests"),("chat","Chat requests"),("completions","Completions")] {
            let q = &v["quota_snapshots"][key]; if q["unlimited"] == true { continue; }
            let total = q["entitlement"].as_f64();
            let used = q["used"].as_f64().or_else(|| Some(total? - q["remaining"].as_f64()?));
            if let (Some(total),Some(used)) = (total,used) { if total > 0.0 && used.is_finite() {
                out.push(LimitWindow { id:key.into(), label:label.into(), used:used.max(0.0)/total, resets_at: iso(&q["reset_date"]).or_else(|| iso(&q["reset_at"])).or_else(|| iso(&v["quota_reset_date"])), ..Default::default() });
            }}
        }}
        _ => {}
    }
    if out.is_empty() { Err("No metered quota reported".into()) } else { Ok(out) }
}
fn read(id: &str) -> Result<Vec<LimitWindow>, Failure> {
    let home = dirs::home_dir().ok_or(Failure::Auth)?;
    let (url, token) = match id {
        "glm" => { let (token,base) = glm_credential(&home).ok_or(Failure::Auth)?; (format!("{base}/api/monitor/usage/quota/limit"),token) }
        "grok" => ("https://cli-chat-proxy.grok.com/v1/billing?format=credits".into(), json_file(&home.join(".grok/auth.json")).and_then(|v| grok_token(&v)).ok_or(Failure::Auth)?),
        "opencode" => ("https://opencode.ai/zen/go/v1/usage".into(), opencode_auth(&home).and_then(|v| secret(&v["opencode-go"])).ok_or(Failure::Auth)?),
        "copilot" => ("https://api.github.com/copilot_internal/user".into(), gh_token().ok_or(Failure::Auth)?),
        _ => return Err(Failure::Invalid),
    };
    let v = fetch(&url,&token)?;
    if id == "glm" { match v["code"].as_i64() { Some(401 | 403) => return Err(Failure::Auth), Some(429) => return Err(Failure::Backoff(60)), _ => {} } }
    parse(id,&v).map_err(|_| Failure::Invalid)
}
pub fn start(app: AppHandle) {
    for id in IDS { let app = app.clone(); std::thread::spawn(move || {
        let mut generation = REFRESH.load(Ordering::Relaxed); let mut failures = 0u32;
        loop {
            let prev = app.state::<AppState>().extras.lock().unwrap().get(id).cloned().unwrap_or_default();
            if prev.backoff_until > now_ms() { std::thread::sleep(Duration::from_secs(1)); continue; }
            let snapshot = match read(id) {
                Ok(windows) => { failures = 0; UsageSnapshot { status:"ok".into(), windows, fetched_at:now_ms(), note:String::new(), backoff_until:0 } }
                Err(e) => {
                    let (status,note,deadline) = match e {
                        Failure::Auth => ("needsAuth","Sign in to the provider's CLI or editor, then refresh.",0),
                        Failure::Invalid => ("unavailable","No metered quota reported, or the provider response has changed.",0),
                        Failure::Network => ("error","Provider could not be reached. Check your connection.",0),
                        Failure::Backoff(seconds) => { failures = failures.saturating_add(1); ("backoff","Provider requested a cooldown. Refresh will wait.", now_ms().saturating_add(seconds.max(60 * (1u64 << failures.min(4))).saturating_mul(1000))) }
                    };
                    let clear = status == "needsAuth";
                    UsageSnapshot { status:if !clear && !prev.windows.is_empty() { "stale" } else { status }.into(), note:note.into(), backoff_until:deadline, windows:if clear { vec![] } else { prev.windows }, fetched_at:if clear { 0 } else { prev.fetched_at } }
                }
            };
            save_cache(id,&snapshot);
            app.state::<AppState>().extras.lock().unwrap().insert(id.into(),snapshot.clone());
            let _ = app.emit(id, snapshot);
            for second in 0..300 { std::thread::sleep(Duration::from_secs(1)); let latest = REFRESH.load(Ordering::Relaxed); if second >= 59 && latest != generation { generation = latest; break; } }
        }
    }); }
}

#[cfg(test)] mod tests {
    use super::*; use serde_json::json;
    #[test] fn no_invented_zero() { for id in IDS { assert!(parse(id,&json!({})).is_err()); } }
    #[test] fn glm_envelope_and_millisecond_reset() {
        assert!(parse("glm",&json!({"code":401,"success":false,"data":{"limits":[{"percentage":0}]}})).is_err());
        let w = parse("glm",&json!({"code":200,"data":{"limits":[{"unit":3,"number":5,"percentage":12.5,"nextResetTime":1800000000000}]}})).unwrap();
        assert_eq!(w[0].used,0.125); assert_eq!(w[0].resets_at,Some(1800000000000));
    }
    #[test] fn grok_issuer_boundary() { assert!(grok_token(&json!({"https://auth.x.ai.evil::client":{"key":"synthetic"}})).is_none()); assert_eq!(grok_token(&json!({"https://auth.x.ai::client":{"key":"synthetic"}})),Some("synthetic".into())); }
    #[test] fn zai_host_boundary() { assert!(zai_base("https://api.z.ai.evil/anthropic").is_none()); assert_eq!(zai_base("https://api.z.ai/api/anthropic"),Some("https://api.z.ai")); }
    #[test] fn copilot_does_not_guess_usage() {
        assert!(parse("copilot",&json!({"quota_snapshots":{"chat":{"entitlement":300}}})).is_err());
        let w = parse("copilot",&json!({"quota_snapshots":{"premium_interactions":{"entitlement":300,"remaining":225},"chat":{"unlimited":true}}})).unwrap(); assert_eq!(w.len(),1); assert_eq!(w[0].used,0.25);
    }
    #[test] fn opencode_zero_is_valid_when_reported() { let w = parse("opencode",&json!({"usage":{"rolling":{"percent":0,"resetsAt":"2026-09-09T00:00:00.123Z"}}})).unwrap(); assert_eq!(w[0].used,0.0); assert!(w[0].resets_at.is_some()); }
    #[test] fn grok_product_fallback() { let w = parse("grok",&json!({"config":{"productUsage":[{"product":"GrokBuild","usagePercent":8}]}})).unwrap(); assert_eq!(w[0].used,0.08); }
}

