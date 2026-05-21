//! Mock SSH server actor — simulated device for testing.
//!
//! Uses russh to accept SSH connections and respond to commands
//! based on loaded fixture files. The routing logic is driven by
//! praxis/netops-simulate.px rules.

use anyhow::Result;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

/// A device personality loaded from fixtures.
#[derive(Clone)]
pub struct Personality {
    pub vendor: String,
    pub vendor_family: String,
    pub prompt: String,
    pub fixtures: HashMap<String, String>,
}

/// Configuration for the mock SSH server.
pub struct MockServerConfig {
    pub bind_addr: String,
    pub port: u16,
    pub personality: Personality,
    pub username: String,
    pub password: String,
}

/// Load a personality from a fixtures directory.
pub fn load_personality(fixtures_dir: &Path) -> Result<Personality> {
    let manifest_path = fixtures_dir.join("__manifest__.json");
    let (vendor, vendor_family, prompt) = if manifest_path.exists() {
        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&manifest_path)?)?;
        (
            manifest["vendor"].as_str().unwrap_or("unknown").to_string(),
            manifest["vendor_family"].as_str().unwrap_or("unknown").to_string(),
            manifest["prompt"].as_str().unwrap_or("#").to_string(),
        )
    } else {
        ("unknown".to_string(), "unknown".to_string(), "#".to_string())
    };

    let fixtures = super::fixture_recorder::load_fixtures(fixtures_dir)?;

    Ok(Personality {
        vendor,
        vendor_family,
        prompt,
        fixtures,
    })
}

/// Find the best matching fixture for a command.
///
/// Tries exact match first, then partial (contains) match.
pub fn match_command(personality: &Personality, command: &str) -> Option<String> {
    // Exact match
    if let Some(response) = personality.fixtures.get(command) {
        return Some(response.clone());
    }
    // Partial match — find fixture whose key is contained in the command
    for (key, response) in &personality.fixtures {
        if command.contains(key.as_str()) || key.contains(command) {
            return Some(response.clone());
        }
    }
    None
}

/// Generate a vendor-appropriate error response.
pub fn error_response(vendor_family: &str, command: &str) -> String {
    match vendor_family {
        "cisco" => format!("% Invalid input detected at '^' marker.\n"),
        "brocade" => format!("Invalid input -> {}\n", command),
        "juniper" => "unknown command.\n".to_string(),
        "nokia" => "Error: Bad command.\n".to_string(),
        "arista" => "% Invalid input\n".to_string(),
        _ => format!("% Unknown command: {}\n", command),
    }
}

/// Start the mock SSH server (async, uses russh).
///
/// This is a placeholder — full implementation requires russh server setup.
/// For now, documents the intended interface.
pub async fn start_server(_config: MockServerConfig) -> Result<()> {
    // TODO: Implement with russh::server
    //
    // The flow:
    // 1. Bind TCP, accept connections
    // 2. Perform SSH handshake (accept password auth)
    // 3. On shell request: send prompt
    // 4. On incoming data: parse command, match against personality fixtures
    // 5. Send response + prompt
    // 6. On "exit"/"quit": close channel
    //
    // The command routing calls into praxis:
    //   let response = praxis.evaluate("netops.simulate.handle_command", context);
    //
    // For the initial implementation, we route directly through match_command().
    
    anyhow::bail!("Mock SSH server not yet implemented — requires russh server wiring")
}

/// Start a mock server in a background tokio task, return the join handle.
pub fn spawn_server(
    config: MockServerConfig,
) -> tokio::task::JoinHandle<Result<()>> {
    tokio::spawn(async move { start_server(config).await })
}
