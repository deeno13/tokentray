use std::path::PathBuf;
pub fn config_path() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("TokenTray").join("config.json")
}

