//! Start at sign-in: an HKCU\...\Run registry value (per user, no administrator needed).
//! The --startup launch respects the saved start-minimized preference.
//! Implemented with reg.exe, so no new dependency.

use std::process::Command;

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const NAME: &str = "TokenTray";

fn reg(args: &[&str]) -> Option<(bool, String)> {
    let mut c = Command::new("reg");
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    c.output().ok().map(|o| {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&o.stdout),
            String::from_utf8_lossy(&o.stderr)
        );
        (o.status.success(), text)
    })
}

pub fn is_enabled() -> bool {
    reg(&["query", RUN_KEY, "/v", NAME])
        .map(|(ok, out)| ok && out.contains(NAME))
        .unwrap_or(false)
}

fn startup_command(exe: &std::path::Path) -> String { format!("\"{}\" --startup",exe.display()) }

// Explicit opens override preferences; automatic launches never disturb an existing instance.
pub fn should_show(args: &[String], start_minimized: bool, existing: bool) -> bool {
    let has=|flag| args.iter().any(|arg|arg==flag);
    if has("--inspect") || has("--show") {return true;}
    if has("--silent") || (existing && has("--startup")) {return false;}
    existing || !start_minimized
}

pub fn enable() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let val = startup_command(&exe);
    match reg(&["add", RUN_KEY, "/v", NAME, "/t", "REG_SZ", "/d", &val, "/f"]) {
        Some((true, _)) if is_enabled() => Ok("Start with Windows enabled".into()),
        Some((true, _)) => Err("Windows did not save the startup entry.".into()),
        Some((false, _)) => Err("Could not enable Windows startup.".into()),
        None => Err("reg.exe failed to run".into()),
    }
}

pub fn disable() -> Result<String, String> {
    if !is_enabled() {return Ok("Start with Windows is off".into());}
    match reg(&["delete", RUN_KEY, "/v", NAME, "/f"]) {
        Some((true, _)) => Ok("start at sign-in disabled".into()),
        Some((false, _)) => Err("Could not disable Windows startup.".into()),
        None => Err("reg.exe failed to run".into()),
    }
}



#[cfg(test)] mod tests {
    use super::*;
    fn args(flags:&[&str])->Vec<String>{flags.iter().map(|s|s.to_string()).collect()}
    #[test] fn startup_command_quotes_paths_with_spaces(){assert_eq!(startup_command(std::path::Path::new(r"C:\Program Files\TokenTray\tokentray.exe")),r#""C:\Program Files\TokenTray\tokentray.exe" --startup"#);}
    #[test] fn launch_respects_minimized_preference(){assert!(!should_show(&args(&[]),true,false));assert!(should_show(&args(&[]),false,false));assert!(!should_show(&args(&["--startup"]),true,false));assert!(should_show(&args(&["--startup"]),false,false));}
    #[test] fn silent_and_explicit_open_flags_work(){assert!(!should_show(&args(&["--silent"]),false,false));assert!(should_show(&args(&["--show"]),true,false));assert!(should_show(&args(&["--inspect"]),true,false));}
    #[test] fn automatic_second_launch_never_steals_focus(){assert!(!should_show(&args(&["--startup"]),false,true));assert!(!should_show(&args(&["--silent"]),false,true));assert!(should_show(&args(&[]),true,true));}
}
