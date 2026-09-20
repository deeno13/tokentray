//! Allowlisted display metadata only. Kept in memory, never in quota caches.
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Emitter};
#[derive(Clone, Default, Serialize)]
pub struct Account { pub email: Option<String>, pub username: Option<String>, pub plan: Option<String> }
pub fn clean(value: Option<&str>) -> Option<String> { value.map(str::trim).filter(|s| !s.is_empty() && s.len() <= 254 && !s.chars().any(char::is_control)).map(str::to_owned) }
pub fn codex(v: &Value) -> Account { Account { email:clean(v["account"]["email"].as_str()), plan:clean(v["account"]["planType"].as_str()), ..Default::default() } }
pub fn publish(app: &AppHandle, id: &str, account: Account) {
    let map = { let state=app.state::<crate::AppState>(); let mut map=state.accounts.lock().unwrap();map.insert(id.into(),account);map.clone() };
    let _=app.emit("accounts",map);
}
fn claude_files() -> (Value, Value) {
    let Some(home)=dirs::home_dir() else {return (Value::Null,Value::Null)};
    let custom=std::env::var_os("CLAUDE_CONFIG_DIR").map(std::path::PathBuf::from);
    let dir=custom.clone().unwrap_or_else(||home.join(".claude"));
    let config=custom.map(|p|p.join(".claude.json")).unwrap_or_else(||home.join(".claude.json"));
    fn read(path: std::path::PathBuf) -> Value {std::fs::read(path).ok().and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or(Value::Null)}
    let profile=read(config);
    let credentials=[".credentials.json","credentials.json"].into_iter().map(|name|read(dir.join(name))).find(|v|!v.is_null()).unwrap_or(Value::Null);
    (profile, credentials)
}
fn project(profile: &Value, credentials: &Value) -> Account {
    Account {email:clean(profile["oauthAccount"]["emailAddress"].as_str()),plan:clean(credentials["claudeAiOauth"]["subscriptionType"].as_str()),..Default::default()}
}
/// Fingerprint of what the user sees as the account. A token refresh keeps it;
/// an account switch changes it, so the caller can retire the old account's
/// reading and its 429 cooldown. Never persisted or sent to JavaScript.
/// Incomplete metadata yields no fingerprint: a file caught mid-write must not
/// look like a switch.
fn fingerprint(account: &Account) -> String {
    match (account.email.as_deref(),account.plan.as_deref()) {
        (Some(email),Some(plan)) => format!("{email}\u{1f}{plan}"),
        _ => String::new(),
    }
}
/// The local account plus its non-secret fingerprint.
pub fn claude_identity() -> (Account, String) {
    let (profile, credentials) = claude_files();
    let account = project(&profile, &credentials);
    let fp = fingerprint(&account);
    (account, fp)
}
pub fn claude() -> Account { claude_identity().0 }
#[cfg(test)] mod tests {
    use super::*;use serde_json::json;
    #[test] fn account_projection_excludes_secrets() {let a=codex(&json!({"account":{"email":"sample@example.com","planType":"plus","accessToken":"NEVER-EXPORT"},"token":"NEVER-EXPORT"}));let output=serde_json::to_string(&a).unwrap();assert!(!output.contains("NEVER-EXPORT"));assert_eq!(a.email.as_deref(),Some("sample@example.com"));assert_eq!(a.plan.as_deref(),Some("plus"));}
    #[test] fn missing_and_invalid_metadata_remain_unknown() {assert!(codex(&json!({"account":null})).email.is_none());assert!(clean(Some("bad\nvalue")).is_none());assert!(clean(Some(&"a".repeat(255))).is_none());}
    #[test] fn fingerprint_ignores_a_refreshed_token_but_not_a_switched_account() {
        let profile=json!({"oauthAccount":{"emailAddress":"old@example.com"}});
        let before=project(&profile,&json!({"claudeAiOauth":{"subscriptionType":"pro","accessToken":"NEVER-EXPORT","refreshToken":"NEVER-EXPORT"}}));
        let refreshed=project(&profile,&json!({"claudeAiOauth":{"subscriptionType":"pro","accessToken":"ROTATED","refreshToken":"ROTATED"}}));
        let switched=project(&json!({"oauthAccount":{"emailAddress":"new@example.com"}}),&json!({"claudeAiOauth":{"subscriptionType":"team","accessToken":"ROTATED"}}));
        assert_eq!(fingerprint(&before),fingerprint(&refreshed));
        assert_ne!(fingerprint(&before),fingerprint(&switched));
        assert!(!fingerprint(&before).contains("NEVER-EXPORT"));
        assert!(fingerprint(&project(&profile,&json!({}))).is_empty());
    }
}
