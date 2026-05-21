//! SNMP query actor — performs SNMP GET/WALK operations.
//!
//! Pure IO: send SNMP request, receive response.
//! The praxis procedure decides which OIDs to query and what to do with results.

use anyhow::Result;
use std::time::Duration;

/// SNMP query parameters.
pub struct SnmpQueryParams {
    pub host: String,
    pub port: u16,
    pub community: String,
    pub oids: Vec<String>,
    pub timeout: Duration,
}

/// SNMP query result for a single OID.
pub struct SnmpResult {
    pub oid: String,
    pub value: String,
}

/// Perform SNMP GET for a list of OIDs.
///
/// Returns results for each OID that responded.
/// Non-responding OIDs are omitted (not errors).
pub fn snmp_get(_params: &SnmpQueryParams) -> Result<Vec<SnmpResult>> {
    // TODO: Implement using snmp crate (pure Rust SNMP library)
    // or shell out to snmpget for initial implementation.
    //
    // The praxis procedure (netops-scan.px) handles:
    // - Which OIDs to query (vendor-specific)
    // - Retry logic
    // - Interpretation of results (vendor identification from sysDescr)
    //
    // This actor just sends UDP packets and returns raw values.
    
    Ok(vec![])
}

/// Perform SNMP WALK over an OID subtree.
pub fn snmp_walk(_params: &SnmpQueryParams) -> Result<Vec<SnmpResult>> {
    // TODO: Implement SNMP WALK
    Ok(vec![])
}
