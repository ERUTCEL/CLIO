import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'
const KEY_FILE = path.join(app.getPath('userData'), 'api_key.enc')

let mainWindow
let backendProcess

// ── Keychain helpers ─────────────────────────────────────────────────────────

function saveApiKey(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store in userData (still better than .env in repo)
    fs.writeFileSync(KEY_FILE + '.plain', key, 'utf8')
    return
  }
  const encrypted = safeStorage.encryptString(key)
  fs.writeFileSync(KEY_FILE, encrypted)
}

function loadApiKey() {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const buf = fs.readFileSync(KEY_FILE)
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(buf)
        : buf.toString('utf8')
    }
    if (fs.existsSync(KEY_FILE + '.plain')) {
      return fs.readFileSync(KEY_FILE + '.plain', 'utf8')
    }
  } catch { /* key not found or corrupt */ }
  return ''
}

// ── Backend (FastAPI) ────────────────────────────────────────────────────────

function startBackend() {
  const repoRoot = path.resolve(__dirname, '../../')
  const backendDir = path.join(repoRoot, 'research_companion')
  const uvicorn = path.join(backendDir, '.venv', 'bin', 'uvicorn')

  if (!fs.existsSync(uvicorn)) {
    console.warn('[backend] uvicorn not found — skipping auto-start')
    return
  }

  const savedKey = loadApiKey()
  const env = { ...process.env }
  if (savedKey) env.ANTHROPIC_API_KEY = savedKey

  backendProcess = spawn(uvicorn, ['api.main:app', '--port', '8001', '--host', '127.0.0.1'], {
    cwd: backendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => console.error('[backend]', d.toString().trim()))
  backendProcess.on('exit', code => console.log('[backend] exited', code))
}

function stopBackend() {
  if (backendProcess) { backendProcess.kill(); backendProcess = null }
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  startBackend()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => { stopBackend(); if (process.platform !== 'darwin') app.quit() })
app.on('quit', stopBackend)

// ── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'PDF 폴더 선택',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('has-api-key', () => {
  return loadApiKey().length > 0
})

ipcMain.handle('set-api-key', (_, key) => {
  saveApiKey(key.trim())
  // Also inject into running backend env (if process is alive)
  if (backendProcess) process.env.ANTHROPIC_API_KEY = key.trim()
  return true
})

ipcMain.handle('clear-api-key', () => {
  if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE)
  if (fs.existsSync(KEY_FILE + '.plain')) fs.unlinkSync(KEY_FILE + '.plain')
  return true
})
