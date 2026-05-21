//! Mock SSH server actor — simulated device for testing.
//!
//! Starts a TCP listener that speaks SSH and responds to commands
//! based on .px simulation rules and fixture files.
//!
//! This is the Rust side-effect layer for netops-simulate.px:
//! - Accepts SSH connections (IO)
//! - Reads incoming commands (IO)
//! - Routes command to praxis simulation rules (logic)
//! - Sends response bytes back (IO)

use anyhow::Result;
use std::collections::HashMap;
use std::net::TcpListener;
use std::path::Path;
use std::sync::Arc;

/// A device personality loaded from fixtures.
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
///
/// Reads all .txt files in the directory as command→response mappings.
/// The filename is the command (with underscores replacing spaces/pipes).
/// The file content is the response.
pub fn load_personality(fixtures_dir: &Path) -> Result<Personality> {
    let manifest_path = fixtures_dir.join("__manifest__.json");
    let manifest: serde_json::Value = if manifest_path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&manifest_path)?)?
    } else {
        serde_json::json!({
            "vendor": "unknown",
            "vendor_family": "unknown",
            "prompt": "#"
        })
    };

    let mut fixtures = HashMap::new();

    for entry in std::fs::read_dir(fixtures_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "txt") {
            // Filename → command (reverse the encoding)
            let stem = path.file_stem().unwrap().to_string_lossy();
            let command = stem
                .replace("__", " | ")
                .replace("_", " ");
            let content = std::fs::read_to_string(&path)?;
            fixtures.insert(command, content);
        }
    }

    Ok(Personality {
        vendor: manifest["vendor"].as_str().unwrap_or("unknown").to_string(),
        vendor_family: manifest["vendor_family"].as_str().unwrap_or("unknown").to_string(),
        prompt: manifest["prompt"].as_str().unwrap_or("#").to_string(),
        fixtures,
    })
}

/// Start the mock SSH server.
///
/// Blocks the current thread, accepting connections and responding
/// to commands based on the loaded personality.
///
/// In production use, this runs in a background thread or tokio task.
pub fn start_server(config: MockServerConfig) -> Result<()> {
    let listener = TcpListener::bind(format!("{}:{}", config.bind_addr, config.port))?;
    let personality = Arc::new(config.personality);

    eprintln!(
        "Mock SSH server ({}) listening on {}:{}",
        personality.vendor, config.bind_addr, config.port
    );

    for stream in listener.incoming() {
        let stream = stream?;
        let personality = Arc::clone(&personality);
        let username = config.username.clone();
        let password = config.password.clone();

        std::thread::spawn(move || {
            if let Err(e) = handle_client(stream, &personality, &username, &password) {
                eprintln!("Client handler error: {}", e);
            }
        });
    }

    Ok(())
}

/// Handle a single SSH client connection.
fn handle_client(
    _stream: std::net::TcpStream,
    _personality: &Personality,
    _username: &str,
    _password: &str,
) -> Result<()> {
    // TODO: Implement SSH server using russh or thrussh crate
    // For now, this is a skeleton that will be filled in with:
    // 1. SSH handshake (accept connection, auth)
    // 2. PTY/shell request handling
    // 3. Command routing to personality fixtures
    // 4. Prompt injection between responses
    //
    // The routing logic itself calls into the praxis engine:
    //   praxis.evaluate("netops.simulate.handle_command", {
    //     command: received_command,
    //     personality: personality,
    //   })
    //
    // This keeps the IO boundary clean: Rust does TCP/SSH, praxis does routing.
    
    Ok(())
}
