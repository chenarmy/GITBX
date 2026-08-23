use std::path::Path;
use std::process::Command;

use gitbx_core::GitService;

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
    let path_string = path.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    {
        // Prefer Windows Terminal, but keep classic Command Prompt as a fallback.
        if Command::new("wt.exe")
            .args(["-d", path_string.as_str()])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }

        let command = format!("cd /d \"{path_string}\"");
        Command::new("cmd.exe")
            .args(["/K", command.as_str()])
            .spawn()
            .map_err(|error| format!("Failed to open a Windows terminal: {error}"))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let script_path = path_string.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "tell application \"Terminal\" to do script \"cd -- \" & quoted form of \"{script_path}\""
        );
        Command::new("osascript")
            .args(["-e", script.as_str()])
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
