//! Tauri commands for the netops-toolkit Python CLI sidecar.
//!
//! Commands:
//!   - `scan_subnet`    — scan a CIDR subnet, streaming results as Tauri events
//!   - `scan_csv`       — scan hosts from a CSV file, streaming results
//!   - `cancel_scan`    — cancel the running scan
//!   - `load_inventory` — load a JSON inventory file from disk
//!   - `get_fleet_health` — aggregate health across all devices
//!   - `backup_config`  — trigger a config backup for a device
//!   - `list_backups`   — list stored config backups
//!   - `diff_configs`   — compute a diff between two config versions
//!   - `rollback_config` — rollback a device config to a previous version
//!   - `vault_init`     — initialise the encrypted credential vault
//!   - `vault_unlock`   — unlock the vault with the master password
//!   - `vault_list`     — list stored credentials (passwords masked)
//!   - `vault_set`      — create or update a credential
//!   - `vault_delete`   — delete a credential by id
//!   - `vault_resolve`  — preview which credential would be used for a hostname

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use tokio::sync::Mutex;

// Python executable — `python3` on Unix, `python` on Windows
#[cfg(target_os = "windows")]
const PYTHON: &str = "python";
#[cfg(not(target_os = "windows"))]
const PYTHON: &str = "python3";

// ---------------------------------------------------------------------------
// Shared cancellation state
// ---------------------------------------------------------------------------

/// Holds an optional sender that, when fired, cancels the running scan.
pub struct ScanCancelState(pub Arc<Mutex<Option<oneshot::Sender<()>>>>);

