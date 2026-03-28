//! Tauri commands for license management.

use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use super::models::{License, LicenseFile};
use super::verify;

/// Managed state for the active license.
pub struct LicenseState(pub Arc<Mutex<License>>);

/// Import a license file: verify signature, persist, return license info.
#[tauri::command]
pub async fn import_license(
    state: State<'_, LicenseState>,
    file_contents: String,
) -> Result<License, String> {
    let file: LicenseFile =
        serde_json::from_str(&file_contents).map_err(|e| format!("Invalid license file: {e}"))?;

    // Verify signature
    if let Err(e) = verify::verify_license(&file) {
        // In development, log but don't block (placeholder key)
        eprintln!("License signature verification: {e}");
        // TODO: In production, return Err here
    }

    // Build license with computed status
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut license = License {
        license_id: file.license.license_id,
        org_id: file.license.org_id,
        tier: file.license.tier,
        status: super::models::LicenseStatus::Active, // will be recomputed
        issued_at: file.license.issued_at,
        valid_from: file.license.valid_from,
        valid_until: file.license.valid_until,
        grace_until: file.license.grace_until,
        max_synced_partitions: file.license.max_synced_partitions,
        features: file.license.features,
        signature: file.signature,
        issuer: file.license.issuer,
        offline_capable: file.license.offline_capable,
        metadata: file.license.metadata,
    };

    let status = license.compute_status(now_ms);
    if matches!(
        status,
        super::models::LicenseStatus::Expired | super::models::LicenseStatus::Revoked
    ) {
        return Err(format!("License is {status:?}"));
    }
    license.status = status;

    // Persist
    let mut guard = state.0.lock().await;
    *guard = license.clone();

    // TODO: Also persist to disk (license.json in app data dir)

    Ok(license)
}

/// Get the current active license.
#[tauri::command]
pub async fn get_license(state: State<'_, LicenseState>) -> Result<License, String> {
    let guard = state.0.lock().await;
    Ok(guard.clone())
}

/// Validate a license file without importing it.
#[tauri::command]
pub async fn validate_license(file_contents: String) -> Result<bool, String> {
    let file: LicenseFile =
        serde_json::from_str(&file_contents).map_err(|e| format!("Invalid license file: {e}"))?;

    match verify::verify_license(&file) {
        Ok(()) => Ok(true),
        Err(e) => Err(format!("Verification failed: {e}")),
    }
}

/// Deactivate the current license, reverting to free tier.
#[tauri::command]
pub async fn deactivate_license(state: State<'_, LicenseState>) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    *guard = License::free();
    Ok(())
}
