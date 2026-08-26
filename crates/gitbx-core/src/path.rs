use std::path::Path;

/// Converts an operating-system path into a stable, user-facing string.
///
/// Windows may return verbatim paths (for example `\\?\C:\repo`) from
/// `canonicalize`. Those paths are useful internally, but should not leak into
/// the UI or persisted repository list.
pub fn path_for_display(path: &Path) -> String {
    let value = path.to_string_lossy();

    #[cfg(target_os = "windows")]
    {
        if let Some(unc_path) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc_path}");
        }
        value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
    }

    #[cfg(not(target_os = "windows"))]
    value.into_owned()
}

#[cfg(test)]
mod tests {
    use super::path_for_display;
    use std::path::Path;

    #[test]
    fn preserves_regular_paths() {
        let value = if cfg!(target_os = "windows") {
            r"C:\repo"
        } else {
            "/tmp/repo"
        };
        assert_eq!(path_for_display(Path::new(value)), value);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn strips_windows_verbatim_prefixes() {
        assert_eq!(path_for_display(Path::new(r"\\?\I:\GITBX")), r"I:\GITBX");
        assert_eq!(
            path_for_display(Path::new(r"\\?\UNC\server\share\repo")),
            r"\\server\share\repo"
        );
    }
}
