//! Fixture recorder actor — captures real device responses to files.
//!
//! IO: SSH to a device, run commands, write output to disk.
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
pub fn write_fixture(dir: &Path, command: &str, output: &str, metadata: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(dir)?;

    let (filename, content) = if command == "__manifest__" {
        ("__manifest__.json".to_string(), output.to_string())
    } else if command == "__connect_banner__" {
        ("__connect_banner__.txt".to_string(), output.to_string())
    } else if command == "__prompt_pattern__" {
        ("__prompt_pattern__.txt".to_string(), output.to_string())
    } else {
        let safe_name = command
            .replace(" | ", "__")
            .replace(' ', "_")
            .replace('/', "_")
            + ".txt";
        
        // Prepend metadata as a comment header
        let content = format!(
            "# Recorded from: {}\n# Command: {}\n# Recorded at: {}\n---\n{}",
            metadata, command, chrono::Utc::now().to_rfc3339(), output
        );
        (safe_name, content)
    };

    let path = dir.join(&filename);
    std::fs::write(&path, &content)?;
    
    Ok(path)
}

/// List all fixture files in a directory.
pub fn list_fixtures(dir: &Path) -> Result<Vec<(String, PathBuf)>> {
    let mut fixtures = Vec::new();
    
    if !dir.exists() {
        return Ok(fixtures);
    }

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "txt" || e == "json") {
            let stem = path.file_stem().unwrap().to_string_lossy();
            let command = stem
                .replace("__", " | ")
                .replace('_', " ");
            fixtures.push((command, path));
        }
    }

    Ok(fixtures)
}
