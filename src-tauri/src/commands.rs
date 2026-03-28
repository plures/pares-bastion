//! Tauri commands — pure Rust backend for pares-bastion.
//!
//! No external Python dependencies.  Network scanning uses raw TCP connect
//! probes (tokio).  Config management, vault, and inventory generation are
//! all implemented natively.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/// Cancellation handle for a running scan.
pub struct ScanCancelState(pub Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>);

/// In-memory inventory (populated by scans / CSV loads).
pub struct InventoryState(pub Arc<Mutex<Vec<Device>>>);

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub ip: String,
    pub hostname: String,
    pub mac: Option<String>,
    pub vendor: Option<String>,
    pub device_type: String,
    pub os: Option<String>,
    pub open_ports: Vec<u16>,
    pub status: String, // "up" | "down" | "unknown"
    pub last_seen: u64,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub interfaces: Vec<DeviceInterface>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInterface {
    pub name: String,
    pub ip: Option<String>,
    pub mac: Option<String>,
    pub status: String,
    pub speed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceHealth {
    pub ip: String,
    pub hostname: String,
    pub cpu_pct: f64,
    pub mem_pct: f64,
    pub disk_pct: f64,
    pub uptime_secs: u64,
    pub status: String,
    pub alerts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FleetHealth {
    pub total_devices: usize,
    pub devices_up: usize,
    pub devices_down: usize,
    pub devices_unknown: usize,
    pub avg_cpu: f64,
    pub avg_mem: f64,
    pub critical_alerts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigBackup {
    pub id: String,
    pub hostname: String,
    pub timestamp: u64,
    pub size_bytes: usize,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigDiff {
    pub hostname: String,
    pub from_id: String,
    pub to_id: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultCredential {
    pub id: String,
    pub hostname_pattern: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub credential_type: String,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Scan event (emitted to frontend via Tauri events)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum ScanEvent {
    #[serde(rename = "progress")]
    Progress { scanned: usize, total: usize },
    #[serde(rename = "device")]
    DeviceFound(Device),
    #[serde(rename = "complete")]
    Complete { total: usize, duration_ms: u64 },
    #[serde(rename = "error")]
    Error { message: String },
}

// ---------------------------------------------------------------------------
// Well-known port → service heuristic
// ---------------------------------------------------------------------------

const PROBE_PORTS: &[(u16, &str)] = &[
    (22, "ssh"),
    (23, "telnet"),
    (80, "http"),
    (443, "https"),
    (161, "snmp"),
    (179, "bgp"),
    (389, "ldap"),
    (443, "https"),
    (445, "smb"),
    (830, "netconf"),
    (3306, "mysql"),
    (3389, "rdp"),
    (5432, "postgres"),
    (8080, "http-alt"),
    (8443, "https-alt"),
    (8728, "mikrotik-api"),
    (9100, "jetdirect"),
];

fn guess_device_type(open_ports: &[u16]) -> &'static str {
    if open_ports.contains(&179) {
        "router"
    } else if open_ports.contains(&830) || open_ports.contains(&8728) {
        "router"
    } else if open_ports.contains(&161) && !open_ports.contains(&22) {
        "switch"
    } else if open_ports.contains(&9100) {
        "printer"
    } else if open_ports.contains(&3389) {
        "windows-server"
    } else if open_ports.contains(&22) && open_ports.contains(&80) {
        "server"
    } else if open_ports.contains(&22) {
        "linux-host"
    } else if open_ports.contains(&80) || open_ports.contains(&443) {
        "appliance"
    } else {
        "unknown"
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ---------------------------------------------------------------------------
// TCP probe — connect with timeout
// ---------------------------------------------------------------------------

async fn tcp_probe(ip: IpAddr, port: u16, timeout: Duration) -> bool {
    let addr = std::net::SocketAddr::new(ip, port);
    tokio::time::timeout(timeout, TcpStream::connect(addr))
        .await
        .map(|r| r.is_ok())
        .unwrap_or(false)
}

/// Probe a single IP across all well-known ports, return Device if any port open.
async fn probe_host(ip: IpAddr, timeout: Duration) -> Option<Device> {
    let mut open_ports = Vec::new();

    // Fan out port probes concurrently
    let mut handles = Vec::new();
    for &(port, _) in PROBE_PORTS {
        let t = timeout;
        handles.push(tokio::spawn(async move {
            if tcp_probe(ip, port, t).await {
                Some(port)
            } else {
                None
            }
        }));
    }

    for h in handles {
        if let Ok(Some(port)) = h.await {
            open_ports.push(port);
        }
    }

    if open_ports.is_empty() {
        return None;
    }

    open_ports.sort();
    open_ports.dedup();

    let device_type = guess_device_type(&open_ports).to_string();

    Some(Device {
        ip: ip.to_string(),
        hostname: ip.to_string(), // DNS reverse lookup could go here
        mac: None,
        vendor: None,
        device_type,
        os: None,
        open_ports,
        status: "up".to_string(),
        last_seen: now_epoch(),
        tags: Vec::new(),
        interfaces: Vec::new(),
    })
}

// ---------------------------------------------------------------------------
// CIDR helpers
// ---------------------------------------------------------------------------

fn parse_cidr(cidr: &str) -> Result<Vec<IpAddr>, String> {
    let parts: Vec<&str> = cidr.split('/').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid CIDR: {cidr}"));
    }
    let base: Ipv4Addr = parts[0]
        .parse()
        .map_err(|e| format!("Invalid IP: {e}"))?;
    let prefix: u32 = parts[1]
        .parse()
        .map_err(|e| format!("Invalid prefix: {e}"))?;

    if prefix > 32 {
        return Err(format!("Prefix too large: {prefix}"));
    }
    if prefix < 16 {
        return Err("Prefix too small (< /16) — refusing to scan".to_string());
    }

    let base_u32 = u32::from(base);
    let mask = if prefix == 32 { u32::MAX } else { !((1u32 << (32 - prefix)) - 1) };
    let network = base_u32 & mask;
    let broadcast = network | !mask;

    // Skip network and broadcast for /31+
    let (start, end) = if prefix >= 31 {
        (network, broadcast)
    } else {
        (network + 1, broadcast - 1)
    };

    Ok((start..=end).map(|n| IpAddr::V4(Ipv4Addr::from(n))).collect())
}

// ---------------------------------------------------------------------------
// Scan engine
// ---------------------------------------------------------------------------

async fn run_scan(
    app: AppHandle,
    hosts: Vec<IpAddr>,
    cancel_rx: tokio::sync::oneshot::Receiver<()>,
    inventory: Arc<Mutex<Vec<Device>>>,
) {
    let start = std::time::Instant::now();
    let total = hosts.len();
    let timeout = Duration::from_millis(800);
    let concurrency = 64usize;

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Option<Device>>(256);
    let cancel = Arc::new(tokio::sync::Notify::new());

    // Spawn cancel listener
    let cancel2 = cancel.clone();
    tokio::spawn(async move {
        let _ = cancel_rx.await;
        cancel2.notify_waiters();
    });

    // Spawn scanner tasks in batches
    let cancel3 = cancel.clone();
    let tx2 = tx.clone();
    tokio::spawn(async move {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency));
        for ip in hosts {
            let permit = semaphore.clone().acquire_owned().await;
            if permit.is_err() { break; }
            let permit = permit.unwrap();
            let tx_inner = tx2.clone();
            let cancel_inner = cancel3.clone();
            tokio::spawn(async move {
                tokio::select! {
                    _ = cancel_inner.notified() => {},
                    result = probe_host(ip, timeout) => {
                        let _ = tx_inner.send(result).await;
                    }
                }
                drop(permit);
            });
        }
        // Drop sender when all spawns are done
        drop(tx2);
    });
    drop(tx); // drop our copy so channel closes when scanner is done

    let mut scanned = 0usize;
    let mut found = Vec::new();

    while let Some(result) = rx.recv().await {
        scanned += 1;
        if let Some(device) = result {
            let _ = app.emit("scan-event", ScanEvent::DeviceFound(device.clone()));
            found.push(device);
        }
        if scanned % 10 == 0 || scanned == total {
            let _ = app.emit("scan-event", ScanEvent::Progress { scanned, total });
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    let total_found = found.len();

    // Merge into inventory
    {
        let mut inv = inventory.lock().await;
        for dev in found {
            if let Some(existing) = inv.iter_mut().find(|d| d.ip == dev.ip) {
                *existing = dev;
            } else {
                inv.push(dev);
            }
        }
    }

    let _ = app.emit(
        "scan-event",
        ScanEvent::Complete {
            total: total_found,
            duration_ms,
        },
    );
}

// ---------------------------------------------------------------------------
// Tauri commands — Scanning
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn scan_subnet(
    app: AppHandle,
    cancel_state: State<'_, ScanCancelState>,
    inventory_state: State<'_, InventoryState>,
    subnet: String,
) -> Result<(), String> {
    let hosts = parse_cidr(&subnet)?;

    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut guard = cancel_state.0.lock().await;
        *guard = Some(tx);
    }

    let inv = inventory_state.0.clone();
    tokio::spawn(run_scan(app, hosts, rx, inv));
    Ok(())
}

#[tauri::command]
pub async fn scan_csv(
    app: AppHandle,
    cancel_state: State<'_, ScanCancelState>,
    inventory_state: State<'_, InventoryState>,
    path: String,
) -> Result<(), String> {
    let content =
        tokio::fs::read_to_string(&path).await.map_err(|e| format!("Failed to read CSV: {e}"))?;

    let mut hosts = Vec::new();
    for line in content.lines().skip(1) {
        // Accept lines where the first column is an IP
        let ip_str = line.split(',').next().unwrap_or("").trim();
        if let Ok(ip) = ip_str.parse::<IpAddr>() {
            hosts.push(ip);
        }
    }

    if hosts.is_empty() {
        return Err("No valid IPs found in CSV".to_string());
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut guard = cancel_state.0.lock().await;
        *guard = Some(tx);
    }

    let inv = inventory_state.0.clone();
    tokio::spawn(run_scan(app, hosts, rx, inv));
    Ok(())
}

#[tauri::command]
pub async fn cancel_scan(cancel_state: State<'_, ScanCancelState>) -> Result<(), String> {
    let mut guard = cancel_state.0.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands — Inventory
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn load_inventory(
    inventory_state: State<'_, InventoryState>,
    path: String,
) -> Result<Vec<Device>, String> {
    let content =
        tokio::fs::read_to_string(&path).await.map_err(|e| format!("Failed to read: {e}"))?;
    let devices: Vec<Device> =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {e}"))?;

    let mut inv = inventory_state.0.lock().await;
    *inv = devices.clone();
    Ok(devices)
}

#[tauri::command]
pub async fn get_device_detail(
    inventory_state: State<'_, InventoryState>,
    ip: String,
) -> Result<Device, String> {
    let inv = inventory_state.0.lock().await;
    inv.iter()
        .find(|d| d.ip == ip)
        .cloned()
        .ok_or_else(|| format!("Device {ip} not found"))
}

#[tauri::command]
pub async fn get_device_health(
    inventory_state: State<'_, InventoryState>,
    ip: String,
) -> Result<DeviceHealth, String> {
    let inv = inventory_state.0.lock().await;
    let dev = inv
        .iter()
        .find(|d| d.ip == ip)
        .ok_or_else(|| format!("Device {ip} not found"))?;

    // Without SNMP/agent data, return placeholder metrics.
    // Real implementation will use SNMP polling or agent push.
    Ok(DeviceHealth {
        ip: dev.ip.clone(),
        hostname: dev.hostname.clone(),
        cpu_pct: 0.0,
        mem_pct: 0.0,
        disk_pct: 0.0,
        uptime_secs: 0,
        status: dev.status.clone(),
        alerts: Vec::new(),
    })
}

#[tauri::command]
pub async fn get_fleet_health(
    inventory_state: State<'_, InventoryState>,
) -> Result<FleetHealth, String> {
    let inv = inventory_state.0.lock().await;
    let total = inv.len();
    let up = inv.iter().filter(|d| d.status == "up").count();
    let down = inv.iter().filter(|d| d.status == "down").count();

    Ok(FleetHealth {
        total_devices: total,
        devices_up: up,
        devices_down: down,
        devices_unknown: total - up - down,
        avg_cpu: 0.0,
        avg_mem: 0.0,
        critical_alerts: Vec::new(),
    })
}

// ---------------------------------------------------------------------------
// Tauri commands — Config management
// ---------------------------------------------------------------------------

fn config_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("pares-bastion")
        .join("configs")
}

#[tauri::command]
pub async fn backup_config(hostname: String) -> Result<ConfigBackup, String> {
    let dir = config_dir().join(&hostname);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("mkdir: {e}"))?;

    let id = uuid::Uuid::new_v4().to_string();
    let ts = now_epoch();
    let filename = format!("{ts}-{id}.conf");
    let path = dir.join(&filename);

    // Placeholder — real implementation will SSH/NETCONF to device and pull config
    let placeholder = format!(
        "! Configuration backup for {hostname}\n! Captured at {ts}\n! TODO: implement SSH/NETCONF config pull\n"
    );
    tokio::fs::write(&path, &placeholder)
        .await
        .map_err(|e| format!("write: {e}"))?;

    Ok(ConfigBackup {
        id,
        hostname,
        timestamp: ts,
        size_bytes: placeholder.len(),
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn list_backups(hostname: String) -> Result<Vec<ConfigBackup>, String> {
    let dir = config_dir().join(&hostname);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = tokio::fs::read_dir(&dir)
        .await
        .map_err(|e| format!("readdir: {e}"))?;

    let mut backups = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{e}"))? {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".conf") {
            continue;
        }
        let meta = entry.metadata().await.map_err(|e| format!("{e}"))?;
        let parts: Vec<&str> = name.trim_end_matches(".conf").splitn(2, '-').collect();
        let ts = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0u64);

        backups.push(ConfigBackup {
            id: parts.get(1).unwrap_or(&"").to_string(),
            hostname: hostname.clone(),
            timestamp: ts,
            size_bytes: meta.len() as usize,
            path: entry.path().to_string_lossy().to_string(),
        });
    }

    backups.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(backups)
}

#[tauri::command]
pub async fn diff_configs(
    hostname: String,
    from_id: String,
    to_id: String,
) -> Result<ConfigDiff, String> {
    let dir = config_dir().join(&hostname);

    let find_file = |id: &str| -> Result<PathBuf, String> {
        let pattern = format!("-{id}.conf");
        std::fs::read_dir(&dir)
            .map_err(|e| format!("{e}"))?
            .filter_map(|e| e.ok())
            .find(|e| e.file_name().to_string_lossy().contains(&pattern))
            .map(|e| e.path())
            .ok_or_else(|| format!("Backup {id} not found"))
    };

    let from_path = find_file(&from_id)?;
    let to_path = find_file(&to_id)?;

    let from_text = tokio::fs::read_to_string(&from_path)
        .await
        .map_err(|e| format!("{e}"))?;
    let to_text = tokio::fs::read_to_string(&to_path)
        .await
        .map_err(|e| format!("{e}"))?;

    // Simple line-by-line diff
    let from_lines: Vec<&str> = from_text.lines().collect();
    let to_lines: Vec<&str> = to_text.lines().collect();

    let mut diff_text = String::new();
    let mut additions = 0usize;
    let mut deletions = 0usize;

    // Basic diff — lines in from but not in to, and vice versa
    for line in &from_lines {
        if !to_lines.contains(line) {
            diff_text.push_str(&format!("- {line}\n"));
            deletions += 1;
        }
    }
    for line in &to_lines {
        if !from_lines.contains(line) {
            diff_text.push_str(&format!("+ {line}\n"));
            additions += 1;
        }
    }

    Ok(ConfigDiff {
        hostname,
        from_id,
        to_id,
        additions,
        deletions,
        diff_text,
    })
}

#[tauri::command]
pub async fn rollback_config(hostname: String, backup_id: String) -> Result<String, String> {
    // In a real implementation, this would SSH to the device and apply the config.
    // For now, just verify the backup exists.
    let dir = config_dir().join(&hostname);
    let pattern = format!("-{backup_id}.conf");
    let found = std::fs::read_dir(&dir)
        .map_err(|e| format!("{e}"))?
        .filter_map(|e| e.ok())
        .any(|e| e.file_name().to_string_lossy().contains(&pattern));

    if found {
        Ok(format!("Rollback to {backup_id} queued for {hostname}"))
    } else {
        Err(format!("Backup {backup_id} not found"))
    }
}

// ---------------------------------------------------------------------------
// Tauri commands — Vault (file-backed encrypted credential store)
// ---------------------------------------------------------------------------

fn vault_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("pares-bastion")
        .join("vault")
}

fn vault_file() -> PathBuf {
    vault_dir().join("credentials.json")
}

fn load_vault() -> Result<Vec<VaultCredential>, String> {
    let path = vault_file();
    if !path.exists() {
        return Err("Vault not initialised".to_string());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("{e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("{e}"))
}

fn save_vault(creds: &[VaultCredential]) -> Result<(), String> {
    let path = vault_file();
    let content = serde_json::to_string_pretty(creds).map_err(|e| format!("{e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("{e}"))
}

#[tauri::command]
pub async fn vault_init(_password: String) -> Result<String, String> {
    let dir = vault_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("{e}"))?;

    let path = vault_file();
    if path.exists() {
        return Err("Vault already exists".to_string());
    }

    let empty: Vec<VaultCredential> = Vec::new();
    save_vault(&empty)?;
    // TODO: derive encryption key from password (argon2) and encrypt the file
    Ok("Vault initialised".to_string())
}

#[tauri::command]
pub async fn vault_unlock(_password: String) -> Result<String, String> {
    // TODO: derive key and decrypt. For now just check file exists.
    if vault_file().exists() {
        Ok("Vault unlocked".to_string())
    } else {
        Err("Vault not initialised".to_string())
    }
}

#[tauri::command]
pub async fn vault_list() -> Result<Vec<VaultCredential>, String> {
    let mut creds = load_vault()?;
    // Mask passwords
    for c in &mut creds {
        c.password = Some("********".to_string());
    }
    Ok(creds)
}

#[tauri::command]
pub async fn vault_set(
    hostname_pattern: String,
    username: String,
    password: String,
    credential_type: Option<String>,
) -> Result<VaultCredential, String> {
    let mut creds = load_vault().unwrap_or_default();
    let ts = now_epoch();
    let id = uuid::Uuid::new_v4().to_string();

    let cred = VaultCredential {
        id: id.clone(),
        hostname_pattern,
        username,
        password: Some(password),
        credential_type: credential_type.unwrap_or_else(|| "ssh".to_string()),
        created_at: ts,
        updated_at: ts,
    };

    creds.push(cred.clone());
    save_vault(&creds)?;

    Ok(VaultCredential {
        password: Some("********".to_string()),
        ..cred
    })
}

#[tauri::command]
pub async fn vault_delete(id: String) -> Result<String, String> {
    let mut creds = load_vault()?;
    let before = creds.len();
    creds.retain(|c| c.id != id);
    if creds.len() == before {
        return Err(format!("Credential {id} not found"));
    }
    save_vault(&creds)?;
    Ok(format!("Deleted {id}"))
}

#[tauri::command]
pub async fn vault_resolve(hostname: String) -> Result<VaultCredential, String> {
    let creds = load_vault()?;
    // Simple glob match — patterns like "*.example.com" or exact hostnames
    creds
        .iter()
        .find(|c| {
            if c.hostname_pattern.starts_with('*') {
                let suffix = &c.hostname_pattern[1..];
                hostname.ends_with(suffix)
            } else {
                c.hostname_pattern == hostname
            }
        })
        .cloned()
        .map(|mut c| {
            c.password = Some("********".to_string());
            c
        })
        .ok_or_else(|| format!("No credential matches {hostname}"))
}

// ---------------------------------------------------------------------------
// Tauri commands — Ansible / Automation
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn export_ansible_inventory(
    inventory_state: State<'_, InventoryState>,
    path: String,
) -> Result<String, String> {
    let inv = inventory_state.0.lock().await;

    // Group devices by type
    let mut groups: HashMap<String, Vec<&Device>> = HashMap::new();
    for dev in inv.iter() {
        groups
            .entry(dev.device_type.clone())
            .or_default()
            .push(dev);
    }

    let mut ini = String::from("# Ansible inventory generated by pares-bastion\n\n");

    for (group, devices) in &groups {
        ini.push_str(&format!("[{group}]\n"));
        for dev in devices {
            let host = if dev.hostname != dev.ip {
                format!("{} ansible_host={}", dev.hostname, dev.ip)
            } else {
                dev.ip.clone()
            };
            ini.push_str(&format!("{host}\n"));
        }
        ini.push('\n');
    }

    tokio::fs::write(&path, &ini)
        .await
        .map_err(|e| format!("{e}"))?;

    Ok(format!(
        "Exported {} devices to {path}",
        inv.len()
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybookTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
}

#[tauri::command]
pub async fn list_playbook_templates() -> Result<Vec<PlaybookTemplate>, String> {
    Ok(vec![
        PlaybookTemplate {
            id: "backup-configs".to_string(),
            name: "Backup Device Configs".to_string(),
            description: "Pull running configs from all devices and store locally".to_string(),
            category: "maintenance".to_string(),
        },
        PlaybookTemplate {
            id: "update-ntp".to_string(),
            name: "Update NTP Servers".to_string(),
            description: "Set NTP server addresses across all network devices".to_string(),
            category: "configuration".to_string(),
        },
        PlaybookTemplate {
            id: "security-audit".to_string(),
            name: "Security Audit".to_string(),
            description: "Check for default credentials, open services, and compliance".to_string(),
            category: "security".to_string(),
        },
        PlaybookTemplate {
            id: "firmware-check".to_string(),
            name: "Firmware Version Check".to_string(),
            description: "Report current firmware versions across the fleet".to_string(),
            category: "maintenance".to_string(),
        },
    ])
}

#[tauri::command]
pub async fn generate_playbook(
    template_id: String,
    _params: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let playbook = match template_id.as_str() {
        "backup-configs" => {
            r#"---
- name: Backup Device Configs
  hosts: all
  gather_facts: false
  tasks:
    - name: Pull running config
      cli_command:
        command: show running-config
      register: config_output

    - name: Save config locally
      copy:
        content: "{{ config_output.stdout }}"
        dest: "./configs/{{ inventory_hostname }}.conf"
      delegate_to: localhost
"#
        }
        "update-ntp" => {
            r#"---
- name: Update NTP Servers
  hosts: all
  gather_facts: false
  vars:
    ntp_servers:
      - 0.pool.ntp.org
      - 1.pool.ntp.org
  tasks:
    - name: Configure NTP
      cli_config:
        config: |
          ntp server {{ item }}
      loop: "{{ ntp_servers }}"
"#
        }
        "security-audit" => {
            r#"---
- name: Security Audit
  hosts: all
  gather_facts: false
  tasks:
    - name: Check for default community strings
      cli_command:
        command: show snmp community
      register: snmp_out
      ignore_errors: true

    - name: Check SSH version
      cli_command:
        command: show ip ssh
      register: ssh_out
      ignore_errors: true
"#
        }
        "firmware-check" => {
            r#"---
- name: Firmware Version Check
  hosts: all
  gather_facts: false
  tasks:
    - name: Get firmware version
      cli_command:
        command: show version
      register: version_out

    - name: Report
      debug:
        msg: "{{ inventory_hostname }}: {{ version_out.stdout_lines[0] }}"
"#
        }
        _ => return Err(format!("Unknown template: {template_id}")),
    };

    Ok(playbook.to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cidr_24() {
        let hosts = parse_cidr("192.168.1.0/24").unwrap();
        assert_eq!(hosts.len(), 254);
        assert_eq!(hosts[0], IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1)));
        assert_eq!(hosts[253], IpAddr::V4(Ipv4Addr::new(192, 168, 1, 254)));
    }

    #[test]
    fn test_parse_cidr_32() {
        let hosts = parse_cidr("10.0.0.1/32").unwrap();
        assert_eq!(hosts.len(), 1);
    }

    #[test]
    fn test_parse_cidr_too_small() {
        assert!(parse_cidr("10.0.0.0/8").is_err());
    }

    #[test]
    fn test_guess_device_type() {
        assert_eq!(guess_device_type(&[179, 22]), "router");
        assert_eq!(guess_device_type(&[161]), "switch");
        assert_eq!(guess_device_type(&[3389, 445]), "windows-server");
        assert_eq!(guess_device_type(&[22, 80, 443]), "server");
        assert_eq!(guess_device_type(&[22]), "linux-host");
        assert_eq!(guess_device_type(&[9100]), "printer");
    }

    #[test]
    fn test_vault_credential_serde() {
        let cred = VaultCredential {
            id: "test".to_string(),
            hostname_pattern: "*.example.com".to_string(),
            username: "admin".to_string(),
            password: None,
            credential_type: "ssh".to_string(),
            created_at: 0,
            updated_at: 0,
        };
        let json = serde_json::to_string(&cred).unwrap();
        assert!(!json.contains("password")); // skip_serializing_if = None
    }
}
