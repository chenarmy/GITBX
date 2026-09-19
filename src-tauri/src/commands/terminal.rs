use std::path::Path;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

use gitbx_core::{path_for_display, GitService};

/// Open a native terminal with the selected Git repository as its working directory.
///
/// The repository path is passed as an argument instead of being interpolated into
/// a shell command, so paths containing spaces cannot turn into extra commands.
#[tauri::command]
pub async fn open_system_terminal(repo_path: String) -> Result<(), String> {
    let repo_path = repo_path.trim();
    if repo_path.is_empty() {
        return Err("No repository is currently open".to_string());
    }

    let path = Path::new(repo_path);
    if !path.is_dir() {
        return Err(format!("Repository directory does not exist: {repo_path}"));
    }

    GitService::open(repo_path)
        .map_err(|error| format!("The selected directory is not a Git repository: {error}"))?;

    let path = std::fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve repository directory: {error}"))?;
    let path_string = path_for_display(&path);

    #[cfg(target_os = "windows")]
    {
        let launch_path = Path::new(&path_string);

        // Git Bash is the preferred Windows shell for Git work. The explicit
        // locations cover standard and per-user Git for Windows installs.
        let mut git_bash_candidates = vec![
            "git-bash.exe".to_string(),
            "C:\\Program Files\\Git\\git-bash.exe".to_string(),
            "C:\\Program Files (x86)\\Git\\git-bash.exe".to_string(),
        ];
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            git_bash_candidates.push(format!("{local_app_data}\\Programs\\Git\\git-bash.exe"));
        }
        for candidate in git_bash_candidates {
            if Command::new(&candidate)
                .arg(format!("--cd={path_string}"))
                .current_dir(launch_path)
                .env("CHERE_INVOKING", "1")
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }

        let escaped_path = path_string.replace('\'', "''");
        for shell in ["pwsh.exe", "powershell.exe"] {
            let command = format!("Set-Location -LiteralPath '{escaped_path}'");
            if Command::new(shell)
                .args(["-NoExit", "-Command", command.as_str()])
                .current_dir(launch_path)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }

        let command = if path_string.starts_with(r"\\") {
            format!("pushd \"{path_string}\"")
        } else {
            format!("cd /d \"{path_string}\"")
        };
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/K", command.as_str()]);
        if !path_string.starts_with(r"\\") {
            cmd.current_dir(launch_path);
        }
        cmd.spawn().map_err(|error| {
            format!("Failed to open Git Bash, PowerShell, or Command Prompt: {error}")
        })?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        // `open` passes the directory as a distinct argument, so spaces and
        // shell metacharacters never need AppleScript or shell escaping.
        Command::new("open")
            .args(["-a", "Terminal", path_string.as_str()])
            .spawn()
            .map_err(|error| format!("Failed to open a macOS terminal: {error}"))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let candidates = [
            (
                "x-terminal-emulator",
                ["--working-directory", path_string.as_str()],
            ),
            (
                "gnome-terminal",
                ["--working-directory", path_string.as_str()],
            ),
            ("konsole", ["--workdir", path_string.as_str()]),
            (
                "xfce4-terminal",
                ["--working-directory", path_string.as_str()],
            ),
            ("alacritty", ["--working-directory", path_string.as_str()]),
            ("kitty", ["--directory", path_string.as_str()]),
        ];

        for (program, args) in candidates {
            if Command::new(program).args(args).spawn().is_ok() {
                return Ok(());
            }
        }

        // Lightweight terminals generally inherit the launcher's current
        // directory and do not share a standard working-directory option.
        for program in ["mate-terminal", "tilix", "lxterminal", "xterm"] {
            if Command::new(program).current_dir(&path).spawn().is_ok() {
                return Ok(());
            }
        }

        Err(
            "No supported terminal emulator was found. Install a terminal emulator and try again."
                .to_string(),
        )
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = path_string;
        Err("Opening a system terminal is not supported on this platform".to_string())
    }
}

