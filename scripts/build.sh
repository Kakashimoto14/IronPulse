#!/usr/bin/env bash
set -euo pipefail

APP_NAME="IronPulse"
PKG_PATH="com/kakashimoto/ironpulse"
BUILD_DIR="build"
GEN_DIR="${BUILD_DIR}/gen"
OBJ_DIR="${BUILD_DIR}/obj"
DEX_DIR="${BUILD_DIR}/dex"
OUT_DIR="dist"

# Resolve version from version.json (and override cleanly with Git tag vX.Y.Z on tagged releases)
eval "$(python3 - <<'PY'
import json, os, re
with open("version.json", encoding="utf-8") as f:
    v = json.load(f)
ver = str(v["version"]).lstrip("v")
repo = str(v.get("repo", "Kakashimoto14/IronPulse"))
ref_name = os.environ.get("GITHUB_REF_NAME", "")
if re.match(r"^v[0-9]+\.[0-9]+\.[0-9]+$", ref_name):
    ver = ref_name[1:]
parts = [int(x) for x in ver.split(".")[:3]]
while len(parts) < 3:
    parts.append(0)
vcode = parts[0] * 10000 + parts[1] * 100 + parts[2]
print(f'APP_VERSION="{ver}"')
print(f'APP_VERSION_CODE="{vcode}"')
print(f'GITHUB_REPO="{repo}"')
PY
)"

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/android-sdk}}"
BUILD_TOOLS_VERSION="${BUILD_TOOLS_VERSION:-34.0.0}"
PLATFORM_VERSION="${PLATFORM_VERSION:-android-34}"

BT_DIR="${ANDROID_SDK_ROOT}/build-tools/${BUILD_TOOLS_VERSION}"
ANDROID_JAR="${ANDROID_SDK_ROOT}/platforms/${PLATFORM_VERSION}/android.jar"

AAPT="${BT_DIR}/aapt"
D8="${BT_DIR}/d8"
ZIPALIGN="${BT_DIR}/zipalign"
APKSIGNER="${BT_DIR}/apksigner"

echo "=== [IronPulse] Hardened Gradle-Free APK Build ==="
echo "Version:     v${APP_VERSION} (versionCode ${APP_VERSION_CODE})"
echo "Repo:        ${GITHUB_REPO}"
echo "SDK Root:    ${ANDROID_SDK_ROOT}"
echo "Build Tools: ${BT_DIR}"

for bin in "${AAPT}" "${D8}" "${ZIPALIGN}" "${APKSIGNER}"; do
  if [[ ! -x "${bin}" ]]; then
    echo "ERROR: Required tool not found or not executable: ${bin}"
    exit 1
  fi
done
if [[ ! -f "${ANDROID_JAR}" ]]; then
  echo "ERROR: android.jar not found at ${ANDROID_JAR}"
  exit 1
fi

rm -rf "${BUILD_DIR}" "${OUT_DIR}"
mkdir -p "${GEN_DIR}/${PKG_PATH}" "${OBJ_DIR}" "${DEX_DIR}" "${OUT_DIR}"

# Generate BuildConfig.java with authoritative version metadata
cat > "${GEN_DIR}/${PKG_PATH}/BuildConfig.java" <<EOF
package com.kakashimoto.ironpulse;

public final class BuildConfig {
    public static final String VERSION_NAME = "${APP_VERSION}";
    public static final int VERSION_CODE = ${APP_VERSION_CODE};
    public static final String GITHUB_REPO = "${GITHUB_REPO}";
}
EOF

# Stage AndroidManifest.xml with exact versionCode & versionName
STAGED_MANIFEST="${BUILD_DIR}/AndroidManifest.xml"
python3 - "${APP_VERSION}" "${APP_VERSION_CODE}" "${STAGED_MANIFEST}" <<'PY'
import re, sys
ver, vcode, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open("android/AndroidManifest.xml", encoding="utf-8") as f:
    xml = f.read()
xml = re.sub(r'android:versionCode="[^"]+"', f'android:versionCode="{vcode}"', xml)
xml = re.sub(r'android:versionName="[^"]+"', f'android:versionName="{ver}"', xml)
with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(xml)
PY