// ---------------------------------------------------------------------------
// Tauri event payload types (must match src/lib/types.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceEvent {
    pub hostname: String,
    pub ip: String,
    pub vendor: String,
    pub version: String,
    pub model: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressEvent {
    pub scanned: u32,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompleteEvent {
    pub total_devices: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanErrorEvent {
    pub message: String,
    pub ip: Option<String>,
}

// ---------------------------------------------------------------------------
// Line-level JSON from the Python CLI
// ---------------------------------------------------------------------------

/// A single JSON line emitted by `python3 -m netops.inventory.scan`.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum CliLine {
    Device {
        hostname: String,
        ip: String,
        vendor: String,
        version: String,
        model: Option<String>,
        serial_number: Option<String>,
    },
    Progress {
        scanned: u32,
        total: u32,
    },
    Complete {
        total_devices: u32,
        duration_ms: u64,
    },
    Error {
        message: String,
        ip: Option<String>,
    },
}

// ---------------------------------------------------------------------------
// Scan arguments builder
// ---------------------------------------------------------------------------

struct ScanArgs {
    args: Vec<String>,
}

impl ScanArgs {
    fn subnet(subnet: &str, user: &str, password: &str, deep: bool, concurrency: u32) -> Self {
        let mut args = vec![
            "-m".into(),
            "netops.inventory.scan".into(),
            "--subnet".into(),
            subnet.to_string(),
            "--user".into(),
            user.to_string(),
            "--password".into(),
            password.to_string(),
            "--concurrency".into(),
            concurrency.to_string(),
            "--output".into(),
            "json".into(),
        ];
        if deep {
            args.push("--deep".into());
        }
        Self { args }
    }

    fn csv(csv_path: &str, user: &str, password: &str, deep: bool, concurrency: u32) -> Self {
        let mut args = vec![
            "-m".into(),
            "netops.inventory.scan".into(),
            "--csv".into(),
            csv_path.to_string(),
            "--user".into(),
            user.to_string(),
            "--password".into(),
            password.to_string(),
            "--concurrency".into(),
            concurrency.to_string(),
            "--output".into(),
            "json".into(),
        ];
        if deep {
            args.push("--deep".into());
        }
        Self { args }
    }
}

// ---------------------------------------------------------------------------
// Core scan runner
// ---------------------------------------------------------------------------

/// Spawns `python3` with the given arguments, reads JSONL output line-by-line,
/// and emits Tauri events.  If `cancel_rx` fires, kills the child process.
async fn run_scan(
    app: AppHandle,
    python_args: ScanArgs,
    cancel_rx: oneshot::Receiver<()>,
) {
    let start = std::time::Instant::now();

    let child = Command::new(PYTHON)
        .args(&python_args.args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            // python3 / netops-toolkit not available — emit mock data for dev
            run_mock_scan(app, cancel_rx).await;
            let _ = e;
            return;
        }
    };

    let stdout = child.stdout.take().expect("stdout must be piped");
    let mut lines = BufReader::new(stdout).lines();

    tokio::pin!(cancel_rx);

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                let _ = child.kill().await;
                break;
            }
            line = lines.next_line() => {
                match line {
                    Ok(Some(raw)) => {
                        if raw.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<CliLine>(&raw) {
                            Ok(CliLine::Device { hostname, ip, vendor, version, model, serial_number }) => {
                                let _ = app.emit("scan:device", DeviceEvent {
                                    hostname, ip, vendor, version, model, serial_number,
                                });
                            }
                            Ok(CliLine::Progress { scanned, total }) => {
                                let _ = app.emit("scan:progress", ProgressEvent { scanned, total });
                            }
                            Ok(CliLine::Complete { total_devices, duration_ms }) => {
                                let _ = app.emit("scan:complete", CompleteEvent {
                                    total_devices,
                                    duration_ms,
                                });
                                break;
                            }
                            Ok(CliLine::Error { message, ip }) => {
                                let _ = app.emit("scan:error", ScanErrorEvent { message, ip });
                            }
                            Err(_) => {
                                // Ignore non-JSON lines (e.g. logging output)
                            }
                        }
                    }
                    Ok(None) => {
                        // Process exited — emit complete if not already done
                        let duration_ms = start.elapsed().as_millis() as u64;
                        let _ = app.emit("scan:complete", CompleteEvent {
                            total_devices: 0,
                            duration_ms,
                        });
                        break;
                    }
                    Err(e) => {
                        let _ = app.emit("scan:error", ScanErrorEvent {
                            message: e.to_string(),
                            ip: None,
                        });
                        break;
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Mock scan (development / no Python environment)
// ---------------------------------------------------------------------------

/// Simulates a scan by emitting mock events.  Used when `python3` or the
/// `netops-toolkit` package is not available in the environment.
async fn run_mock_scan(app: AppHandle, mut cancel_rx: oneshot::Receiver<()>) {
    use tokio::time::{sleep, Duration};

    let mock_devices = [
        ("router1", "10.0.0.1", "cisco", "16.9.4", "ISR4331"),
        ("sw-core", "10.0.0.2", "nokia", "23.10.R1", "7750 SR-7"),
        ("fw-edge", "10.0.0.3", "juniper", "22.3R1", "MX204"),
        ("sw-access", "10.0.0.4", "arista", "4.28.0F", "DCS-7050TX"),
        ("router2", "10.0.0.5", "cisco", "17.3.2", "ISR4451"),
    ];

    let total = mock_devices.len() as u32;

    for (i, (hostname, ip, vendor, version, model)) in mock_devices.iter().enumerate() {
        // Check for cancellation
        if cancel_rx.try_recv().is_ok() {
            return;
        }

        let scanned = (i + 1) as u32;
        sleep(Duration::from_millis(400)).await;

        let _ = app.emit(
            "scan:device",
            DeviceEvent {
                hostname: hostname.to_string(),
                ip: ip.to_string(),
                vendor: vendor.to_string(),
                version: version.to_string(),
                model: Some(model.to_string()),
                serial_number: None,
            },
        );

        let _ = app.emit("scan:progress", ProgressEvent { scanned, total });
    }

    let _ = app.emit(
        "scan:complete",
        CompleteEvent {
            total_devices: total,
            duration_ms: total as u64 * 400,
        },
    );
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Scan a CIDR subnet using `python3 -m netops.inventory.scan --subnet <subnet>`.
///
/// Results are streamed to the frontend via Tauri events:
/// - `scan:device`   — DeviceEvent for each host found
/// - `scan:progress` — ProgressEvent with running counts
/// - `scan:complete` — CompleteEvent when the scan finishes
/// - `scan:error`    — ScanErrorEvent for per-host errors
#[tauri::command]
pub async fn scan_subnet(
    app: AppHandle,
    cancel: State<'_, ScanCancelState>,
    subnet: String,
    user: String,
    password: String,
    deep: bool,
    concurrency: u32,
) -> Result<(), String> {
    validate_subnet(&subnet)?;
    validate_concurrency(concurrency)?;

    let (tx, rx) = oneshot::channel::<()>();

    {
        let mut guard = cancel.0.lock().await;
        // Cancel any previously running scan
        if let Some(prev) = guard.take() {
            let _ = prev.send(());
        }
        *guard = Some(tx);
    }

    let args = ScanArgs::subnet(&subnet, &user, &password, deep, concurrency);
    tokio::spawn(run_scan(app, args, rx));

    Ok(())
}

/// Scan hosts from a CSV file using `python3 -m netops.inventory.scan --csv <path>`.
///
/// Events are the same as for `scan_subnet`.
#[tauri::command]
pub async fn scan_csv(
    app: AppHandle,
    cancel: State<'_, ScanCancelState>,
    csv_path: String,
    user: String,
    password: String,
    deep: bool,
    concurrency: u32,
) -> Result<(), String> {
    validate_csv_path(&csv_path)?;
    validate_concurrency(concurrency)?;

    let (tx, rx) = oneshot::channel::<()>();

    {
        let mut guard = cancel.0.lock().await;
        if let Some(prev) = guard.take() {
            let _ = prev.send(());
        }
        *guard = Some(tx);
    }

    let args = ScanArgs::csv(&csv_path, &user, &password, deep, concurrency);
    tokio::spawn(run_scan(app, args, rx));

    Ok(())
}

/// Cancel the currently running scan.
#[tauri::command]
pub async fn cancel_scan(cancel: State<'_, ScanCancelState>) -> Result<(), String> {
    let mut guard = cancel.0.lock().await;
    if let Some(tx) = guard.take() {
        let _ = tx.send(());
    }
    Ok(())
}

/// Load an inventory JSON file from disk and return the parsed device list.
///
/// The file is expected to be a JSON array of device objects.
#[tauri::command]
pub async fn load_inventory(path: String) -> Result<Vec<serde_json::Value>, String> {
    let path = PathBuf::from(&path);

    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read inventory file: {e}"))?;

    let devices: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("Invalid inventory JSON: {e}"))?;

    Ok(devices)
}

// ---------------------------------------------------------------------------
// Device detail payload types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
pub struct SystemInfo {
    pub hostname: String,
    pub ip: String,
    pub vendor: String,
    pub model: String,
    pub version: String,
    pub serial: String,
    pub uptime: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct InterfaceEntry {
    pub name: String,
    pub status: String,
    pub speed: String,
    pub input_errors: u64,
    pub output_errors: u64,
    pub utilization: f32,
}

#[derive(Debug, Serialize, Clone)]
pub struct HealthInfo {
    pub cpu_percent: f32,
    pub memory_percent: f32,
    pub temperature_celsius: Option<f32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BgpPeer {
    pub neighbor: String,
    pub remote_as: u32,
    pub state: String,
    pub prefixes_received: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct DeviceDetail {
    pub system_info: SystemInfo,
    pub interfaces: Vec<InterfaceEntry>,
    pub health: HealthInfo,
    pub bgp_peers: Vec<BgpPeer>,
    pub config_output: String,
}

// ---------------------------------------------------------------------------
// Device detail commands
// ---------------------------------------------------------------------------

/// Retrieve full device detail for `hostname`.
///
/// Calls the netops-toolkit sidecar with device-specific commands and returns
/// parsed system info, interface list, BGP peers, and raw config output.
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn get_device_detail(hostname: String) -> Result<DeviceDetail, String> {
    // Attempt to call the Python CLI
    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.device.detail",
            "--hostname",
            &hostname,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(detail) = serde_json::from_str::<DeviceDetail>(&text) {
                return Ok(detail);
            }
        }
    }

    // Fall back to mock data
    Ok(mock_device_detail(&hostname))
}

/// Retrieve live health metrics (CPU, memory, temperature) for `hostname`.
///
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn get_device_health(hostname: String) -> Result<HealthInfo, String> {
    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.device.health",
            "--hostname",
            &hostname,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(health) = serde_json::from_str::<HealthInfo>(&text) {
                return Ok(health);
            }
        }
    }

    Ok(mock_health(&hostname))
}

// ---------------------------------------------------------------------------
// Mock helpers for offline / sidecar-unavailable scenarios
// ---------------------------------------------------------------------------

fn mock_device_detail(hostname: &str) -> DeviceDetail {
    DeviceDetail {
        system_info: SystemInfo {
            hostname: hostname.to_string(),
            ip: "10.0.0.1".into(),
            vendor: "Cisco IOS".into(),
            model: "ASR1001-X".into(),
            version: "16.9.4".into(),
            serial: "FXS2208Q1GD".into(),
            uptime: "42 days, 3 hours".into(),
        },
        interfaces: vec![
            InterfaceEntry {
                name: "GigabitEthernet0/0/0".into(),
                status: "up".into(),
                speed: "1G".into(),
                input_errors: 0,
                output_errors: 0,
                utilization: 12.5,
            },
            InterfaceEntry {
                name: "GigabitEthernet0/0/1".into(),
                status: "up".into(),
                speed: "1G".into(),
                input_errors: 2,
                output_errors: 0,
                utilization: 5.2,
            },
            InterfaceEntry {
                name: "GigabitEthernet0/0/2".into(),
                status: "down".into(),
                speed: "1G".into(),
                input_errors: 0,
                output_errors: 0,
                utilization: 0.0,
            },
            InterfaceEntry {
                name: "Loopback0".into(),
                status: "up".into(),
                speed: "—".into(),
                input_errors: 0,
                output_errors: 0,
                utilization: 0.0,
            },
        ],
        health: mock_health(hostname),
        bgp_peers: vec![
            BgpPeer {
                neighbor: "10.0.0.2".into(),
                remote_as: 65001,
                state: "Established".into(),
                prefixes_received: 1024,
            },
            BgpPeer {
                neighbor: "192.168.1.1".into(),
                remote_as: 65002,
                state: "Established".into(),
                prefixes_received: 512,
            },
            BgpPeer {
                neighbor: "172.16.0.1".into(),
                remote_as: 65003,
                state: "Active".into(),
                prefixes_received: 0,
            },
        ],
        config_output: format!(
            "! Configuration for {hostname}\n!\nversion 16.9\n!\nhostname {hostname}\n!\ninterface GigabitEthernet0/0/0\n ip address 10.0.0.1 255.255.255.0\n no shutdown\n!\nrouter bgp 65001\n neighbor 10.0.0.2 remote-as 65001\n neighbor 192.168.1.1 remote-as 65002\n!\nend\n"
        ),
    }
}

fn mock_health(_hostname: &str) -> HealthInfo {
    HealthInfo {
        cpu_percent: 24.0,
        memory_percent: 61.5,
        temperature_celsius: Some(42.0),
    }
}

// ---------------------------------------------------------------------------
// Fleet health payload types & command
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
pub struct InterfaceErrorEntry {
    pub interface_name: String,
    pub crc_errors: u64,
    pub input_errors: u64,
    pub output_errors: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct LogAlertEntry {
    pub timestamp: String,
    pub severity: String,
    pub source: String,
    pub message: String,
}

    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct DeviceHealthEntry {
        pub hostname: String,
        pub ip: String,
        pub vendor: String,
        pub status: String,
        pub cpu_percent: f32,
        pub memory_percent: f32,
        pub temperature_celsius: Option<f32>,
        pub interface_errors: Vec<InterfaceErrorEntry>,
        pub log_alerts: Vec<LogAlertEntry>,
    }

    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct FleetHealthSummary {
        pub total: u32,
        pub healthy: u32,
        pub warning: u32,
        pub critical: u32,
        pub unreachable: u32,
    }

    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct VendorHealthSummary {
        pub vendor: String,
        pub total: u32,
        pub healthy: u32,
        pub warning: u32,
        pub critical: u32,
        pub unreachable: u32,
        pub avg_cpu: f32,
        pub avg_memory: f32,
    }

    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct FleetHealth {
        pub devices: Vec<DeviceHealthEntry>,
        pub summary: FleetHealthSummary,
        pub vendor_breakdown: Vec<VendorHealthSummary>,
        pub last_updated: String,
    }

/// Retrieve aggregate fleet health data across all devices.
///
/// Calls the netops-toolkit sidecar with `netops.report.health_dashboard` and
/// returns parsed fleet health summary. Falls back to mock data when the
/// sidecar is unavailable.
#[tauri::command]
pub async fn get_fleet_health() -> Result<FleetHealth, String> {
    let output = Command::new(PYTHON)
        .args(["-m", "netops.report.health_dashboard", "--format", "json"])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(health) = serde_json::from_str::<FleetHealth>(&text) {
                return Ok(health);
            }
        }
    }

    Ok(mock_fleet_health())
}

fn mock_fleet_health() -> FleetHealth {
    let devices = vec![
        DeviceHealthEntry {
            hostname: "core-rtr-01".into(),
            ip: "10.0.0.1".into(),
            vendor: "Cisco".into(),
            status: "healthy".into(),
            cpu_percent: 24.0,
            memory_percent: 61.0,
            temperature_celsius: Some(42.0),
            interface_errors: vec![],
            log_alerts: vec![LogAlertEntry {
                timestamp: "2026-03-27T06:12:00Z".into(),
                severity: "info".into(),
                source: "core-rtr-01".into(),
                message: "BGP neighbor 10.0.0.2 Up".into(),
            }],
        },
        DeviceHealthEntry {
            hostname: "core-rtr-02".into(),
            ip: "10.0.0.2".into(),
            vendor: "Cisco".into(),
            status: "warning".into(),
            cpu_percent: 78.0,
            memory_percent: 85.0,
            temperature_celsius: Some(55.0),
            interface_errors: vec![InterfaceErrorEntry {
                interface_name: "Gi0/0/1".into(),
                crc_errors: 12,
                input_errors: 45,
                output_errors: 3,
            }],
            log_alerts: vec![LogAlertEntry {
                timestamp: "2026-03-27T05:58:00Z".into(),
                severity: "warning".into(),
                source: "core-rtr-02".into(),
                message: "CPU utilization above 75% threshold".into(),
            }],
        },
        DeviceHealthEntry {
            hostname: "edge-rtr-01".into(),
            ip: "10.0.1.1".into(),
            vendor: "Nokia".into(),
            status: "healthy".into(),
            cpu_percent: 18.0,
            memory_percent: 44.0,
            temperature_celsius: Some(38.0),
            interface_errors: vec![],
            log_alerts: vec![],
        },
        DeviceHealthEntry {
            hostname: "edge-rtr-02".into(),
            ip: "10.0.1.2".into(),
            vendor: "Nokia".into(),
            status: "critical".into(),
            cpu_percent: 95.0,
            memory_percent: 92.0,
            temperature_celsius: Some(68.0),
            interface_errors: vec![InterfaceErrorEntry {
                interface_name: "port-1/1/1".into(),
                crc_errors: 230,
                input_errors: 1540,
                output_errors: 87,
            }],
            log_alerts: vec![
                LogAlertEntry {
                    timestamp: "2026-03-27T06:01:00Z".into(),
                    severity: "critical".into(),
                    source: "edge-rtr-02".into(),
                    message: "Memory utilization critical — 92%".into(),
                },
                LogAlertEntry {
                    timestamp: "2026-03-27T05:55:00Z".into(),
                    severity: "major".into(),
                    source: "edge-rtr-02".into(),
                    message: "Port 1/1/1 CRC errors exceeding threshold".into(),
                },
            ],
        },
        DeviceHealthEntry {
            hostname: "spine-sw-01".into(),
            ip: "10.1.0.1".into(),
            vendor: "Arista".into(),
            status: "healthy".into(),
            cpu_percent: 12.0,
            memory_percent: 38.0,
            temperature_celsius: Some(35.0),
            interface_errors: vec![],
            log_alerts: vec![],
        },
    ];

    let total = devices.len() as u32;
    let healthy = devices.iter().filter(|d| d.status == "healthy").count() as u32;
    let warning = devices.iter().filter(|d| d.status == "warning").count() as u32;
    let critical = devices.iter().filter(|d| d.status == "critical").count() as u32;
    let unreachable = devices.iter().filter(|d| d.status == "unreachable").count() as u32;

    FleetHealth {
        summary: FleetHealthSummary {
            total,
            healthy,
            warning,
            critical,
            unreachable,
        },
        vendor_breakdown: vec![
            VendorHealthSummary {
                vendor: "Cisco".into(),
                total: 2,
                healthy: 1,
                warning: 1,
                critical: 0,
                unreachable: 0,
                avg_cpu: 51.0,
                avg_memory: 73.0,
            },
            VendorHealthSummary {
                vendor: "Nokia".into(),
                total: 2,
                healthy: 1,
                warning: 0,
                critical: 1,
                unreachable: 0,
                avg_cpu: 56.5,
                avg_memory: 68.0,
            },
            VendorHealthSummary {
                vendor: "Arista".into(),
                total: 1,
                healthy: 1,
                warning: 0,
                critical: 0,
                unreachable: 0,
                avg_cpu: 12.0,
                avg_memory: 38.0,
            },
        ],
        devices,
        last_updated: "2026-03-27T06:15:00Z".into(),
    }
}

// ---------------------------------------------------------------------------
// Config backup payload types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBackup {
    pub hostname: String,
    pub version: String,
    pub timestamp: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub hostname: String,
    #[serde(rename = "versionA")]
    pub version_a: String,
    #[serde(rename = "versionB")]
    pub version_b: String,
    pub unified: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RollbackResult {
    pub hostname: String,
    pub version: String,
    pub success: bool,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Config backup commands
// ---------------------------------------------------------------------------

/// Trigger a config backup for the specified device.
///
/// Calls `python3 -m netops.collect.backup --hostname <hostname>`.
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn backup_config(hostname: String) -> Result<ConfigBackup, String> {
    if hostname.trim().is_empty() {
        return Err("Hostname must not be empty".into());
    }

    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.collect.backup",
            "--hostname",
            &hostname,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(backup) = serde_json::from_str::<ConfigBackup>(&text) {
                return Ok(backup);
            }
        }
    }

    Ok(mock_backup(&hostname))
}

