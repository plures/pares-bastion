//! SSH connection actor — establishes SSH sessions to network devices.
//!
//! This is pure IO: connect TCP, negotiate SSH, authenticate, return channel.
//! All decision logic (which vendor to try, timeout handling, fallback)
//! lives in praxis/netops-scan.px.

use anyhow::Result;
use std::net::TcpStream;
use std::time::Duration;

/// Parameters for establishing an SSH connection.
pub struct SshConnectParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub timeout: Duration,
    /// Disable SSH key auth (avoids searching for ~/.ssh/id_rsa on Windows)
    pub use_keys: bool,
    /// Disable SSH agent forwarding
    pub allow_agent: bool,
}

/// Result of a successful SSH connection.
pub struct SshConnection {
    pub session: ssh2::Session,
    pub banner: String,
    pub prompt: String,
}

/// Establish SSH connection to a network device.
///
/// This actor handles:
/// - TCP connection with timeout
/// - SSH handshake (including legacy KEX for old devices)
/// - Password authentication
/// - Initial banner/prompt capture
///
/// It does NOT handle:
/// - Vendor detection (praxis rule)
/// - Retry logic (praxis procedure)
/// - Terminal negotiation commands (praxis procedure)
pub fn connect(params: &SshConnectParams) -> Result<SshConnection> {
    // TCP connect with timeout
    let tcp = TcpStream::connect_timeout(
        &format!("{}:{}", params.host, params.port).parse()?,
        params.timeout,
    )?;
    tcp.set_read_timeout(Some(params.timeout))?;

    // SSH session setup
    let mut session = ssh2::Session::new()?;
    session.set_tcp_stream(tcp);
    session.set_timeout(params.timeout.as_millis() as u32);
    
    // Enable legacy algorithms for old devices (Brocade, old Cisco)
    // ssh2 crate uses libssh2 which still supports group14-sha1
    session.handshake()?;

    // Authenticate
    if !params.use_keys {
        session.userauth_password(&params.username, &params.password)?;
    } else {
        // Try key-based auth first, fall back to password
        if session.userauth_agent(&params.username).is_err() {
            session.userauth_password(&params.username, &params.password)?;
        }
    }

    if !session.authenticated() {
        anyhow::bail!("SSH authentication failed for {}@{}", params.username, params.host);
    }

    // Open channel and capture banner
    let mut channel = session.channel_session()?;
    channel.request_pty("xterm", None, None)?;
    channel.shell()?;

    // Read initial banner/prompt
    let mut banner = String::new();
    let mut buf = [0u8; 4096];
    std::thread::sleep(Duration::from_millis(500));
    if let Ok(n) = channel.read(&mut buf) {
        banner = String::from_utf8_lossy(&buf[..n]).to_string();
    }

    // Extract prompt from end of banner
    let prompt = banner.lines().last().unwrap_or("").to_string();

    Ok(SshConnection {
        session,
        banner,
        prompt,
    })
}
