//! Ping actor — ICMP reachability check.
//!
//! Pure IO: send ICMP echo, wait for reply.
//! Praxis procedure handles which hosts to ping and concurrency.

use anyhow::Result;
use std::time::Duration;

/// Ping a single host, return true if reachable.
pub fn ping_host(host: &str, timeout: Duration) -> Result<bool> {
    // Use system ping command for portability
    let count_flag = if cfg!(windows) { "-n" } else { "-c" };
    let timeout_flag = if cfg!(windows) { "-w" } else { "-W" };
    let timeout_val = if cfg!(windows) {
        format!("{}", timeout.as_millis())
    } else {
        format!("{}", timeout.as_secs())
    };

    let output = std::process::Command::new("ping")
        .args([count_flag, "1", timeout_flag, &timeout_val, host])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()?;

    Ok(output.success())
}

/// Ping multiple hosts concurrently, return list of reachable ones.
pub fn ping_sweep(hosts: &[String], concurrency: usize, timeout: Duration) -> Vec<String> {
    use std::sync::mpsc;
    use std::thread;

    let (tx, rx) = mpsc::channel();
    let hosts: Vec<String> = hosts.to_vec();

    // Simple thread pool
    let chunk_size = (hosts.len() + concurrency - 1) / concurrency;
    for chunk in hosts.chunks(chunk_size) {
        let chunk = chunk.to_vec();
        let tx = tx.clone();
        let timeout = timeout;
        thread::spawn(move || {
            for host in chunk {
                if ping_host(&host, timeout).unwrap_or(false) {
                    let _ = tx.send(host);
                }
            }
        });
    }
    drop(tx);

    let mut reachable: Vec<String> = rx.into_iter().collect();
    reachable.sort();
    reachable
}
