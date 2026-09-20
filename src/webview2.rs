//! WebView2 runtime detection.
//!
//! Without the Evergreen runtime a Tauri window cannot be created, and because
//! this is a `windows_subsystem = "windows"` binary the failure is silent: the
//! process starts, draws nothing, and exits. That looks identical to a broken
//! download. Check before building the window and say what is wrong instead.
//!
//! The runtime records itself under the EdgeUpdate client key for
//! {F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}. A per-machine install lands in HKLM
//! (under WOW6432Node on 64-bit Windows); a per-user install lands in HKCU.
//! Read with reg.exe, matching `autostart`, so this adds no dependency.

use std::process::Command;

const CLIENT: &str = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
pub const DOWNLOAD_URL: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

/// Read the `pv` version out of `reg query` output.
///
/// The runtime leaves the client key behind after an uninstall with `pv` set to
/// `0.0.0.0`, so a present key is not on its own proof that anything is
/// installed. Split out from the registry read so it stays testable.
pub fn installed_version(output: &str) -> Option<String> {
    for line in output.lines() {
        let mut parts = line.split_whitespace();
        if parts.next() != Some("pv") || parts.next() != Some("REG_SZ") {
            continue;
        }
        let version = parts.next().unwrap_or_default();
        if version.is_empty() || version == "0.0.0.0" {
            return None;
        }
        return Some(version.to_string());
    }
    None
}

fn query(key: &str) -> Option<String> {
    let mut command = Command::new("reg");
    command.args(["query", key, "/v", "pv"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// The installed runtime version, or `None` when it is missing.
pub fn detect() -> Option<String> {
    let keys = [
        format!(r"HKLM\SOFTWARE\WOW6432Node\{CLIENT}"),
        format!(r"HKLM\SOFTWARE\{CLIENT}"),
        format!(r"HKCU\SOFTWARE\{CLIENT}"),
    ];
    keys.iter().find_map(|key| query(key).as_deref().and_then(installed_version))
}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Open the runtime download page in the default browser.
#[cfg(windows)]
fn open_download_page() {
    let mut command = Command::new("cmd");
    command.args(["/c", "start", "", DOWNLOAD_URL]);
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let _ = command.spawn();
}

/// Exit with an explanation when the runtime is missing.
///
/// Called before the Tauri builder runs. Offers the download page rather than
/// installing anything: monitoring never changes machine state on its own.
#[cfg(windows)]
pub fn require() {
    if detect().is_some() {
        return;
    }
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDOK, MB_ICONERROR, MB_OKCANCEL,
    };
    let text = wide(
        "TokenTray needs the Microsoft Edge WebView2 Runtime to draw its flyout, \
         and it is not installed on this PC.\n\n\
         Choose OK to open the download page. Install the Evergreen Runtime, \
         then start TokenTray again.",
    );
    let caption = wide("TokenTray");
    let choice = unsafe {
        MessageBoxW(
            None,
            windows::core::PCWSTR(text.as_ptr()),
            windows::core::PCWSTR(caption.as_ptr()),
            MB_ICONERROR | MB_OKCANCEL,
        )
    };
    if choice == IDOK {
        open_download_page();
    }
    std::process::exit(1);
}

#[cfg(not(windows))]
pub fn require() {}

#[cfg(test)]
mod tests {
    use super::*;

    const PRESENT: &str = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\r\n    pv    REG_SZ    138.0.3351.65\r\n\r\n";

    #[test]
    fn reads_the_version_from_reg_output() {
        assert_eq!(installed_version(PRESENT), Some("138.0.3351.65".into()));
    }

    #[test]
    fn an_uninstalled_runtime_leaves_a_zero_version_behind() {
        let out = "    pv    REG_SZ    0.0.0.0\r\n";
        assert!(installed_version(out).is_none());
    }

    #[test]
    fn missing_or_empty_values_are_not_an_install() {
        assert!(installed_version("").is_none());
        assert!(installed_version("ERROR: The system was unable to find the specified registry key").is_none());
        assert!(installed_version("    pv    REG_SZ    \r\n").is_none());
    }

    #[test]
    fn other_values_under_the_same_key_are_ignored() {
        let out = "    name    REG_SZ    pv\r\n    pv    REG_SZ    1.2.3.4\r\n";
        assert_eq!(installed_version(out), Some("1.2.3.4".into()));
    }
}