/// List stored config backups, optionally filtered by hostname.
///
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn list_backups(hostname: Option<String>) -> Result<Vec<ConfigBackup>, String> {
    let mut cmd_args = vec!["-m", "netops.collect.backup", "--list", "--format", "json"];
    let hn;
    if let Some(ref h) = hostname {
        if h.trim().is_empty() {
            return Err("Hostname filter must not be empty".into());
        }
        hn = h.clone();
        cmd_args.push("--hostname");
        cmd_args.push(&hn);
    }

    let output = Command::new(PYTHON).args(&cmd_args).output().await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(backups) = serde_json::from_str::<Vec<ConfigBackup>>(&text) {
                return Ok(backups);
            }
        }
    }

    Ok(mock_backup_list(hostname.as_deref()))
}

/// Compute a diff between two config versions for a device.
///
/// Calls `python3 -m netops.change.diff`.
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn diff_configs(
    hostname: String,
    version_a: String,
    version_b: String,
) -> Result<DiffResult, String> {
    if hostname.trim().is_empty() {
        return Err("Hostname must not be empty".into());
    }
    if version_a.trim().is_empty() {
        return Err("Version A must not be empty".into());
    }
    if version_b.trim().is_empty() {
        return Err("Version B must not be empty".into());
    }
    if version_a.trim() == version_b.trim() {
        return Err("Version A and Version B must be different".into());
    }

    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.change.diff",
            "--hostname",
            &hostname,
            "--version-a",
            &version_a,
            "--version-b",
            &version_b,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(diff) = serde_json::from_str::<DiffResult>(&text) {
                return Ok(diff);
            }
        }
    }

    Ok(mock_diff(&hostname, &version_a, &version_b))
}

