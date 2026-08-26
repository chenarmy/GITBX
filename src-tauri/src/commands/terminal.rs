use std::path::Path;
use std::process::Command;

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
