use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretDetection {
    pub rule_name: String,
    pub line_number: usize,
    pub matched_snippet: String,
    pub severity: String, // "High", "Critical", "Medium"
}

pub struct SecretScanner {
    rules: Vec<(&'static str, Regex, &'static str)>,
}

impl Default for SecretScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretScanner {
    pub fn new() -> Self {
        let rules = vec![
            (
                "AWS Access Key",
                Regex::new(r"(?i)AKIA[0-9A-Z]{16}").unwrap(),
                "Critical",
            ),
            (
                "Private Key",
                Regex::new(r"-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----").unwrap(),
                "Critical",
            ),
            (
                "GitHub Personal Access Token",
                Regex::new(r"ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82}").unwrap(),
                "Critical",
            ),
            (
                "Generic API Key / Token",
                Regex::new(r#"(?i)(api_key|apikey|secret_key|app_secret|auth_token)\s*[:=]\s*['"][0-9a-zA-Z\-_]{16,}['"]"#).unwrap(),
                "High",
            ),
        ];

        Self { rules }
    }

    pub fn scan_diff(&self, diff_content: &str) -> Vec<SecretDetection> {
        let mut detections = Vec::new();

        for (lineno, line) in diff_content.lines().enumerate() {
            // Only scan added lines in diffs
            if !line.starts_with('+') || line.starts_with("+++") {
                continue;
            }

            for (rule_name, re, severity) in &self.rules {
                if let Some(mat) = re.find(line) {
                    detections.push(SecretDetection {
                        rule_name: rule_name.to_string(),
                        line_number: lineno + 1,
                        matched_snippet: mat.as_str().to_string(),
                        severity: severity.to_string(),
                    });
                }
            }
        }

        detections
    }
}