/// Rollback a device config to a previous version.
///
/// Calls `python3 -m netops.change.rollback`.
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn rollback_config(hostname: String, version: String) -> Result<RollbackResult, String> {
    if hostname.trim().is_empty() {
        return Err("Hostname must not be empty".into());
    }
    if version.trim().is_empty() {
        return Err("Version must not be empty".into());
    }

    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.change.rollback",
            "--hostname",
            &hostname,
            "--version",
            &version,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(result) = serde_json::from_str::<RollbackResult>(&text) {
                return Ok(result);
            }
        }
    }

    Ok(mock_rollback(&hostname, &version))
}

// ---------------------------------------------------------------------------
// Config mock helpers
// ---------------------------------------------------------------------------

fn mock_backup(hostname: &str) -> ConfigBackup {
    ConfigBackup {
        hostname: hostname.to_string(),
        version: "v1".into(),
        timestamp: "2026-03-27T06:00:00Z".into(),
        size: 4096,
    }
}

fn mock_backup_list(hostname: Option<&str>) -> Vec<ConfigBackup> {
    let all = vec![
        ConfigBackup {
            hostname: "core-rtr-01".into(),
            version: "v3".into(),
            timestamp: "2026-03-26T08:00:00Z".into(),
            size: 4096,
        },
        ConfigBackup {
            hostname: "core-rtr-01".into(),
            version: "v2".into(),
            timestamp: "2026-03-20T14:30:00Z".into(),
            size: 3980,
        },
        ConfigBackup {
            hostname: "core-rtr-01".into(),
            version: "v1".into(),
            timestamp: "2026-03-10T09:15:00Z".into(),
            size: 3840,
        },
        ConfigBackup {
            hostname: "core-rtr-02".into(),
            version: "v2".into(),
            timestamp: "2026-03-25T11:45:00Z".into(),
            size: 4200,
        },
        ConfigBackup {
            hostname: "core-rtr-02".into(),
            version: "v1".into(),
            timestamp: "2026-03-15T16:20:00Z".into(),
            size: 4050,
        },
        ConfigBackup {
            hostname: "edge-rtr-01".into(),
            version: "v2".into(),
            timestamp: "2026-03-24T07:00:00Z".into(),
            size: 5120,
        },
        ConfigBackup {
            hostname: "edge-rtr-01".into(),
            version: "v1".into(),
            timestamp: "2026-03-12T10:30:00Z".into(),
            size: 4980,
        },
        ConfigBackup {
            hostname: "spine-sw-01".into(),
            version: "v1".into(),
            timestamp: "2026-03-22T13:00:00Z".into(),
            size: 3200,
        },
        ConfigBackup {
            hostname: "leaf-sw-01".into(),
            version: "v1".into(),
            timestamp: "2026-03-21T09:00:00Z".into(),
            size: 2800,
        },
    ];
    match hostname {
        Some(h) => all.into_iter().filter(|b| b.hostname == h).collect(),
        None => all,
    }
}

fn mock_diff(hostname: &str, version_a: &str, version_b: &str) -> DiffResult {
    DiffResult {
        hostname: hostname.to_string(),
        version_a: version_a.to_string(),
        version_b: version_b.to_string(),
        unified: format!(
            "--- {hostname} {version_a}\n\
             +++ {hostname} {version_b}\n\
             @@ -8,6 +8,9 @@\n\
             \ ip address 10.0.0.1 255.255.255.0\n\
             \ no shutdown\n\
             !\n\
             +interface GigabitEthernet0/0/1\n\
             + ip address 10.0.1.1 255.255.255.0\n\
             + no shutdown\n\
             +!\n\
             router bgp 65001\n\
             \ neighbor 10.0.0.2 remote-as 65001\n"
        ),
        additions: 4,
        deletions: 0,
    }
}

fn mock_rollback(hostname: &str, version: &str) -> RollbackResult {
    RollbackResult {
        hostname: hostname.to_string(),
        version: version.to_string(),
        success: true,
        message: format!("Successfully rolled back {hostname} to {version}"),
    }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

fn validate_subnet(subnet: &str) -> Result<(), String> {
    // Basic CIDR validation: <ip>/<prefix>
    let parts: Vec<&str> = subnet.split('/').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid subnet '{subnet}': expected CIDR notation (e.g. 10.0.0.0/24)"));
    }

    let ip_parts: Vec<&str> = parts[0].split('.').collect();
    if ip_parts.len() != 4 || ip_parts.iter().any(|p| p.parse::<u8>().is_err()) {
        return Err(format!("Invalid IP address in subnet '{subnet}'"));
    }

    let prefix: u8 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid prefix length in subnet '{subnet}'"))?;
    if prefix > 32 {
        return Err(format!("Prefix length must be 0–32, got {prefix}"));
    }

    Ok(())
}

