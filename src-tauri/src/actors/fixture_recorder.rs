//! Fixture recorder actor — captures real device responses to files.
//!
//! IO: write captured command output to disk as fixture files.
//! The praxis procedure (netops-record.px) orchestrates which commands
//! to run and how to organize the output.

use anyhow::Result;
use std::path::{Path, PathBuf};

/// Write a captured fixture to disk.
///
/// Filename is derived from the command:
///   "show version" → "show_version.txt"
///   "show running-config | include snmp" → "show_running-config__include_snmp.txt"
///   "__manifest__" → "__manifest__.json"
pub fn write_fixture(dir: &Path, command: &str, output: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;

    let (filename, content) = if command.starts_with("__") && command.ends_with("__") {
        let ext = if command == "__manifest__" { "json" } else { "txt" };
        (format!("{}.{}", command, ext), output.to_string())
    } else {
        let safe_name = command
            .replace(" | ", "__")
            .replace(' ', "_")
            .replace('/', "_")
            + ".txt";
        let content = format!(
            "# Command: {}\n# Recorded: {}\n---\n{}",
            command,
            chrono::Utc::now().to_rfc3339(),
            output
        );
        (safe_name, content)
    };

    let path = dir.join(&filename);
    std::fs::write(&path, &content)?;
    Ok(path)
}

/// Load all fixture files from a directory into a command→response map.
pub fn load_fixtures(dir: &Path) -> Result<std::collections::HashMap<String, String>> {
    let mut fixtures = std::collections::HashMap::new();

    if !dir.exists() {
        return Ok(fixtures);
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "txt") {
            let stem = path.file_stem().unwrap().to_string_lossy();
            if stem.starts_with("__") {
                continue; // Skip metadata files
            }
            let command = stem.replace("__", " | ").replace('_', " ");
            let content = std::fs::read_to_string(&path)?;
            // Strip header (lines before ---)
            let body = if let Some(idx) = content.find("---\n") {
                content[idx + 4..].to_string()
            } else {
                content
            };
            fixtures.insert(command, body);
        }
    }

    Ok(fixtures)
}