/// Open the repository in the platform's native file manager.
#[tauri::command]
pub async fn open_file_manager(repo_path: String) -> Result<(), String> {
    let repo_path = repo_path.trim();
    if repo_path.is_empty() {
        return Err("No repository is currently open".to_string());
    }
    let path = Path::new(repo_path);
    if !path.is_dir() {
        return Err(format!("Repository directory does not exist: {repo_path}"));
    }
    GitService::open(repo_path)
        .map_err(|error| format!("The selected directory is not a Git repository: {error}"))?;
    let path = std::fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve repository directory: {error}"))?;
    let path_string = path_for_display(&path);

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(&path_string)
            .spawn()
            .map_err(|error| format!("Failed to open File Explorer: {error}"))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path_string)
            .spawn()
            .map_err(|error| format!("Failed to open Finder: {error}"))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        for program in ["xdg-open", "gio"] {
            let mut command = Command::new(program);
            if program == "gio" {
                command.arg("open");
            }
            if command.arg(&path_string).spawn().is_ok() {
                return Ok(());
            }
        }
        Err("No supported file manager was found".to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = path_string;
        Err("Opening a file manager is not supported on this platform".to_string())
    }
}

/// Open the selected Git repository in a supported code editor.
#[tauri::command]
pub async fn open_in_editor(repo_path: String, editor: String) -> Result<(), String> {
    let repo_path = repo_path.trim();
    if repo_path.is_empty() {
        return Err("No repository is currently open".to_string());
    }

    let path = Path::new(repo_path);
    if !path.is_dir() {
        return Err(format!("Repository directory does not exist: {repo_path}"));
    }
    GitService::open(repo_path)
        .map_err(|error| format!("The selected directory is not a Git repository: {error}"))?;
    let path = std::fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve repository directory: {error}"))?;
    // Electron-based launchers can reject Windows verbatim paths such as
    // `\\?\D:\repo`, even though the same path is valid for filesystem APIs.
    let display_path = path_for_display(&path);
    let launch_path = Path::new(&display_path);

    match editor.trim().to_ascii_lowercase().as_str() {
        "vscode" => open_vscode(launch_path),
        "idea" => open_intellij_idea(launch_path),
        _ => Err(format!("Unsupported editor: {editor}")),
    }
}

#[cfg(target_os = "windows")]
fn windows_app_path_candidates(relative_paths: &[&str]) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Ok(root) = std::env::var(variable) {
            candidates.extend(
                relative_paths
                    .iter()
                    .map(|relative| Path::new(&root).join(relative)),
            );
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn registry_default_value(key: &str) -> Option<String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let (hive, subkey) = key.split_once('\\')?;
    let root = match hive {
        "HKCU" => RegKey::predef(HKEY_CURRENT_USER),
        "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
        "HKCR" => RegKey::predef(HKEY_CLASSES_ROOT),
        _ => return None,
    };
    root.open_subkey(subkey).ok()?.get_value("").ok()
}

#[cfg(target_os = "windows")]
fn executable_from_registry_command(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim();
    let executable = if let Some(rest) = trimmed.strip_prefix('"') {
        rest.split_once('"').map(|(path, _)| path)?
    } else {
        trimmed.split_whitespace().next()?
    };
    let path = PathBuf::from(executable);
    path.is_file().then_some(path)
}

#[cfg(target_os = "windows")]
fn vscode_registry_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for key in [
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\Code.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Code - Insiders.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\Code - Insiders.exe",
    ] {
        if let Some(value) = registry_default_value(key) {
            let path = PathBuf::from(value);
            if path.is_file() {
                candidates.push(path);
            }
        }
    }
    for key in [
        r"HKCU\Software\Classes\vscode\shell\open\command",
        r"HKCR\vscode\shell\open\command",
        r"HKCU\Software\Classes\vscode-insiders\shell\open\command",
        r"HKCR\vscode-insiders\shell\open\command",
    ] {
        if let Some(path) = registry_default_value(key)
            .as_deref()
            .and_then(executable_from_registry_command)
        {
            candidates.push(path);
        }
    }
    candidates.sort();
    candidates.dedup();
    candidates
}

#[cfg(target_os = "windows")]
fn push_idea_from_install_dir(candidates: &mut Vec<PathBuf>, install_dir: &Path) {
    for executable in ["idea64.exe", "idea.exe"] {
        candidates.push(install_dir.join("bin").join(executable));
        candidates.push(install_dir.join(executable));
    }
}

