import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import fs from 'fs'
import log from 'electron-log/main'
import electronUpdater from 'electron-updater'
import { initTelemetry } from './telemetry.js'

const { autoUpdater } = electronUpdater
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

// ── Logging / crash capture ─────────────────────────────────────────────────
// 파일 로그: macOS ~/Library/Logs/CLIO, Windows %USERPROFILE%\AppData\Roaming\CLIO\logs
log.initialize()
log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024
log.errorHandler.startCatching({
  showDialog: false,
  onError: ({ error }) => log.error('[uncaught]', error),
})
Object.assign(console, log.functions) // 기존 console.* 호출도 파일로 남김
initTelemetry(log)

let mainWindow
let backendProcess
let backendStatus = { state: 'idle', detail: 'Backend has not started.' }

// ── Auto update (GitHub Releases) ────────────────────────────────────────────

let updateStatus = { state: 'idle', version: '', percent: 0, error: '' }

function sendToWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function setUpdateStatus(next) {
  updateStatus = { ...updateStatus, ...next }
  sendToWindow('update-status', updateStatus)
}

function setupAutoUpdater() {
  if (isDev) {
    updateStatus = { state: 'disabled', version: '', percent: 0, error: 'dev mode' }
    return
  }
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking', error: '' }))
  autoUpdater.on('update-available', info => setUpdateStatus({ state: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () => setUpdateStatus({ state: 'idle' }))
  autoUpdater.on('download-progress', p => setUpdateStatus({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', info => setUpdateStatus({ state: 'downloaded', version: info.version, percent: 100 }))
  autoUpdater.on('error', err => {
    // 서명 안 된 macOS 빌드 등에서는 업데이트가 불가능함 — 앱 사용은 막지 않는다
    log.warn('[updater]', err?.message)
    setUpdateStatus({ state: 'error', error: err?.message || 'unknown' })
  })

  const check = () => autoUpdater.checkForUpdates().catch(err => log.warn('[updater] check failed:', err?.message))
  setTimeout(check, 10_000)                  // 부팅 직후 백엔드와 경쟁하지 않도록 지연
  setInterval(check, 4 * 60 * 60 * 1000)     // 이후 4시간마다
}

// ── Settings (encrypted via safeStorage) ────────────────────────────────────

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'))
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
      try { out[k] = safeStorage.decryptString(Buffer.from(v, 'base64')) }
      catch { out[k] = '' }
    }
    return out
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  const encrypted = {}
  for (const [k, v] of Object.entries(settings)) {
    if (v) encrypted[k] = safeStorage.encryptString(v).toString('base64')
  }
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(encrypted))
}

function findInstalledOllamaModel() {
  try {
    const roots = [
      path.join(app.getPath('home'), '.ollama', 'models', 'manifests'),
      process.env.OLLAMA_MODELS ? path.join(process.env.OLLAMA_MODELS, 'manifests') : '',
    ].filter(Boolean)
    for (const root of roots) {
      if (!fs.existsSync(root)) continue
      const stack = [root]
      while (stack.length) {
        const current = stack.pop()
        for (const item of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, item.name)
          if (item.isDirectory()) {
            stack.push(full)
          } else if (item.isFile()) {
            const rel = path.relative(root, full).split(path.sep)
            if (rel.length >= 3) return `${rel[rel.length - 2]}:${rel[rel.length - 1]}`
          }
        }
      }
    }
  } catch {
    return ''
  }
  return ''
}

function resolveProviderSettings(settings) {
  const requested = settings.CLIO_PROVIDER || 'auto'
  if (requested !== 'auto') return { provider: requested, model: settings.CLIO_MODEL || '' }

  const localModel = findInstalledOllamaModel()
  if (localModel) return { provider: 'ollama', model: settings.CLIO_MODEL || localModel }
  if (settings.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: settings.CLIO_MODEL || 'claude-sonnet-4-6' }
  if (settings.OPENAI_API_KEY) {
    const base = (settings.OPENAI_BASE_URL || '').toLowerCase()
    if (base.includes('groq.com')) return { provider: 'groq', model: settings.CLIO_MODEL || 'llama-3.3-70b-versatile' }
    if (base.includes('googleapis.com') || base.includes('generativelanguage')) return { provider: 'gemini', model: settings.CLIO_MODEL || 'gemini-2.0-flash' }
    return { provider: 'openai', model: settings.CLIO_MODEL || 'gpt-4o' }
  }
  return { provider: 'ollama', model: settings.CLIO_MODEL || 'qwen3:8b' }
}

// ── Backend (FastAPI) ────────────────────────────────────────────────────────

const BACKEND_MAX_RESTARTS = 5
let backendStopping = false      // 의도적 종료(설정 변경/앱 종료) 시 재시작 억제
let backendRestarts = 0
let backendStartedAt = 0
let backendRestartTimer = null

function setBackendStatus(next) {
  backendStatus = next
  sendToWindow('backend-status', backendStatus)
}

function scheduleBackendRestart(exitCode) {
  // 60초 이상 정상 동작했다면 새로운 장애로 보고 카운터 리셋
  if (Date.now() - backendStartedAt > 60_000) backendRestarts = 0

  if (backendRestarts >= BACKEND_MAX_RESTARTS) {
    setBackendStatus({
      state: 'failed',
      detail: `백엔드가 반복적으로 종료되어 자동 재시작을 중단했습니다 (exit ${exitCode}). 로그를 확인해 주세요.`,
    })
    return
  }
  const delay = Math.min(1000 * 2 ** backendRestarts, 30_000)
  backendRestarts += 1
  log.warn(`[backend] crashed (exit ${exitCode}) — restart ${backendRestarts}/${BACKEND_MAX_RESTARTS} in ${delay}ms`)
  setBackendStatus({
    state: 'restarting',
    detail: `백엔드가 예기치 않게 종료되어 재시작 중입니다 (${backendRestarts}/${BACKEND_MAX_RESTARTS})...`,
  })
  backendRestartTimer = setTimeout(() => { backendRestartTimer = null; startBackend() }, delay)
}

function startBackend() {
  let command, args, cwd
  backendStopping = false
  backendStartedAt = Date.now()
  setBackendStatus({ state: 'starting', detail: 'Starting CLIO backend...' })

  if (isDev) {
    // Dev: use the venv uvicorn directly
    const repoRoot = path.resolve(__dirname, '../../')
    const backendDir = path.join(repoRoot, 'research_companion')
    const venvDir = path.join(backendDir, '.venv')
    const uvicornCandidates = [
      path.join(venvDir, 'bin', 'uvicorn'),
      path.join(venvDir, 'Scripts', 'uvicorn.exe'),
      path.join(venvDir, 'Scripts', 'uvicorn'),
    ]
    const pythonCandidates = [
      path.join(venvDir, 'bin', 'python'),
      path.join(venvDir, 'Scripts', 'python.exe'),
    ]
    const uvicorn = uvicornCandidates.find(c => fs.existsSync(c))
    const python = pythonCandidates.find(c => fs.existsSync(c))
    if (!uvicorn && !python) {
      console.warn('[backend] virtualenv not found')
      setBackendStatus({ state: 'failed', detail: 'Development virtualenv was not found.' })
      return
    }
    command = uvicorn || python
    args = uvicorn
      ? ['api.main:app', '--port', '8001', '--host', '127.0.0.1']
      : ['-m', 'uvicorn', 'api.main:app', '--port', '8001', '--host', '127.0.0.1']
    cwd = backendDir
  } else {
    // Production: prefer the onedir backend so packaged libraries remain
    // inside the signed app bundle instead of being extracted at runtime.
    const binName = process.platform === 'win32' ? 'clio-backend.exe' : 'clio-backend'
    const candidates = [
      path.join(process.resourcesPath, 'backend', 'clio-backend', binName),
      path.join(process.resourcesPath, 'backend', binName),
    ]
    command = candidates.find(candidate => fs.existsSync(candidate))
    if (!command) {
      console.error('[backend] bundled binary not found:', candidates)
      setBackendStatus({ state: 'failed', detail: `Bundled backend not found: ${candidates.join(', ')}` })
      return
    }
    args = []
    cwd = app.getPath('userData')
  }

  const settings = loadSettings()
  const resolvedProvider = resolveProviderSettings(settings)
  backendProcess = spawn(command, args, {
    cwd,
    env: (() => {
      // PyInstaller bundles its own Python; inherited PYTHONHOME/PYTHONPATH
      // from the shell or Electron process confuse the embedded interpreter.
      const e = { ...process.env }
      delete e.PYTHONHOME
      delete e.PYTHONPATH
      delete e.PYTHONSTARTUP
      delete e.CLIO_PROVIDER
      delete e.CLIO_MODEL
      delete e.ANTHROPIC_API_KEY
      delete e.OPENAI_API_KEY
      delete e.OPENAI_BASE_URL
      delete e.NOTION_TOKEN
      e.CLIO_PORT = '8001'
      e.CLIO_DATA_DIR = app.getPath('userData')
      if (process.platform === 'win32') {
        e.LOCAL_REASONER_ENABLED = 'true'
        if (!e.OLLAMA_BASE_URL) e.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
      }
      e.CLIO_PROVIDER = resolvedProvider.provider
      if (resolvedProvider.model) e.CLIO_MODEL = resolvedProvider.model
      if (settings.ANTHROPIC_API_KEY) e.ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY
      if (settings.OPENAI_API_KEY) e.OPENAI_API_KEY = settings.OPENAI_API_KEY
      if (settings.OPENAI_BASE_URL) e.OPENAI_BASE_URL = settings.OPENAI_BASE_URL
      if (settings.NOTION_TOKEN) e.NOTION_TOKEN = settings.NOTION_TOKEN
      return e
    })(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => {
    const detail = d.toString().trim()
    if (detail) setBackendStatus({ state: 'running', detail })
    console.log('[backend]', detail)
  })
  backendProcess.stderr.on('data', d => {
    const detail = d.toString().trim()
    // uvicorn은 정상 액세스 로그도 stderr로 쓴다 — 상태를 'error'로 덮지 않는다
    if (detail) setBackendStatus({ state: backendStatus.state === 'failed' ? 'failed' : 'running', detail })
    console.error('[backend]', detail)
  })
  backendProcess.on('spawn', () => {
    setBackendStatus({ state: 'running', detail: `Backend process started: ${command}` })
  })
  backendProcess.on('error', err => {
    setBackendStatus({ state: 'failed', detail: err.message })
    console.error('[backend] failed to start', err)
  })
  backendProcess.on('exit', code => {
    backendProcess = null
    console.log('[backend] exited', code)
    if (backendStopping) {
      setBackendStatus({ state: 'stopped', detail: `Backend stopped (code ${code})` })
      return
    }
    scheduleBackendRestart(code)
  })
}

function stopBackend() {
  backendStopping = true
  if (backendRestartTimer) { clearTimeout(backendRestartTimer); backendRestartTimer = null }
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1024,
    minHeight: 600,
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: true }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  setupAutoUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('quit', stopBackend)

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('select-pdf', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'PDF 문서 선택',
    filters: [{ name: 'PDF 문서', extensions: ['pdf'] }],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false
  await shell.openExternal(url)
  return true
})

ipcMain.handle('get-settings', () => {
  const s = loadSettings()
  return {
    CLIO_PROVIDER:     s.CLIO_PROVIDER     || 'auto',
    CLIO_MODEL:        s.CLIO_MODEL        || '',
    ANTHROPIC_API_KEY: s.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY:    s.OPENAI_API_KEY    || '',
    OPENAI_BASE_URL:   s.OPENAI_BASE_URL   || '',
    NOTION_TOKEN:      s.NOTION_TOKEN      || '',
  }
})

ipcMain.handle('save-settings', async (_event, settings) => {
  const merged = { ...loadSettings() }
  for (const [k, v] of Object.entries(settings || {})) {
    if (v === '' || v == null) delete merged[k]
    else merged[k] = v
  }
  saveSettings(merged)
  // restart backend with new keys
  stopBackend()
  await new Promise(r => setTimeout(r, 500))
  startBackend()
  return { ok: true }
})

ipcMain.handle('get-backend-status', () => backendStatus)

ipcMain.handle('get-update-status', () => updateStatus)

ipcMain.handle('install-update', () => {
  if (updateStatus.state !== 'downloaded') return false
  stopBackend()
  autoUpdater.quitAndInstall()
  return true
})

// 저사양 기기 안내(RAM 기반 로컬 모델 추천)에 사용
ipcMain.handle('get-system-info', () => ({
  platform: process.platform,
  arch: process.arch,
  totalMemGB: Math.round(os.totalmem() / (1024 ** 3)),
  cpuCount: os.cpus().length,
}))
