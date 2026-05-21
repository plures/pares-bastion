//! Actors module — side-effect boundary for netops operations.
//!
//! Each actor performs exactly ONE type of IO:
//! - ssh_connect: establish SSH session
//! - ssh_detect: run netmiko-style autodetection
//! - device_command: send command, return output
//! - snmp_query: SNMP GET/WALK
//! - ping: ICMP reachability
//! - write_fixture: save captured output to disk
//! - mock_ssh_server: simulated device SSH responder
//!
//! All logic lives in .px files. Actors are thin IO wrappers.

pub mod ssh_connect;
pub mod device_command;
pub mod snmp_query;
pub mod ping;
pub mod fixture_recorder;
pub mod mock_ssh_server;
