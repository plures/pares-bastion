//! Ed25519 signature verification for offline license files.
//!
//! License file format:
//!   { "license": <payload>, "signature": "<base64 Ed25519 sig>" }
//!
//! The signature covers the canonical JSON of the license payload
//! (deterministic serialization, no whitespace).

use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use super::models::{LicenseFile, LicensePayload};

/// Embedded public key for license verification.
/// In production, this is baked into the binary at build time.
/// Format: 32 bytes, hex-encoded.
///
/// TODO: Replace with real production key before first release.
const EMBEDDED_PUBLIC_KEY_HEX: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

/// Verify a license file's signature against the embedded public key.
pub fn verify_license(file: &LicenseFile) -> Result<(), VerifyError> {
    let payload_json = canonical_json(&file.license)?;
    let sig_bytes = base64_decode(&file.signature)?;
    let key_bytes = hex_decode(EMBEDDED_PUBLIC_KEY_HEX)?;

    let verifying_key = VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| VerifyError::InvalidPublicKey)?;

    let signature = Signature::from_bytes(&sig_bytes);

    verifying_key
        .verify(payload_json.as_bytes(), &signature)
        .map_err(|_| VerifyError::InvalidSignature)
}

/// Verify against a specific public key (for testing or key rotation).
pub fn verify_license_with_key(
    file: &LicenseFile,
    public_key_hex: &str,
) -> Result<(), VerifyError> {
    let payload_json = canonical_json(&file.license)?;
    let sig_bytes = base64_decode(&file.signature)?;
    let key_bytes = hex_decode(public_key_hex)?;

    let verifying_key = VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| VerifyError::InvalidPublicKey)?;

    let signature = Signature::from_bytes(&sig_bytes);

    verifying_key
        .verify(payload_json.as_bytes(), &signature)
        .map_err(|_| VerifyError::InvalidSignature)
}

// ─── Error Type ─────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("Failed to serialize license payload")]
    SerializationError,
    #[error("Invalid base64 signature")]
    InvalidBase64,
    #[error("Invalid hex public key")]
    InvalidHex,
    #[error("Invalid public key")]
    InvalidPublicKey,
    #[error("Signature verification failed")]
    InvalidSignature,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// Produce canonical (deterministic) JSON for signature verification.
fn canonical_json(payload: &LicensePayload) -> Result<String, VerifyError> {
    serde_json::to_string(payload).map_err(|_| VerifyError::SerializationError)
}

fn base64_decode(input: &str) -> Result<[u8; 64], VerifyError> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(input)
        .map_err(|_| VerifyError::InvalidBase64)?;
    bytes
        .try_into()
        .map_err(|_| VerifyError::InvalidBase64)
}

fn hex_decode(input: &str) -> Result<[u8; 32], VerifyError> {
    let bytes: Result<Vec<u8>, _> = (0..input.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&input[i..i + 2], 16))
        .collect();
    let bytes = bytes.map_err(|_| VerifyError::InvalidHex)?;
    bytes
        .try_into()
        .map_err(|_| VerifyError::InvalidHex)
}
