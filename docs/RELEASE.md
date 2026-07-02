# CLIO 릴리스 가이드 — 코드 서명, 공증, 자동 업데이트

## 왜 필요한가

- **macOS**: 서명 + 공증(notarization)이 없으면 Gatekeeper가 "손상되었거나 확인되지 않은 개발자" 경고를 띄우고, 사용자가 `xattr` 명령을 직접 쳐야 실행됩니다. 이탈률에 직결됩니다.
- **Windows**: Authenticode 서명이 없으면 SmartScreen이 "인식할 수 없는 앱" 경고를 띄웁니다.
- **자동 업데이트**: electron-updater는 macOS에서 **서명된 빌드에서만** 동작합니다. 서명 없는 빌드는 업데이트 체크가 조용히 실패하며, 앱 사용에는 지장이 없습니다.

## 1. macOS 서명 + 공증

### 준비물 (1회)

1. [Apple Developer Program](https://developer.apple.com/programs/) 가입 — $99/년
2. Xcode 또는 Keychain Access로 **Developer ID Application** 인증서 발급 → 로그인 키체인에 설치
3. [appleid.apple.com](https://appleid.apple.com) → 로그인 및 보안 → **앱 암호(App-Specific Password)** 생성
4. Team ID 확인: [developer.apple.com/account](https://developer.apple.com/account) → Membership

### 빌드

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

bash build.sh
```

- 키체인에 Developer ID 인증서가 있으면 electron-builder가 자동으로 찾아 서명합니다.
- 위 세 env가 설정되면 `build.sh`가 `--config.mac.notarize=true`를 붙여 공증까지 수행합니다 (약 5–15분 소요).
- env가 없으면 기존처럼 서명 없이 빌드됩니다 (개발용).

Hardened Runtime 예외 항목은 `app/electron/entitlements.mac.plist`에 정의되어 있습니다.
PyInstaller 백엔드(`clio-backend`)가 서드파티 `.so`/`.dylib`를 로드하기 때문에
`disable-library-validation`이 필요합니다.

### 검증

```bash
spctl -a -vv app/dist-electron/mac-arm64/CLIO.app   # → accepted, Notarized Developer ID
```

## 2. Windows 서명

### 준비물 (1회)

- OV/EV 코드 서명 인증서 구매 (Sectigo, DigiCert, SSL.com 등 — 연 $70~400)
  - 2023년 이후 발급 인증서는 하드웨어 토큰/클라우드 HSM 필수 → **SSL.com eSigner, Azure Trusted Signing** 같은 클라우드 서명이 CI에 편합니다.
  - Azure Trusted Signing은 월 $9.99로 가장 저렴한 선택지입니다.

### 빌드 (.pfx 파일 방식)

```powershell
$env:CSC_LINK = "C:\path\to\cert.pfx"    # 또는 base64/URL
$env:CSC_KEY_PASSWORD = "인증서 비밀번호"
.\build.ps1
```

env가 없으면 서명 없이 빌드됩니다.

## 3. 자동 업데이트 배포 (GitHub Releases)

`app/package.json`의 `build.publish`가 `ERUTCEL/CLIO`로 설정되어 있습니다.

릴리스 절차:

1. `app/package.json`의 `version` 올리기 (예: `0.1.2`)
2. 서명 env 설정 후 빌드
3. GitHub Release 생성 (태그 `v0.1.2`) 후 `app/dist-electron/`의 산출물 업로드:
   - macOS: `CLIO-x.y.z-arm64.dmg`, `CLIO-x.y.z-arm64-mac.zip`, **`latest-mac.yml`**
   - Windows: `CLIO Setup x.y.z.exe`, **`latest.yml`**
   - `.blockmap` 파일들 (차등 다운로드용)

   또는 `GH_TOKEN` 설정 후 `npx electron-builder --publish always`로 자동 업로드.

> `latest*.yml`을 빠뜨리면 자동 업데이트가 동작하지 않습니다.
> macOS 자동 업데이트는 **zip 타깃**을 사용하므로 dmg만 올리면 안 됩니다.

앱은 시작 10초 후 + 4시간마다 업데이트를 확인하고, 다운로드가 끝나면
우하단 배너로 재시작을 제안합니다. 사용자가 무시해도 종료 시 자동 설치됩니다.

## 4. 크래시 리포팅 (선택)

기본은 완전 비활성 (로컬 우선 원칙). 활성화하려면:

1. `cd app && npm i @sentry/electron`
2. `app/electron/telemetry.js`의 `SENTRY_DSN`에 Sentry 프로젝트 DSN 입력

로그 파일은 항상 로컬에 남습니다:
- macOS: `~/Library/Logs/CLIO/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\CLIO\logs\main.log`
