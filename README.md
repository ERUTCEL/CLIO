# CLIO

Local-first research decision companion for papers, notes, and project ideas.

## Download

| Platform | Link |
|----------|------|
| macOS (Apple Silicon) | [CLIO-0.1.0-arm64.dmg](https://github.com/ERUTCEL/Research-Companion-/releases/tag/v0.1.0) |

### macOS 보안 경고 우회 방법

Apple 공증이 없어 처음 실행 시 경고가 뜰 수 있습니다.

1. DMG 파일을 열고 CLIO.app을 응용 프로그램 폴더로 드래그
2. Finder에서 CLIO.app을 **우클릭 → 열기** 선택
3. 경고창에서 **열기** 클릭

이후부터는 평소처럼 실행됩니다.

## Quick Start

From the repository root, run one command.

### WSL / macOS / Linux

```bash
./run.sh
```

### Windows PowerShell

```powershell
.\run.ps1
```

On the first run, the script creates `research_companion/.env` and stops. Open
that file, replace `ANTHROPIC_API_KEY`, then run the same command again.

The script will:

1. create the Python virtual environment
2. install backend dependencies
3. install frontend dependencies
4. start the Electron app

First install can take a while because embedding and reranking dependencies are
large. Later runs should go straight to app startup.

## Manual Run

If you prefer to run services separately:

```bash
cd research_companion
source .venv/bin/activate
uvicorn api.main:app --host 127.0.0.1 --port 8001 --reload
```

Then in another terminal:

```bash
cd app
npm run dev
```
