#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════╗"
echo "║     CLIO — Production Build  ║"
echo "╚══════════════════════════════╝"

# ── 1. Python backend → binary ──────────────────────────────────────────────
echo ""
echo "▸ Step 1: Build Python backend (PyInstaller)"
bash "$ROOT/research_companion/build_backend.sh"

# ── 2. Copy binary to app/backend/ ──────────────────────────────────────────
echo ""
echo "▸ Step 2: Copy backend directory to app/backend/"
rm -rf "$ROOT/app/backend"
mkdir -p "$ROOT/app/backend"
cp -R "$ROOT/research_companion/dist-bin/clio-backend" "$ROOT/app/backend/"

if [[ "$(uname -s)" == "Darwin" ]] && ! file "$ROOT/app/backend/clio-backend/clio-backend" | grep -q "Mach-O"; then
  echo "✗ Backend is not a macOS executable. Build macOS packages on macOS."
  exit 1
fi

echo "  ✓ $(ls -lh "$ROOT/app/backend/")"

# ── 3. Vite build + electron-builder ────────────────────────────────────────
echo ""
echo "▸ Step 3: Build Electron app"
cd "$ROOT/app"

# 코드 서명/공증: 자격증명 env가 있을 때만 활성화 (docs/RELEASE.md 참고)
BUILDER_FLAGS=()
if [[ "$(uname -s)" == "Darwin" ]]; then
  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    echo "  ✓ Apple 공증 자격증명 감지 → 서명 + 공증 활성화"
    BUILDER_FLAGS+=(--config.mac.notarize=true)
  else
    echo "  ⚠ APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 미설정"
    echo "    → 공증 없이 빌드합니다. 사용자는 Gatekeeper 경고를 보게 됩니다."
    echo "    → 설정 방법: docs/RELEASE.md"
  fi
fi

npm run build -- "${BUILDER_FLAGS[@]}"

echo ""
echo "✅ Build complete → app/dist-electron/"
ls "$ROOT/app/dist-electron/"
