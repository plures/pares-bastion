# Network Device Simulation Infrastructure

## Architecture

```
                    ┌─────────────────────────────┐
                    │   CONTAINERLAB (real NOS)    │
                    │  Nokia SRL · Arista cEOS     │
                    │  Cisco XRd · Juniper cRPD    │
                    └──────────────┬──────────────┘
                                   │
                    fixture-recorder.rs (Rust actor)
                                   │
                    ┌──────────────▼──────────────┐
                    │   CAPTURED FIXTURES          │
                    │  fixtures/<vendor>-<ver>/     │
                    │  Real device output, versioned│
                    └──────────────┬──────────────┘
                                   │
                    Compiled via netops-simulate.px
                                   │
                    ┌──────────────▼──────────────┐
                    │   PRAXIS SIMULATION (.px)    │
                    │  Deterministic, fast, no IO  │
                    └──────────────┬──────────────┘
                                   │
                    mock_ssh_server.rs (Rust actor)
                                   │
                    ┌──────────────▼──────────────┐
                    │   FAST CI TESTS              │
                    │  Seconds, no containers      │
                    └─────────────────────────────┘
```

## Praxis-First Design

All logic lives in `.px` files:

| File | Purpose |
|---|---|
| `praxis/netops-detect.px` | Vendor identification rules |
| `praxis/netops-simulate.px` | Device simulation personalities |
| `praxis/netops-scan.px` | Scan orchestration pipeline |
| `praxis/netops-record.px` | Fixture recording workflow |

Rust actors are thin IO wrappers:

| Actor | Side Effect |
|---|---|
| `ssh_connect.rs` | TCP + SSH handshake |
| `device_command.rs` | Send bytes, read bytes |
| `snmp_query.rs` | UDP SNMP requests |
| `ping.rs` | ICMP echo |
| `fixture_recorder.rs` | Write files to disk |
| `mock_ssh_server.rs` | Accept SSH connections |

## Quick Start

### Deploy Containerlab (fixture recording)

```bash
# Install containerlab
bash -c "$(curl -sL https://get.containerlab.dev)"

# Pull Nokia SR Linux (free, no registration)
docker pull ghcr.io/nokia/srlinux:24.10.1

# Deploy the lab
clab deploy -t clab/netops-fixtures.yml

# Record fixtures from all devices
cargo run -- fixture-record --topology clab/netops-fixtures.yml

# Destroy lab when done
clab destroy -t clab/netops-fixtures.yml
```

### Record from real devices (legacy gear)

```bash
# Record from nrush's Brocade MLXe
cargo run -- fixture-record \
  --host 10.221.0.185 \
  --user admin \
  --vendor-hint brocade_fastiron \
  --output fixtures/brocade-ironware-6.3.0e/
```

### Run fast CI tests (no containers needed)

```bash
cargo test --workspace
```

### Run full integration tests (containerlab required)

```bash
clab deploy -t clab/netops-fixtures.yml
cargo test --features integration
clab destroy -t clab/netops-fixtures.yml
```

## Adding a New Device Type

1. Add device to `clab/netops-fixtures.yml` (or record from real hardware)
2. Run `fixture-record` to capture outputs
3. Add personality to `praxis/netops-simulate.px`
4. Add detection rules to `praxis/netops-detect.px` if needed
5. Run tests — new personality is automatically available to mock server

## Fixture Directory Structure

```
fixtures/
  nokia-srlinux-24.10.1/
    __manifest__.json          # Metadata (vendor, prompt, timestamp)
    __connect_banner__.txt     # What device sends on connect
    __prompt_pattern__.txt     # Prompt regex
    show_version.txt           # show version output
    show_system_information.txt
    info_from_state__system__information.txt
  brocade-ironware-6.3.0e/
    __manifest__.json
    show_version.txt
    show_inventory.txt
    show_running-config__include_snmp-server_community.txt
  cisco-xrd-7.11.1/
    ...
```

## Why This Approach

1. **No hallucinated fixtures** — every response is recorded from a real device
2. **Version-stamped** — when firmware updates, re-record and diff
3. **Two test tiers** — fast (praxis simulation) and thorough (containerlab)
4. **Praxis logic is testable in isolation** — no network needed to validate detection rules
5. **Rust performance** — SSH to thousands of devices concurrently
6. **Ecosystem native** — uses PluresDB for state, praxis for logic, radix for UI