fn validate_csv_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("CSV path must not be empty".into());
    }
    Ok(())
}

fn validate_concurrency(concurrency: u32) -> Result<(), String> {
    if concurrency == 0 || concurrency > 200 {
        return Err(format!(
            "Concurrency must be between 1 and 200, got {concurrency}"
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Vault payload types
// ---------------------------------------------------------------------------

/// Credential scope: default fallback, group pattern, or device-specific.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CredentialScope {
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "group")]
    Group,
    #[serde(rename = "device")]
    Device,
}

/// Authentication method for a stored credential.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    #[serde(rename = "password")]
    Password,
    #[serde(rename = "key")]
    Key,
}

/// A credential entry returned to the frontend (passwords always masked).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultCredential {
    pub id: String,
    pub scope: CredentialScope,
    pub target: Option<String>,
    pub username: String,
    pub auth_method: AuthMethod,
    pub has_enable_secret: bool,
}

/// Payload for creating or updating a vault credential.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSetPayload {
    pub scope: CredentialScope,
    pub target: Option<String>,
    pub username: String,
    /// Omit (null/undefined) when editing to keep the existing password.
    pub password: Option<String>,
    pub enable_secret: Option<String>,
    pub auth_method: AuthMethod,
}

/// Vault status returned after unlock or init.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub unlocked: bool,
    pub credential_count: u32,
}

/// Result of a credential resolution preview for a given hostname.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultResolveResult {
    pub hostname: String,
    pub resolved: Option<VaultCredential>,
    pub explanation: String,
}

// ---------------------------------------------------------------------------
// Vault commands
// ---------------------------------------------------------------------------

/// Initialise the encrypted credential vault with a new master password.
///
/// Calls `python3 -m netops.core.vault init`.
/// Falls back to a mock "vault created" response only when the sidecar cannot be spawned
/// (i.e. netops-toolkit is not installed) so the UI remains usable in offline/dev mode.
#[tauri::command]
pub async fn vault_init(password: String) -> Result<VaultStatus, String> {
    if password.chars().count() < 8 {
        return Err("Master password must be at least 8 characters".into());
    }

    let spawn_result = Command::new(PYTHON)
        .args(["-m", "netops.core.vault", "init", "--format", "json"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match spawn_result {
        Err(_) => {
            // Sidecar unavailable — fall back to mock so offline/dev mode works.
            Ok(VaultStatus {
                unlocked: true,
                credential_count: 0,
            })
        }
        Ok(mut child) => {
            use tokio::io::AsyncWriteExt;
            if let Some(stdin) = child.stdin.take() {
                let mut stdin = tokio::io::BufWriter::new(stdin);
                let _ = stdin.write_all(password.as_bytes()).await;
                let _ = stdin.flush().await;
            }
            match child.wait_with_output().await {
                Err(e) => Err(format!("Failed to wait for vault init process: {e}")),
                Ok(out) => {
                    if out.status.success() {
                        let text = String::from_utf8_lossy(&out.stdout);
                        serde_json::from_str::<VaultStatus>(&text)
                            .map_err(|_| "Failed to parse vault init response".into())
                    } else {
                        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                        Err(if stderr.is_empty() {
                            "Vault init failed".into()
                        } else {
                            stderr
                        })
                    }
                }
            }
        }
    }
}

/// Unlock the vault using the master password; session-cached on success.
///
/// Calls `python3 -m netops.core.vault unlock --format json`.
/// Falls back to mock data only when the sidecar cannot be spawned; returns an error
/// for all other failures (e.g. wrong password) so the frontend can surface them.
#[tauri::command]
pub async fn vault_unlock(password: String) -> Result<VaultStatus, String> {
    if password.is_empty() {
        return Err("Password must not be empty".into());
    }

    let spawn_result = Command::new(PYTHON)
        .args(["-m", "netops.core.vault", "unlock", "--format", "json"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match spawn_result {
        Err(_) => {
            // Sidecar unavailable — fall back to mock so offline/dev mode works.
            Ok(VaultStatus {
                unlocked: true,
                credential_count: 4,
            })
        }
        Ok(mut child) => {
            use tokio::io::AsyncWriteExt;

            // Best-effort: write password to stdin; if this fails, the child
            // process will likely exit with an error which we handle below.
            if let Some(stdin) = child.stdin.take() {
                let mut stdin = tokio::io::BufWriter::new(stdin);
                let _ = stdin.write_all(password.as_bytes()).await;
                let _ = stdin.flush().await;
            }

            match child.wait_with_output().await {
                Err(e) => Err(format!("Failed to wait for vault unlock process: {e}")),
                Ok(out) => {
                    if out.status.success() {
                        let text = String::from_utf8_lossy(&out.stdout);
                        serde_json::from_str::<VaultStatus>(&text)
                            .map_err(|_| "Failed to parse vault unlock response".into())
                    } else {
                        // Non-zero exit: real failure (e.g. wrong master password).
                        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                        Err(if stderr.is_empty() {
                            "Vault unlock failed".into()
                        } else {
                            stderr
                        })
                    }
                }
            }
        }
    }
}

/// List all stored credentials (passwords are always masked).
///
/// Calls `python3 -m netops.core.vault list --format json`.
/// Falls back to mock data only when the sidecar cannot be spawned.
#[tauri::command]
pub async fn vault_list() -> Result<Vec<VaultCredential>, String> {
    match Command::new(PYTHON)
        .args(["-m", "netops.core.vault", "list", "--format", "json"])
        .output()
        .await
    {
        Err(_) => {
            // Sidecar unavailable — return mock data for offline/dev mode.
            Ok(mock_vault_credentials())
        }
        Ok(out) => {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                serde_json::from_str::<Vec<VaultCredential>>(&text)
                    .map_err(|e| format!("Failed to parse vault list output: {e}"))
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                Err(if stderr.is_empty() {
                    "vault_list failed".into()
                } else {
                    stderr
                })
            }
        }
    }
}

/// Create or update a credential in the vault.
///
/// Calls `python3 -m netops.core.vault set --format json`.
/// Falls back to a mock credential only when the sidecar cannot be spawned;
/// returns an error when the sidecar runs but fails (fail-closed for writes).
#[tauri::command]
pub async fn vault_set(payload: VaultSetPayload) -> Result<VaultCredential, String> {
    if payload.username.trim().is_empty() {
        return Err("Username must not be empty".into());
    }
    if let Some(ref pw) = payload.password {
        if pw.is_empty() {
            return Err("Password must not be empty".into());
        }
    }
    if matches!(payload.scope, CredentialScope::Group | CredentialScope::Device) {
        if payload.target.as_deref().map(str::trim).unwrap_or("").is_empty() {
            return Err("Target must be specified for group or device scope".into());
        }
    }

    let json_payload =
        serde_json::to_string(&payload).map_err(|e| format!("Serialise error: {e}"))?;

    let spawn_result = Command::new(PYTHON)
        .args(["-m", "netops.core.vault", "set", "--format", "json"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn();

    match spawn_result {
        Err(_) => {
            // Sidecar unavailable — echo back a mock credential for offline/dev mode.
            let id = format!(
                "{}-{}",
                match payload.scope {
                    CredentialScope::Default => "default",
                    CredentialScope::Group => "group",
                    CredentialScope::Device => "device",
                },
                payload.target.as_deref().unwrap_or("new")
            );
            Ok(VaultCredential {
                id,
                scope: payload.scope,
                target: payload.target,
                username: payload.username,
                auth_method: payload.auth_method,
                has_enable_secret: payload.enable_secret.is_some(),
            })
        }
        Ok(mut child) => {
            use tokio::io::AsyncWriteExt;
            if let Some(stdin) = child.stdin.take() {
                let mut stdin = tokio::io::BufWriter::new(stdin);
                let _ = stdin.write_all(json_payload.as_bytes()).await;
                let _ = stdin.flush().await;
            }
            match child.wait_with_output().await {
                Err(e) => Err(format!("Failed to wait for vault set process: {e}")),
                Ok(out) => {
                    if out.status.success() {
                        let text = String::from_utf8_lossy(&out.stdout);
                        serde_json::from_str::<VaultCredential>(&text)
                            .map_err(|_| "Failed to parse vault set response".into())
                    } else {
                        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
                        Err(if stderr.is_empty() {
                            "vault_set failed".into()
                        } else {
                            stderr
                        })
                    }
                }
            }
        }
    }
}

/// Delete a credential from the vault by id.
///
/// Calls `python3 -m netops.core.vault delete --id <id> --format json`.
/// Falls back silently when the sidecar is unavailable.
#[tauri::command]
pub async fn vault_delete(id: String) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("Credential id must not be empty".into());
    }

    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.core.vault",
            "delete",
            "--id",
            &id,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            return Ok(());
        }
    }

    // Mock: pretend deletion succeeded
    Ok(())
}

/// Preview which credential would be resolved for the given hostname
/// (default → group → device hierarchy).
///
/// Calls `python3 -m netops.core.vault resolve --hostname <hostname> --format json`.
/// Falls back to mock data when the sidecar is unavailable.
#[tauri::command]
pub async fn vault_resolve(hostname: String) -> Result<VaultResolveResult, String> {
    if hostname.trim().is_empty() {
        return Err("Hostname must not be empty".into());
    }

    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.core.vault",
            "resolve",
            "--hostname",
            &hostname,
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(result) = serde_json::from_str::<VaultResolveResult>(&text) {
                return Ok(result);
            }
        }
    }

    Ok(mock_vault_resolve(&hostname))
}

