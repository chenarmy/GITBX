use std::process::Command;

/// Builds a child process that does not create a transient console window on Windows.
///
/// GITBX captures stdout/stderr for background Git operations, so showing a console
/// window is both unnecessary and disruptive. Other platforms keep the standard
/// process behavior.
pub(crate) fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[cfg(target_os = "windows")]
    let mut command = Command::new(program);
    #[cfg(not(target_os = "windows"))]
    let command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Creates a hidden Git command, locating Git on Windows from known standard paths
/// if available, and disabling interactive terminal prompts to prevent hanging.
pub(crate) fn create_git_command() -> Command {
    let mut command = {
        #[cfg(target_os = "windows")]
        {
            let mut selected = None;
            for candidate in &[
                r"C:\Program Files\Git\cmd\git.exe",
                r"C:\Program Files\Git\bin\git.exe",
                r"C:\Program Files (x86)\Git\cmd\git.exe",
                r"C:\Program Files (x86)\Git\bin\git.exe",
                "git",
            ] {
                if *candidate == "git" || std::path::Path::new(candidate).exists() {
                    selected = Some(hidden_command(candidate));
                    break;
                }
            }
            selected.unwrap_or_else(|| hidden_command("git"))
        }
        #[cfg(not(target_os = "windows"))]
        {
            hidden_command("git")
        }
    };
    command.env("GIT_TERMINAL_PROMPT", "0");
    command
}
