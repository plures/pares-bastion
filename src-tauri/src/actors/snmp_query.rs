//! SNMP query actor — performs SNMP GET/WALK operations.
//!
//! Pure IO: send SNMP request, receive response.

/// SNMP query result for a single OID.
#[derive(Debug, Clone)]
pub struct SnmpResult {
    pub oid: String,
    pub value: String,
}

/// Perform SNMP GET using system snmpget command.
///
/// Falls back to shell-out since pure-Rust SNMP libraries are limited.
/// This is acceptable — SNMP is UDP, low-overhead.
pub fn snmp_get(
    host: &str,
    community: &str,
    oids: &[&str],
    timeout: u32,
) -> Vec<SnmpResult> {
    let mut results = Vec::new();

    for oid in oids {
        let output = std::process::Command::new("snmpget")
            .args(["-v2c", "-c", community, "-t", &timeout.to_string(), host, oid])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let line = String::from_utf8_lossy(&out.stdout);
                // Parse: "OID = TYPE: VALUE"
                if let Some(eq_pos) = line.find('=') {
                    let value = line[eq_pos + 1..].trim();
                    // Strip type prefix (STRING:, INTEGER:, etc.)
                    let clean = if let Some(colon) = value.find(':') {
                        value[colon + 1..].trim().trim_matches('"').to_string()
                    } else {
                        value.to_string()
                    };
                    results.push(SnmpResult {
                        oid: oid.to_string(),
                        value: clean,
                    });
                }
            }
        }
    }

    results
}