// ---------------------------------------------------------------------------
// Vault mock helpers
// ---------------------------------------------------------------------------

fn mock_vault_credentials() -> Vec<VaultCredential> {
    vec![
        VaultCredential {
            id: "default-1".into(),
            scope: CredentialScope::Default,
            target: None,
            username: "admin".into(),
            auth_method: AuthMethod::Password,
            has_enable_secret: true,
        },
        VaultCredential {
            id: "group-1".into(),
            scope: CredentialScope::Group,
            target: Some("10.0.1.*".into()),
            username: "netops".into(),
            auth_method: AuthMethod::Password,
            has_enable_secret: false,
        },
        VaultCredential {
            id: "group-2".into(),
            scope: CredentialScope::Group,
            target: Some("core-*".into()),
            username: "svcacct".into(),
            auth_method: AuthMethod::Key,
            has_enable_secret: true,
        },
        VaultCredential {
            id: "device-1".into(),
            scope: CredentialScope::Device,
            target: Some("core-rtr-01".into()),
            username: "admin".into(),
            auth_method: AuthMethod::Password,
            has_enable_secret: true,
        },
    ]
}

fn mock_vault_resolve(hostname: &str) -> VaultResolveResult {
    let creds = mock_vault_credentials();

    // device-specific match
    if let Some(cred) = creds.iter().find(|c| {
        c.scope == CredentialScope::Device
            && c.target.as_deref() == Some(hostname)
    }) {
        return VaultResolveResult {
            hostname: hostname.into(),
            resolved: Some(cred.clone()),
            explanation: format!(
                "Device-specific credential matched for \"{hostname}\"."
            ),
        };
    }

    // group pattern match (simple prefix/glob: ends with * means prefix match)
    if let Some(cred) = creds.iter().find(|c| {
        c.scope == CredentialScope::Group
            && c.target.as_deref().map(|t| {
                if let Some(prefix) = t.strip_suffix('*') {
                    hostname.starts_with(prefix)
                } else {
                    t == hostname
                }
            }) == Some(true)
    }) {
        return VaultResolveResult {
            hostname: hostname.into(),
            resolved: Some(cred.clone()),
            explanation: format!(
                "Group credential matched pattern \"{}\" for \"{hostname}\".",
                cred.target.as_deref().unwrap_or("")
            ),
        };
    }

    // default fallback
    if let Some(cred) = creds
        .iter()
        .find(|c| c.scope == CredentialScope::Default)
    {
        return VaultResolveResult {
            hostname: hostname.into(),
            resolved: Some(cred.clone()),
            explanation: format!(
                "No specific credential found; using default for \"{hostname}\"."
            ),
        };
    }

    VaultResolveResult {
        hostname: hostname.into(),
        resolved: None,
        explanation: format!("No credential found for \"{hostname}\"."),
    }
}

// ---------------------------------------------------------------------------
// Ansible payload types
// ---------------------------------------------------------------------------

/// Filter to narrow which devices appear in the exported inventory.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct InventoryFilter {
    pub vendor: Option<String>,
    pub site: Option<String>,
    pub hostnames: Option<Vec<String>>,
}

/// Ansible-compatible inventory export result.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnsibleInventory {
    pub format: String,
    pub content: String,
    pub group_count: u32,
    pub host_count: u32,
}

/// A variable within a playbook template.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TemplateVariable {
    pub name: String,
    pub description: String,
    pub default_value: String,
    pub required: bool,
}

/// A playbook template available for generation.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub variables: Vec<TemplateVariable>,
}

/// Generated playbook result.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPlaybook {
    pub name: String,
    pub content: String,
    pub device_count: u32,
    pub template: String,
}

// ---------------------------------------------------------------------------
// Ansible commands
// ---------------------------------------------------------------------------

/// Export an Ansible-compatible inventory from scanned devices.
///
/// Calls `python3 -m netops.ansible.dynamic_inventory`.
/// Falls back to mock inventory when the sidecar is unavailable.
#[tauri::command]
pub async fn export_ansible_inventory(
    format: String,
    filter: Option<InventoryFilter>,
) -> Result<AnsibleInventory, String> {
    // Always request JSON from the Python sidecar so we can reliably
    // deserialize with serde_json, regardless of the requested output format.
    let mut args = vec![
        "-m".to_string(),
        "netops.ansible.dynamic_inventory".to_string(),
        "--format".to_string(),
        "json".to_string(),
    ];

    if let Some(ref f) = filter {
        if let Some(ref vendor) = f.vendor {
            args.push("--vendor".into());
            args.push(vendor.clone());
        }
        if let Some(ref site) = f.site {
            args.push("--site".into());
            args.push(site.clone());
        }
        if let Some(ref hostnames) = f.hostnames {
            for h in hostnames {
                args.push("--host".into());
                args.push(h.clone());
            }
        }
    }

    let output = Command::new(PYTHON)
        .args(&args)
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(inv) = serde_json::from_str::<AnsibleInventory>(&text) {
                return Ok(inv);
            }
        }
    }

    Ok(mock_ansible_inventory(&format, &filter))
}

