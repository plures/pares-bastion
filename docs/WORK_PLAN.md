# pares-bastion: Netops Simulation Infrastructure — Architecture & Work Plan

## Current State
- Tauri 2 app with 1011-line commands.rs (TCP scanning, vault, inventory — all working)
- 6 Rust actor skeletons (compile, no functionality)
- 4 .px files (logic defined, not executed)
- Containerlab topology defined (not deployed)
- fixtures/ directory empty
- No tests for simulation infra

## Target State
A working end-to-end pipeline:
1. Containerlab deploys real NOS containers
2. Fixture recorder SSHes in, captures real device output
3. Captured fixtures compile into .px simulation personalities
4. Mock SSH server (Rust/russh) responds to netmiko using those fixtures
5. Integration tests run against mock server, validate parsers
6. CLI subcommand: `pares-bastion netops scan/record/simulate`

## Architecture

```
src-tauri/src/
  netops/                    ← NEW: netops module (replaces actors/)
    mod.rs                   ← Module root: re-exports
    cli.rs                   ← CLI subcommands: scan, record, simulate
    detect.rs                ← Vendor detection (compiled from netops-detect.px logic)
    parse.rs                 ← Version/model/serial extraction per vendor
    ssh.rs                   ← SSH client (ssh2 crate, legacy KEX support)
    command.rs               ← Send command, read until prompt
    scanner.rs               ← Scan orchestration (ping → SNMP → SSH → enrich)
    recorder.rs              ← Fixture recording from real/containerlab devices
    personality.rs           ← Load fixture dirs into Personality structs
    mock_server.rs           ← russh-based SSH server driven by personalities
    snmp.rs                  ← SNMP GET/WALK via system snmpget
    ping.rs                  ← ICMP ping sweep
    types.rs                 ← Shared types: Device, ScanResult, Personality, Module

  tests/
    netops_detect_test.rs    ← Vendor detection against real fixture data
    netops_parse_test.rs     ← Parser tests per vendor
    netops_mock_test.rs      ← Mock server integration tests
    netops_scanner_test.rs   ← End-to-end scan pipeline tests

fixtures/                    ← Real device output (recorded, not invented)
  brocade-ironware-6.3.0e/   ← From nrush's MLXe
    __manifest__.json
    show_version.txt
    show_inventory.txt
  cisco-ios-15.6.1.S2/       ← From nrush's ME3600X
    ...
  brocade-fastiron-08.0.95/  ← From netops-toolkit test fixtures
    ...

praxis/                      ← Logic rules (reference, compiled to Rust)
  netops-detect.px
  netops-simulate.px
  netops-scan.px
  netops-record.px

clab/                        ← Containerlab topology
  netops-fixtures.yml
  configs/*.cfg
```

## Naming Conventions
- Module: `netops::` prefix for all netops types/functions
- Types: PascalCase — `ScanResult`, `Personality`, `DeviceModule`
- Functions: snake_case — `detect_vendor`, `parse_version`, `send_command`
- Fixtures: `<vendor>-<os>-<version>/` directories
- Fixture files: `show_version.txt`, `show_inventory.txt` (underscore, lowercase)
- Test functions: `test_<module>_<behavior>` — `test_detect_brocade_ironware`
- Constants: SCREAMING_SNAKE — `VENDOR_PROBE_ORDER`, `SSH_TIMEOUT_DEFAULT`

## Development Standards
- Every function gets a doc comment explaining IO vs pure logic
- No unwrap() in production code — use anyhow::Result or Option
- Tests use real fixture data, never invented strings
- Each vendor parser must have at least one test with real captured output
- Mock server must pass netmiko SSHDetect against it (the ultimate integration test)
- Cargo clippy clean, no warnings

## Work Streams (parallelizable)

### Stream 1: Core Types + Vendor Detection (types.rs, detect.rs, parse.rs)
- Define Device, ScanResult, Personality, DeviceModule types
- Implement detect_vendor() from raw output (port netops-detect.px logic to Rust)
- Implement parse_version(), parse_model(), parse_serial() per vendor
- Tests against existing fixture files from netops-toolkit

### Stream 2: SSH Client + Command Execution (ssh.rs, command.rs)
- Real SSH client using ssh2 crate with legacy KEX support
- send_command() with prompt detection and timeout
- use_keys=false, allow_agent=false by default
- SSHDetect-equivalent with threaded timeout

### Stream 3: Mock SSH Server (mock_server.rs, personality.rs)
- russh-based server that accepts connections
- Password auth, PTY/shell handling
- Route commands through Personality fixtures
- Vendor-appropriate prompts and error messages
- Must survive netmiko ConnectHandler + SSHDetect

### Stream 4: Fixture Recording + Test Data (recorder.rs, fixtures/)
- Record from real devices or containerlab
- Port existing Python fixtures from netops-toolkit
- Write __manifest__.json with vendor/prompt/timestamp
- Fixture loader that builds Personality from directory

### Stream 5: Scanner Pipeline + CLI (scanner.rs, cli.rs)
- ping_sweep → snmp_identify → ssh_deep_scan → enrich
- Wire into Tauri commands AND standalone CLI
- Port the scan logic from netops-toolkit scan.py