#[cfg(target_os = "windows")]
fn path_from_display_icon(value: &str) -> Option<PathBuf> {
    let value = value.trim();
    let without_index = value.rsplit_once(',').map_or(value, |(path, suffix)| {
        if suffix.trim().parse::<i32>().is_ok() {
            path
        } else {
            value
        }
    });
    let path = PathBuf::from(without_index.trim().trim_matches('"'));
    path.is_file().then_some(path)
}

#[cfg(target_os = "windows")]
fn idea_registry_candidates() -> Vec<PathBuf> {
    use winreg::enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };
    use winreg::RegKey;

    let mut candidates = Vec::new();
    for key in [
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\idea64.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\idea64.exe",
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\idea.exe",
        r"HKLM\Software\Microsoft\Windows\CurrentVersion\App Paths\idea.exe",
    ] {
        if let Some(value) = registry_default_value(key) {
            candidates.push(PathBuf::from(value.trim().trim_matches('"')));
        }
    }
    let uninstall_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        for view in [KEY_READ | KEY_WOW64_64KEY, KEY_READ | KEY_WOW64_32KEY] {
            let Ok(uninstall) = RegKey::predef(hive).open_subkey_with_flags(uninstall_key, view)
            else {
                continue;
            };
            for name in uninstall.enum_keys().filter_map(Result::ok) {
                let Ok(product) = uninstall.open_subkey_with_flags(&name, view) else {
                    continue;
                };
                let display_name = product
                    .get_value::<String, _>("DisplayName")
                    .unwrap_or_default();
                if !display_name.to_ascii_lowercase().contains("intellij idea") {
                    continue;
                }
                if let Ok(install_location) = product.get_value::<String, _>("InstallLocation") {
                    push_idea_from_install_dir(&mut candidates, Path::new(&install_location));
                }
                if let Ok(display_icon) = product.get_value::<String, _>("DisplayIcon") {
                    if let Some(path) = path_from_display_icon(&display_icon) {
                        candidates.push(path);
                    }
                }
            }
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn fixed_drive_roots() -> Vec<PathBuf> {
    use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};

    const DRIVE_FIXED: u32 = 3;

    let mask = unsafe { GetLogicalDrives() };
    (0..26)
        .filter(|index| mask & (1 << index) != 0)
        .filter_map(|index| {
            let letter = (b'A' + index as u8) as char;
            let root = format!(r"{letter}:\");
            let wide = root
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect::<Vec<_>>();
            (unsafe { GetDriveTypeW(wide.as_ptr()) } == DRIVE_FIXED).then(|| PathBuf::from(root))
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn is_idea_executable(path: &Path) -> bool {
    path.is_file()
        && path.file_name().is_some_and(|name| {
            name.eq_ignore_ascii_case("idea64.exe") || name.eq_ignore_ascii_case("idea.exe")
        })
}

/// Last-resort native filesystem search for portable or custom IDEA installs.
/// The time and directory budgets keep a missing application from freezing the UI.
#[cfg(target_os = "windows")]
fn find_idea_on_fixed_drives() -> Vec<PathBuf> {
    const MAX_DIRECTORIES: usize = 120_000;
    const MAX_DEPTH: usize = 8;
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut found = Vec::new();
    let mut pending = fixed_drive_roots()
        .into_iter()
        .map(|path| (path, 0usize))
        .collect::<Vec<_>>();
    let mut visited = 0usize;

    while let Some((directory, depth)) = pending.pop() {
        if depth > MAX_DEPTH || visited >= MAX_DIRECTORIES || Instant::now() >= deadline {
            break;
        }
        visited += 1;
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_file() && is_idea_executable(&path) {
                // A real IDEA launcher lives in a bin directory. Requiring this avoids
                // accepting unrelated files that merely share the executable name.
                if path
                    .parent()
                    .and_then(Path::file_name)
                    .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
                {
                    found.push(path);
                }
            } else if file_type.is_dir() && depth < MAX_DEPTH {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !matches!(
                    name.as_str(),
                    "$recycle.bin"
                        | "system volume information"
                        | "windows"
                        | "winsxs"
                        | "node_modules"
                        | "target"
                        | ".git"
                ) {
                    pending.push((path, depth + 1));
                }
            }
        }
    }
    found
}

#[cfg(target_os = "windows")]
fn deduplicate_existing_paths(candidates: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|path| is_idea_executable(path))
        .filter(|path| seen.insert(path.to_string_lossy().to_ascii_lowercase()))
        .collect()
}

fn open_vscode(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates = vec![PathBuf::from("code.exe")];
        candidates.extend(vscode_registry_candidates());
        candidates.extend(windows_app_path_candidates(&[
            "Programs\\Microsoft VS Code\\Code.exe",
            "Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe",
            "Microsoft VS Code\\Code.exe",
            "Microsoft VS Code Insiders\\Code - Insiders.exe",
        ]));
        for program in candidates {
            if Command::new(program).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for application in ["Visual Studio Code", "Visual Studio Code - Insiders"] {
            if Command::new("open")
                .args(["-a", application, "--args"])
                .arg(path)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for program in ["code", "code-insiders", "codium"] {
            if Command::new(program).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    Err("Visual Studio Code was not found. Install it or add its launcher to PATH.".to_string())
}

fn open_intellij_idea(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates = vec![PathBuf::from("idea64.exe"), PathBuf::from("idea.exe")];
        candidates.extend(idea_registry_candidates());
        candidates.extend(windows_app_path_candidates(&[
            "Programs\\IntelliJ IDEA\\bin\\idea64.exe",
            "Programs\\IntelliJ IDEA Community Edition\\bin\\idea64.exe",
            "Programs\\IntelliJ IDEA Ultimate\\bin\\idea64.exe",
            "JetBrains\\Toolbox\\scripts\\idea.exe",
            "JetBrains\\Toolbox\\scripts\\idea64.exe",
        ]));
        for variable in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(root) = std::env::var(variable) {
                let search_root = if variable == "LOCALAPPDATA" {
                    Path::new(&root)
                        .join("JetBrains")
                        .join("Toolbox")
                        .join("apps")
                } else {
                    Path::new(&root).join("JetBrains")
                };
                candidates.extend(find_idea_in_directory(&search_root, 6));
            }
        }
        let mut existing = deduplicate_existing_paths(candidates.clone());
        // PATH launchers do not have to resolve to a local path before spawning.
        existing.extend(
            candidates
                .drain(..)
                .filter(|path| path.components().count() == 1),
        );
        for program in existing {
            if Command::new(program).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
        for program in find_idea_on_fixed_drives() {
            if Command::new(program).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        for application in ["IntelliJ IDEA", "IntelliJ IDEA CE"] {
            if Command::new("open")
                .args(["-a", application, "--args"])
                .arg(path)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for program in [
            "idea",
            "idea.sh",
            "intellij-idea",
            "intellij-idea-community",
        ] {
            if Command::new(program).arg(path).spawn().is_ok() {
                return Ok(());
            }
        }
        for application_id in [
            "com.jetbrains.IntelliJ-IDEA-Ultimate",
            "com.jetbrains.IntelliJ-IDEA-Community",
        ] {
            if Command::new("flatpak")
                .args(["run", application_id])
                .arg(path)
                .spawn()
                .is_ok()
            {
                return Ok(());
            }
        }
    }

    Err("IntelliJ IDEA was not found. Install it or add its launcher to PATH.".to_string())
}

#[cfg(target_os = "windows")]
fn find_idea_in_directory(root: &Path, depth: usize) -> Vec<PathBuf> {
    if depth == 0 || !root.is_dir() {
        return Vec::new();
    }
    let mut found = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return found;
    };
    let mut entries = entries.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for entry in entries {
        let path = entry.path();
        if is_idea_executable(&path) {
            found.push(path);
        } else if path.is_dir() {
            found.extend(find_idea_in_directory(&path, depth - 1));
        }
    }
    found
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn finds_idea_in_a_custom_install_directory() {
        let root = tempfile::tempdir().expect("create temporary directory");
        let bin = root.path().join("custom").join("JetBrains IDE").join("bin");
        std::fs::create_dir_all(&bin).expect("create custom IDEA directory");
        let executable = bin.join("idea64.exe");
        std::fs::write(&executable, []).expect("create mock executable");

        assert_eq!(find_idea_in_directory(root.path(), 5), vec![executable]);
    }

    #[test]
    fn parses_a_registry_display_icon_path() {
        let root = tempfile::tempdir().expect("create temporary directory");
        let executable = root.path().join("idea64.exe");
        std::fs::write(&executable, []).expect("create mock executable");
        let value = format!("\"{}\",0", executable.display());

        assert_eq!(path_from_display_icon(&value), Some(executable));
    }
}