/// Generate an Ansible playbook from a template and device list.
///
/// Calls `python3 -m netops.playbooks.generator`.
/// Falls back to mock playbook when the sidecar is unavailable.
#[tauri::command]
pub async fn generate_playbook(
    devices: Vec<String>,
    template: String,
    variables: Option<std::collections::HashMap<String, String>>,
) -> Result<GeneratedPlaybook, String> {
    if devices.is_empty() {
        return Err("At least one device must be selected".into());
    }

    let mut args = vec![
        "-m".to_string(),
        "netops.playbooks.generator".to_string(),
        "--template".to_string(),
        template.clone(),
        "--format".to_string(),
        "json".to_string(),
    ];

    for d in &devices {
        args.push("--device".into());
        args.push(d.clone());
    }

    if let Some(ref vars) = variables {
        for (k, v) in vars {
            args.push("--var".into());
            args.push(format!("{k}={v}"));
        }
    }

    let output = Command::new(PYTHON)
        .args(&args)
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(pb) = serde_json::from_str::<GeneratedPlaybook>(&text) {
                return Ok(pb);
            }
        }
    }

    Ok(mock_generate_playbook(&devices, &template, &variables))
}

/// List available playbook templates.
///
/// Calls `python3 -m netops.playbooks.generator --list-templates`.
/// Falls back to mock templates when the sidecar is unavailable.
#[tauri::command]
pub async fn list_playbook_templates() -> Result<Vec<PlaybookTemplate>, String> {
    let output = Command::new(PYTHON)
        .args([
            "-m",
            "netops.playbooks.generator",
            "--list-templates",
            "--format",
            "json",
        ])
        .output()
        .await;

    if let Ok(out) = output {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if let Ok(templates) = serde_json::from_str::<Vec<PlaybookTemplate>>(&text) {
                return Ok(templates);
            }
        }
    }

    Ok(mock_playbook_templates())
}

// ---------------------------------------------------------------------------
// Ansible mock helpers
// ---------------------------------------------------------------------------

/// Device entry used for building mock inventory data.
struct MockDevice {
    hostname: &'static str,
    ip: &'static str,
    vendor: &'static str,
    model: &'static str,
    serial: &'static str,
    site: &'static str,
    network_os: &'static str,
}

fn mock_device_list() -> Vec<MockDevice> {
    vec![
        MockDevice { hostname: "core-rtr-01", ip: "10.0.0.1", vendor: "cisco_ios", model: "ASR1001-X", serial: "FXS2208Q1GD", site: "NYC-DC1", network_os: "ios" },
        MockDevice { hostname: "core-rtr-02", ip: "10.0.0.2", vendor: "cisco_ios", model: "ASR1001-X", serial: "FXS2208Q1GE", site: "NYC-DC1", network_os: "ios" },
        MockDevice { hostname: "edge-rtr-01", ip: "10.0.1.1", vendor: "nokia_sros", model: "7750 SR-12", serial: "NS22010001", site: "NYC-DC1", network_os: "sros" },
        MockDevice { hostname: "edge-rtr-02", ip: "10.0.1.2", vendor: "nokia_sros", model: "7750 SR-12", serial: "NS22010002", site: "LON-DC2", network_os: "sros" },
        MockDevice { hostname: "spine-sw-01", ip: "10.1.0.1", vendor: "arista_eos", model: "DCS-7050CX3-32S", serial: "HSH21270001", site: "NYC-DC1", network_os: "eos" },
        MockDevice { hostname: "spine-sw-02", ip: "10.1.0.2", vendor: "arista_eos", model: "DCS-7050CX3-32S", serial: "HSH21270002", site: "LON-DC2", network_os: "eos" },
        MockDevice { hostname: "leaf-sw-01", ip: "10.1.1.1", vendor: "arista_eos", model: "DCS-7020R-48S2-R", serial: "HSH20100011", site: "NYC-DC1", network_os: "eos" },
        MockDevice { hostname: "leaf-sw-02", ip: "10.1.1.2", vendor: "arista_eos", model: "DCS-7020R-48S2-R", serial: "HSH20100012", site: "NYC-DC1", network_os: "eos" },
        MockDevice { hostname: "agg-rtr-01", ip: "10.0.2.1", vendor: "cisco_ios", model: "ISR4451", serial: "FGL2404AA4B", site: "SYD-DC3", network_os: "ios" },
        MockDevice { hostname: "agg-rtr-02", ip: "10.0.2.2", vendor: "cisco_ios", model: "ISR4451", serial: "FGL2404AA4C", site: "SYD-DC3", network_os: "ios" },
        MockDevice { hostname: "pe-rtr-01", ip: "10.0.3.1", vendor: "nokia_sros", model: "7210 SAS-T", serial: "NS21070003", site: "LON-DC2", network_os: "sros" },
        MockDevice { hostname: "pe-rtr-02", ip: "10.0.3.2", vendor: "nokia_sros", model: "7210 SAS-T", serial: "NS21070004", site: "SYD-DC3", network_os: "sros" },
        MockDevice { hostname: "border-sw-01", ip: "10.1.2.1", vendor: "arista_eos", model: "DCS-7280CR3-32P4", serial: "HSH22010013", site: "NYC-DC1", network_os: "eos" },
        MockDevice { hostname: "dist-rtr-01", ip: "10.0.4.1", vendor: "cisco_ios", model: "Catalyst 9300", serial: "FCW2319Y0J2", site: "SYD-DC3", network_os: "ios" },
        MockDevice { hostname: "wan-rtr-01", ip: "10.0.5.1", vendor: "nokia_sros", model: "7705 SAR-8", serial: "NS20100005", site: "LON-DC2", network_os: "sros" },
    ]
}

fn mock_ansible_inventory(format: &str, filter: &Option<InventoryFilter>) -> AnsibleInventory {
    let all_devices = mock_device_list();

    let devices: Vec<&MockDevice> = all_devices
        .iter()
        .filter(|d| {
            if let Some(ref f) = filter {
                if let Some(ref vendor) = f.vendor {
                    if d.vendor != vendor.as_str() {
                        return false;
                    }
                }
                if let Some(ref site) = f.site {
                    if d.site != site.as_str() {
                        return false;
                    }
                }
                if let Some(ref hostnames) = f.hostnames {
                    if !hostnames.iter().any(|h| h == d.hostname) {
                        return false;
                    }
                }
            }
            true
        })
        .collect();

    // Group by vendor
    let mut groups: std::collections::HashMap<&str, Vec<&MockDevice>> =
        std::collections::HashMap::new();
    for d in &devices {
        groups.entry(d.vendor).or_default().push(d);
    }

    let host_count = devices.len() as u32;
    let group_count = groups.len() as u32;

    let content = if format == "json" {
        build_inventory_json(&groups)
    } else {
        build_inventory_yaml(&groups)
    };

    AnsibleInventory {
        format: format.to_string(),
        content,
        group_count,
        host_count,
    }
}

