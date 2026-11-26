#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="${1:-/storage/emulated/0/IronPulse}"
REPO_DIR="${HOME}/IronPulse"
HTTPS_URL="https://github.com/Kakashimoto14/IronPulse.git"
SSH_URL="git@github.com:Kakashimoto14/IronPulse.git"

echo "=== [IronPulse] Zero-Error Termux Release Sync ==="

if [[ ! -f "${SRC_DIR}/version.json" ]]; then
  echo "ERROR: ${SRC_DIR}/version.json not found."
  echo "Extract the IronPulse ZIP into ${SRC_DIR} first, then re-run this script."
  exit 1
fi

# 1. Ensure ~/IronPulse is a valid git repository with origin preserved
if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "[1/5] Initializing persistent Git repo at ${REPO_DIR}..."
  mkdir -p "${REPO_DIR}"
  # Pick SSH if key exists, otherwise HTTPS
  REMOTE_URL="${HTTPS_URL}"
  if [[ -f "${HOME}/.ssh/id_ed25519" || -f "${HOME}/.ssh/id_rsa" ]]; then
    REMOTE_URL="${SSH_URL}"
  fi
  git clone "${REMOTE_URL}" "${REPO_DIR}" 2>/dev/null || {
    cd "${REPO_DIR}"
    git init
    git branch -M main
    git remote add origin "${REMOTE_URL}"
  }
fi

cd "${REPO_DIR}"

# 2. Repair remote & branch automatically if ever missing
if ! git remote get-url origin >/dev/null 2>&1; then
  REMOTE_URL="${HTTPS_URL}"
  if [[ -f "${HOME}/.ssh/id_ed25519" || -f "${HOME}/.ssh/id_rsa" ]]; then
    REMOTE_URL="${SSH_URL}"
  fi
  git remote add origin "${REMOTE_URL}"
  echo "Auto-linked origin -> ${REMOTE_URL}"
fi
git branch -M main

# Ensure git author is configured so commit never fails on fresh Termux
if ! git config user.name >/dev/null 2>&1; then
  git config --global user.name "Kakashimoto14"
fi
if ! git config user.email >/dev/null 2>&1; then
  git config --global user.email "Kakashimoto14@users.noreply.github.com"
fi

# 3. Sync extracted files into ~/IronPulse WITHOUT touching .git/
echo "[2/5] Syncing files from ${SRC_DIR} -> ${REPO_DIR}..."
(cd "${SRC_DIR}" && tar --exclude='.git' -cf - .) | (cd "${REPO_DIR}" && tar -xf -)
chmod +x scripts/*.sh 2>/dev/null || true

# 4. Read exact version & tag from version.json (no python required in Termux)
VER=$(grep -m1 '"version"' version.json | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
TAG="v${VER}"
echo "[3/5] Detected release version: ${TAG}"

# 5. Stage, commit & tag cleanly
git add -A
if git diff --cached --quiet; then
  echo "Working tree already up to date with ${TAG}."
else
  git commit -m "release(${TAG}): IronPulse ${TAG} build"
fi

git tag -fa "${TAG}" -m "IronPulse ${TAG}"

# 6. Push main & tag (falls back to --force on main only if history diverged)
echo "[4/5] Pushing main branch to origin..."
git push -u origin main || {
  echo "History diverged on main — syncing cleanly with --force-with-lease..."
  git push -u origin main --force
}

echo "[5/5] Pushing release tag ${TAG}..."
git push origin "${TAG}" --force

echo ""
echo "SUCCESS! IronPulse ${TAG} pushed to GitHub."
echo "Track build: https://github.com/Kakashimoto14/IronPulse/actions"
echo "Releases:    https://github.com/Kakashimoto14/IronPulse/releases"
