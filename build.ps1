$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot

Write-Host "Building CLIO Windows backend..."
& "$Root\research_companion\build_backend.ps1"

Write-Host "Copying backend binary..."
Remove-Item "$Root\app\backend" -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$Root\app\backend" | Out-Null
Copy-Item "$Root\research_companion\dist-bin\clio-backend" "$Root\app\backend\clio-backend" -Recurse -Force

Write-Host "Building CLIO Windows installer..."
Set-Location "$Root\app"

# 코드 서명: CSC_LINK(.pfx 경로/URL) + CSC_KEY_PASSWORD env가 있으면
# electron-builder가 자동으로 Authenticode 서명합니다 (docs/RELEASE.md 참고)
if ($env:CSC_LINK -and $env:CSC_KEY_PASSWORD) {
    Write-Host "  Code signing certificate detected - installer will be signed."
} else {
    Write-Host "  WARNING: CSC_LINK / CSC_KEY_PASSWORD not set."
    Write-Host "  Building unsigned - users will see SmartScreen warnings."
    Write-Host "  Setup guide: docs/RELEASE.md"
}

npm run build:win

Write-Host "Build complete: app\dist-electron\"