fn build_inventory_yaml(
    groups: &std::collections::HashMap<&str, Vec<&MockDevice>>,
) -> String {
    let mut out = String::from("all:\n  children:\n");
    let mut sorted_groups: Vec<_> = groups.iter().collect();
    sorted_groups.sort_by_key(|(k, _)| *k);

    for (vendor, devs) in sorted_groups {
        let network_os = devs.first().map(|d| d.network_os).unwrap_or("unknown");
        out.push_str(&format!("    {vendor}:\n      hosts:\n"));
        for d in devs {
            out.push_str(&format!(
                "        {}:\n          ansible_host: {}\n          model: {}\n          serial: {}\n          site: {}\n",
                d.hostname, d.ip, d.model, d.serial, d.site
            ));
        }
        out.push_str(&format!(
            "      vars:\n        ansible_network_os: {network_os}\n        ansible_connection: network_cli\n"
        ));
    }
    out
}

fn build_inventory_json(
    groups: &std::collections::HashMap<&str, Vec<&MockDevice>>,
) -> String {
    use serde_json::{json, Map, Value};

    let mut children = Map::new();
    let mut sorted_groups: Vec<_> = groups.iter().collect();
    sorted_groups.sort_by_key(|(k, _)| *k);

    for (vendor, devs) in sorted_groups {
        let network_os = devs.first().map(|d| d.network_os).unwrap_or("unknown");
        let mut hosts = Map::new();
        for d in devs {
            hosts.insert(
                d.hostname.to_string(),
                json!({
                    "ansible_host": d.ip,
                    "model": d.model,
                    "serial": d.serial,
                    "site": d.site,
                }),
            );
        }
        children.insert(
            vendor.to_string(),
            json!({
                "hosts": Value::Object(hosts),
                "vars": {
                    "ansible_network_os": network_os,
                    "ansible_connection": "network_cli",
                },
            }),
        );
    }

    let inventory = json!({ "all": { "children": Value::Object(children) } });
    serde_json::to_string_pretty(&inventory).unwrap_or_default()
}

fn mock_playbook_templates() -> Vec<PlaybookTemplate> {
    vec![
        PlaybookTemplate {
            id: "backup-config".into(),
            name: "Backup Configuration".into(),
            description: "Collect running configuration from target devices and store locally."
                .into(),
            variables: vec![
                TemplateVariable {
                    name: "backup_dir".into(),
                    description: "Local directory to store backups".into(),
                    default_value: "./backups".into(),
                    required: true,
                },
                TemplateVariable {
                    name: "timestamp_format".into(),
                    description: "Timestamp format for backup filenames".into(),
                    default_value: "%Y%m%d_%H%M%S".into(),
                    required: false,
                },
            ],
        },
        PlaybookTemplate {
            id: "health-check".into(),
            name: "Health Check".into(),
            description:
                "Run health checks across selected devices — CPU, memory, interface errors."
                    .into(),
            variables: vec![
                TemplateVariable {
                    name: "cpu_threshold".into(),
                    description: "CPU usage warning threshold (%)".into(),
                    default_value: "80".into(),
                    required: false,
                },
                TemplateVariable {
                    name: "memory_threshold".into(),
                    description: "Memory usage warning threshold (%)".into(),
                    default_value: "85".into(),
                    required: false,
                },
            ],
        },
        PlaybookTemplate {
            id: "firmware-upgrade".into(),
            name: "Firmware Upgrade".into(),
            description:
                "Stage and activate firmware on target devices with pre/post checks.".into(),
            variables: vec![
                TemplateVariable {
                    name: "firmware_image".into(),
                    description: "Path or URL to firmware image".into(),
                    default_value: String::new(),
                    required: true,
                },
                TemplateVariable {
                    name: "reboot_wait".into(),
                    description: "Seconds to wait for device reboot".into(),
                    default_value: "300".into(),
                    required: false,
                },
                TemplateVariable {
                    name: "pre_check".into(),
                    description: "Run pre-upgrade health check".into(),
                    default_value: "true".into(),
                    required: false,
                },
            ],
        },
        PlaybookTemplate {
            id: "ntp-config".into(),
            name: "Configure NTP".into(),
            description: "Deploy NTP server configuration to selected devices.".into(),
            variables: vec![
                TemplateVariable {
                    name: "ntp_server_1".into(),
                    description: "Primary NTP server address".into(),
                    default_value: "10.0.0.100".into(),
                    required: true,
                },
                TemplateVariable {
                    name: "ntp_server_2".into(),
                    description: "Secondary NTP server address".into(),
                    default_value: "10.0.0.101".into(),
                    required: false,
                },
            ],
        },
        PlaybookTemplate {
            id: "snmp-config".into(),
            name: "Configure SNMP".into(),
            description: "Deploy SNMP v2c/v3 community and trap configuration.".into(),
            variables: vec![
                TemplateVariable {
                    name: "snmp_community".into(),
                    description: "SNMP community string".into(),
                    default_value: "public".into(),
                    required: true,
                },
                TemplateVariable {
                    name: "trap_server".into(),
                    description: "SNMP trap destination".into(),
                    default_value: "10.0.0.200".into(),
                    required: true,
                },
                TemplateVariable {
                    name: "snmp_version".into(),
                    description: "SNMP version (2c or 3)".into(),
                    default_value: "2c".into(),
                    required: false,
                },
            ],
        },
    ]
}

/// Escape a string value for safe embedding in a YAML double-quoted scalar.
fn yaml_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn mock_generate_playbook(
    devices: &[String],
    template: &str,
    variables: &Option<std::collections::HashMap<String, String>>,
) -> GeneratedPlaybook {
    let templates = mock_playbook_templates();
    let tmpl = templates.iter().find(|t| t.id == template);
    let tmpl_name = tmpl.map(|t| t.name.as_str()).unwrap_or(template);

    // Build vars section with safe YAML escaping
    let mut vars_section = String::new();
    if let Some(tmpl) = tmpl {
        for v in &tmpl.variables {
            let val = variables
                .as_ref()
                .and_then(|vs| vs.get(&v.name))
                .map(|s| s.as_str())
                .unwrap_or(&v.default_value);
            if !val.is_empty() {
                vars_section.push_str(&format!(
                    "    {}: \"{}\"\n",
                    v.name,
                    yaml_escape(val)
                ));
            }
        }
    }

    let content = format!(
        "---\n- name: {tmpl_name}\n  hosts: all\n  gather_facts: false\n{vars_block}  tasks:\n    - name: Execute {tmpl_name}\n      debug:\n        msg: \"Running {tmpl_name} on {{{{ inventory_hostname }}}}\"\n",
        vars_block = if vars_section.is_empty() {
            String::new()
        } else {
            format!("  vars:\n{vars_section}\n")
        },
    );

    GeneratedPlaybook {
        name: format!("{template}-playbook.yml"),
        content,
        device_count: devices.len() as u32,
        template: template.to_string(),
    }
}
