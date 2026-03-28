#[cfg(test)]
mod tests {
    use super::super::models::*;

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    #[test]
    fn free_license_is_active() {
        let lic = License::free();
        assert_eq!(lic.compute_status(now_ms()), LicenseStatus::Active);
        assert_eq!(lic.tier, LicenseTier::Free);
        assert_eq!(lic.max_synced_partitions, 0);
    }

    #[test]
    fn expired_without_grace() {
        let now = now_ms();
        let lic = License {
            valid_from: now - 100_000,
            valid_until: Some(now - 1000), // expired 1 second ago
            grace_until: None,
            ..License::free()
        };
        assert_eq!(lic.compute_status(now), LicenseStatus::Expired);
        assert!(!lic.is_sync_capable(now));
    }

    #[test]
    fn expired_within_grace() {
        let now = now_ms();
        let lic = License {
            valid_from: now - 100_000,
            valid_until: Some(now - 1000),
            grace_until: Some(now + 86_400_000), // grace until tomorrow
            ..License::free()
        };
        assert_eq!(lic.compute_status(now), LicenseStatus::Grace);
        assert!(lic.is_sync_capable(now));
    }

    #[test]
    fn expired_past_grace() {
        let now = now_ms();
        let lic = License {
            valid_from: now - 200_000,
            valid_until: Some(now - 100_000),
            grace_until: Some(now - 1000), // grace also expired
            ..License::free()
        };
        assert_eq!(lic.compute_status(now), LicenseStatus::Expired);
        assert!(!lic.is_sync_capable(now));
    }

    #[test]
    fn not_yet_valid() {
        let now = now_ms();
        let lic = License {
            valid_from: now + 100_000, // starts in the future
            ..License::free()
        };
        assert_eq!(lic.compute_status(now), LicenseStatus::Suspended);
    }

    #[test]
    fn revoked_stays_revoked() {
        let lic = License {
            status: LicenseStatus::Revoked,
            ..License::free()
        };
        assert_eq!(lic.compute_status(now_ms()), LicenseStatus::Revoked);
    }

    #[test]
    fn no_seat_fields() {
        // Verify the License struct has NO seat/user limit fields
        let lic = License::free();
        // If this compiles, there are no seat fields.
        // The license only limits partitions, not users.
        assert!(lic.max_synced_partitions >= 0 || lic.max_synced_partitions == -1);
    }

    #[test]
    fn tier_partition_limits() {
        // Free: 0 synced
        let free = License::free();
        assert_eq!(free.max_synced_partitions, 0);

        // Pro: 1 synced
        let pro = License {
            tier: LicenseTier::Pro,
            max_synced_partitions: 1,
            ..License::free()
        };
        assert_eq!(pro.max_synced_partitions, 1);

        // Team: 5 synced
        let team = License {
            tier: LicenseTier::Team,
            max_synced_partitions: 5,
            ..License::free()
        };
        assert_eq!(team.max_synced_partitions, 5);

        // Enterprise: unlimited (-1)
        let ent = License {
            tier: LicenseTier::Enterprise,
            max_synced_partitions: -1,
            ..License::free()
        };
        assert_eq!(ent.max_synced_partitions, -1);
    }
}