# Keep assets/www/version.json synchronized
cp version.json assets/www/version.json

echo "[1/6] Generating R.java with aapt..."
"${AAPT}" package -f -m   -J "${GEN_DIR}"   -M "${STAGED_MANIFEST}"   -S "android/res"   -I "${ANDROID_JAR}"

echo "[2/6] Compiling Java sources (Java 11 target)..."
mapfile -t JAVA_FILES < <(find android/src "${GEN_DIR}" -name "*.java" | sort)
javac --release 11   -classpath "${ANDROID_JAR}"   -d "${OBJ_DIR}"   "${JAVA_FILES[@]}"

echo "[3/6] Compiling DEX bytecode with d8..."
mapfile -t CLASS_FILES < <(find "${OBJ_DIR}" -name "*.class" | sort)
"${D8}"   --min-api 26   --lib "${ANDROID_JAR}"   --output "${DEX_DIR}"   "${CLASS_FILES[@]}"

echo "[4/6] Packaging resources + offline web assets..."
UNSIGNED_APK="${BUILD_DIR}/${APP_NAME}-unsigned.apk"
"${AAPT}" package -f   -M "${STAGED_MANIFEST}"   -S "android/res"   -A "assets"   -I "${ANDROID_JAR}"   -F "${UNSIGNED_APK}"

(cd "${DEX_DIR}" && zip -q -u "../../${UNSIGNED_APK}" classes.dex)

echo "[5/6] Aligning APK boundaries (4-byte page alignment)..."
ALIGNED_APK="${BUILD_DIR}/${APP_NAME}-aligned.apk"
"${ZIPALIGN}" -f -p 4 "${UNSIGNED_APK}" "${ALIGNED_APK}"

echo "[6/6] Signing APK..."
FINAL_APK="${OUT_DIR}/${APP_NAME}-v${APP_VERSION}.apk"

KEYSTORE_FILE="${BUILD_DIR}/release.keystore"
if [[ -n "${KEYSTORE_B64:-}" && -n "${KEYSTORE_PASS:-}" ]]; then
  echo "Using production keystore from GitHub Secrets..."
  printf '%s' "${KEYSTORE_B64}" | tr -d '[:space:]' | base64 -d > "${KEYSTORE_FILE}"
  SIGN_ARGS=(
    --ks "${KEYSTORE_FILE}"
    --ks-pass "pass:${KEYSTORE_PASS}"
    --out "${FINAL_APK}"
  )
  if [[ -n "${KEY_ALIAS:-}" ]]; then
    SIGN_ARGS+=(--ks-key-alias "${KEY_ALIAS}")
  fi
  if [[ -n "${KEY_PASS:-}" ]]; then
    SIGN_ARGS+=(--key-pass "pass:${KEY_PASS}")
  fi
  "${APKSIGNER}" sign "${SIGN_ARGS[@]}" "${ALIGNED_APK}"
else
  echo "NOTE: KEYSTORE_B64/KEYSTORE_PASS not set. Generating fallback debug keystore..."
  keytool -genkeypair -v     -keystore "${KEYSTORE_FILE}"     -storetype PKCS12     -storepass android     -alias ironpulsedebug     -keypass android     -keyalg RSA -keysize 2048 -validity 10000     -dname "CN=IronPulse, OU=Kakashimoto14, O=IronPulse, L=Rodriguez, ST=Rizal, C=PH" >/dev/null 2>&1
  "${APKSIGNER}" sign     --ks "${KEYSTORE_FILE}"     --ks-pass pass:android     --ks-key-alias ironpulsedebug     --key-pass pass:android     --out "${FINAL_APK}"     "${ALIGNED_APK}"
fi

cp version.json "${OUT_DIR}/version.json"

echo "=== Verifying APK Signature & Alignment ==="
"${ZIPALIGN}" -c -v 4 "${FINAL_APK}" >/dev/null
"${APKSIGNER}" verify --print-certs "${FINAL_APK}"

ls -lh "${FINAL_APK}"
echo "SUCCESS: Built ${FINAL_APK}"
