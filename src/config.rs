use std::{path::PathBuf, collections::BTreeSet};
use serde::{Deserialize, Serialize};
pub const PROVIDERS: [&str; 8] = ["codex","claude","cursor","antigravity","glm","grok","opencode","copilot"];
pub fn config_path() -> PathBuf { dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("TokenTray").join("config.json") }
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings { pub disabled: BTreeSet<String>, pub acrylic: bool, pub start_minimized: bool }
impl Default for Settings { fn default() -> Self { Self { disabled: BTreeSet::new(), acrylic: true, start_minimized: true } } }
impl Settings {
    pub fn enabled(&self, id: &str) -> bool { PROVIDERS.contains(&id) && !self.disabled.contains(id) }
    pub fn load() -> Self { std::fs::read(config_path()).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default() }
    pub fn save(&self) -> Result<(), String> {
        if self.disabled.iter().any(|id| !PROVIDERS.contains(&id.as_str())) { return Err("Unknown provider".into()); }
        let bytes = serde_json::to_vec_pretty(self).map_err(|_| "Could not encode settings")?;
        let path = config_path(); let staged = path.with_extension("tmp");
        std::fs::write(&staged, bytes).map_err(|_| "Could not save settings")?;
        std::fs::rename(staged, path).map_err(|_| "Could not replace settings".into())
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn defaults_enable_all_providers() { let s: Settings = serde_json::from_str("{}").unwrap(); for id in PROVIDERS { assert!(s.enabled(id)); } assert!(!s.enabled("unknown")); assert!(s.start_minimized); }
    #[test] fn disabled_providers_survive_round_trip() { let mut s = Settings::default(); s.disabled.insert("codex".into()); s.acrylic = false; s.start_minimized = false; let restored: Settings = serde_json::from_slice(&serde_json::to_vec(&s).unwrap()).unwrap(); assert!(!restored.enabled("codex")); assert!(restored.enabled("claude")); assert!(!restored.acrylic); assert!(!restored.start_minimized); }
}
