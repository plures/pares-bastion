//! Device command actor — sends a CLI command and returns the output.
//!
//! Pure IO: write command bytes to SSH channel, read response bytes.
//! No parsing, no interpretation — that's praxis logic.

use anyhow::Result;
use std::io::{Read, Write};
use std::time::Duration;

/// Send a command to a connected SSH channel and return the raw output.
///
/// Handles:
/// - Writing command + newline
/// - Waiting for prompt to reappear
/// - Stripping command echo and trailing prompt
pub fn send_command(
    channel: &mut ssh2::Channel,
    command: &str,
    prompt_pattern: &str,
    timeout: Duration,
) -> Result<String> {
    channel.write_all(format!("{}\n", command).as_bytes())?;
    channel.flush()?;

    let mut output = String::new();
    let mut buf = [0u8; 8192];
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Timeout waiting for response to '{}'", command);
        }

        match channel.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                output.push_str(&chunk);
                if output.contains(prompt_pattern) {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            Err(e) => return Err(e.into()),
        }
    }

    // Strip command echo (first line) and trailing prompt
    let lines: Vec<&str> = output.lines().collect();
    let cleaned = if lines.len() > 1 {
        let end = if lines.last().map_or(false, |l| l.contains(prompt_pattern)) {
            lines.len() - 1
        } else {
            lines.len()
        };
        lines[1..end].join("\n")
    } else {
        output.clone()
    };

    Ok(cleaned)
}
