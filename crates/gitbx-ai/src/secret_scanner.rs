use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretDetection {
    pub rule_name: String,
    pub line_number: usize,
    pub matched_snippet: String,
    pub severity: String, // "High", "Critical", "Medium"
}

use std::sync::OnceLock;

static COMPILED_RULES: OnceLock<Vec<(&'static str, Regex, &'static str)>> = OnceLock::new();

fn get_rules() -> &'static [(&'static str, Regex, &'static str)] {
    COMPILED_RULES.get_or_init(|| {
        let raw_rules = [
            (
                "AWS Access Key",
                r"(?i)AKIA[0-9A-Z]{16}",
                "Critical",
            ),
            (
                "Private Key",
                r"-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----",
                "Critical",
            ),
            (
                "GitHub Personal Access Token",
                r"ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82}",
                "Critical",
            ),
            (
                "Generic API Key / Token",
                r#"(?i)(api_key|apikey|secret_key|app_secret|auth_token)\s*[:=]\s*['"][0-9a-zA-Z\-_]{16,}['"]"#,
                "High",
            ),
        ];

        raw_rules
            .into_iter()
            .filter_map(|(name, pat, sev)| Regex::new(pat).ok().map(|re| (name, re, sev)))
            .collect()
    })
}

fn mask_snippet(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 8 {
        "*".repeat(chars.len())
    } else {
        let prefix: String = chars[..4].iter().collect();
        let suffix: String = chars[chars.len() - 4..].iter().collect();
        format!("{prefix}****{suffix}")
    }
}

pub struct SecretScanner;

impl Default for SecretScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretScanner {
    pub fn new() -> Self {
        let _ = get_rules();
        Self
    }

    pub fn scan_diff(&self, diff_content: &str) -> Vec<SecretDetection> {
        let mut detections = Vec::new();
        let rules = get_rules();

        for (lineno, line) in diff_content.lines().enumerate() {
            // Only scan added lines in diffs
            if !line.starts_with('+') || line.starts_with("+++") {
                continue;
            }

            for (rule_name, re, severity) in rules {
                if let Some(mat) = re.find(line) {
                    detections.push(SecretDetection {
                        rule_name: rule_name.to_string(),
                        line_number: lineno + 1,
                        matched_snippet: mask_snippet(mat.as_str()),
                        severity: severity.to_string(),
                    });
                }
            }
        }

        detections
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_scanner_detection_and_masking() {
        let scanner = SecretScanner::new();
        let diff = "+AKIA1234567890ABCDEF\n+regular line\n-AKIA9999999999ZZZZZZ";
        let detections = scanner.scan_diff(diff);

        assert_eq!(detections.len(), 1);
        assert_eq!(detections[0].rule_name, "AWS Access Key");
        assert_eq!(detections[0].line_number, 1);
        assert_eq!(detections[0].matched_snippet, "AKIA****CDEF");
    }

    #[test]
    fn test_secret_scanner_ignores_context_and_deletions() {
        let scanner = SecretScanner::new();
        let diff = "+++ b/config.json\n-ghp_123456789012345678901234567890123456\n ghp_123456789012345678901234567890123456";
        let detections = scanner.scan_diff(diff);
        assert!(detections.is_empty());
    }
}
