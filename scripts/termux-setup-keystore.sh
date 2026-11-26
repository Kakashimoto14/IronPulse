#!/usr/bin/env bash
set -euo pipefail

KEY_DIR="${HOME}/ironpulse-keys"
KS_FILE="${KEY_DIR}/ironpulse-release.keystore"
KEY_ALIAS="ironpulse"
PASS="${1:-IronPulse2026Key}"

echo "=== [IronPulse] Permanent Production Keystore Setup (Termux) ==="
if ! command -v openssl >/dev/null 2>&1; then
  echo "Installing openssl-tool..."
  pkg update -y >/dev/null 2>&1 || true
  pkg install -y openssl-tool
fi

mkdir -p "${KEY_DIR}"
if [[ -f "${KS_FILE}" ]]; then
  echo "Existing keystore found at ${KS_FILE} — keeping it safe (delete manually only if you want a new key)."
else
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "${KEY_DIR}/key.pem" \
    -out "${KEY_DIR}/cert.pem" \
    -days 10000 \
    -subj "/CN=Yuleen Aaron Obsanga/OU=IronPulse/O=Kakashimoto14/L=Rodriguez/ST=Rizal/C=PH" 2>/dev/null

  openssl pkcs12 -export \
    -in "${KEY_DIR}/cert.pem" \
    -inkey "${KEY_DIR}/key.pem" \
    -out "${KS_FILE}" \
    -name "${KEY_ALIAS}" \
    -keypbe AES-256-CBC \
    -certpbe AES-256-CBC \
    -macalg sha256 \
    -passout "pass:${PASS}"

  chmod 600 "${KS_FILE}" "${KEY_DIR}/key.pem"
  echo "Generated permanent keystore at: ${KS_FILE}"
fi

# Extract single-line Base64 and colon-free SHA-256
base64 "${KS_FILE}" | tr -d '\n\r ' > "${KEY_DIR}/KEYSTORE_B64.txt"
SHA256=$(openssl x509 -in "${KEY_DIR}/cert.pem" -noout -fingerprint -sha256 | sed 's/.*=//;s/://g' | tr 'A-Z' 'a-z')
printf '%s\n' "${SHA256}" > "${KEY_DIR}/EXPECTED_SHA256.txt"

# Copy KEYSTORE_B64 directly to Android clipboard if termux-clipboard-set is available
if command -v termux-clipboard-set >/dev/null 2>&1; then
  cat "${KEY_DIR}/KEYSTORE_B64.txt" | termux-clipboard-set
  echo "[CLIPBOARD] KEYSTORE_B64 copied to your Android clipboard!"
fi

echo ""
echo "========================================================================"
echo "ADD THESE 5 SECRETS AT:"
echo "https://github.com/Kakashimoto14/IronPulse/settings/secrets/actions"
echo "========================================================================"
echo "1) KEYSTORE_B64    -> saved in: ${KEY_DIR}/KEYSTORE_B64.txt"
echo "                      (view anytime: cat ~/ironpulse-keys/KEYSTORE_B64.txt)"
echo "2) KEYSTORE_PASS   -> ${PASS}"
echo "3) KEY_ALIAS       -> ${KEY_ALIAS}"
echo "4) KEY_PASS        -> ${PASS}"
echo "5) EXPECTED_SHA256 -> ${SHA256}"
echo "========================================================================"
echo "Backup saved outside your repo in ${KEY_DIR} (NEVER commit this folder)."
