use std::process::Command;

/// Builds a child process that does not create a transient console window on Windows.
///
/// GITBX captures stdout/stderr for background Git operations, so showing a console
/// window is both unnecessary and disruptive. Other platforms keep the standard
/// process behavior.
pub(crate) fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
