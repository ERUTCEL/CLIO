import { useState, useEffect, useRef } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.api?.isElectron

export default function Onboarding({ backend, onComplete }) {
  const [apiKeyStatus, setApiKeyStatus] = useState('unknown') // 'unknown'|'saved'|'editing'
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyError, setApiKeyError] = useState('')

  const [source, setSource] = useState(null)       // 'folder' | 'notion'
  const [folderPath, setFolderPath] = useState('')
  const [notionToken, setNotionToken] = useState('')
  const [notionDbId, setNotionDbId] = useState('')

  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [error, setError] = useState('')
  const dropRef = useRef(null)

  // Check if key already saved in keychain
  useEffect(() => {
    if (isElectron) {
      window.api.hasApiKey().then(has => setApiKeyStatus(has ? 'saved' : 'editing'))
    } else {
      setApiKeyStatus('editing')
    }
  }, [])

  // Poll job status
  useEffect(() => {
    if (!jobId || jobStatus === 'done' || jobStatus === 'failed') return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${backend}/ingest/${jobId}`)
        const data = await res.json()
        setProgress({ processed: data.processed, total: data.total })
        if (data.status === 'done' || data.status === 'failed') {
          setJobStatus(data.status)
          if (data.error) setError(data.error)
          clearInterval(id)
        }
      } catch { clearInterval(id) }
    }, 1500)
    return () => clearInterval(id)
  }, [jobId, jobStatus, backend])

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim()
    if (!key.startsWith('sk-ant-')) {
      setApiKeyError('Anthropic API 키는 sk-ant- 로 시작합니다.')
      return
    }
    setApiKeyError('')
    if (isElectron) await window.api.setApiKey(key)
    setApiKeyStatus('saved')
    setApiKeyInput('')
  }

  async function handleSelectFolder() {
    if (isElectron) {
      const p = await window.api.selectFolder()
      if (p) { setFolderPath(p); setSource('folder') }
    }
  }

  // Drag-and-drop handlers
  function onDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }
  function onDragLeave(e) {
    e.preventDefault()
    if (!dropRef.current?.contains(e.relatedTarget)) setDragging(false)
  }
  function onDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    setError('')

    const files = Array.from(e.dataTransfer.files)
    const items = Array.from(e.dataTransfer.items || [])
    if (!files.length) return

    const first = files[0]
    const filePath = first.path  // Electron only — undefined in plain browser

    if (!filePath) {
      setError('파일 경로를 읽을 수 없습니다. Electron 앱에서 실행 중인지 확인하세요.')
      return
    }

    // webkitGetAsEntry()가 가장 신뢰할 수 있는 dir 감지 방법
    const entry = items[0]?.webkitGetAsEntry?.()
    const isDir = entry ? entry.isDirectory : (first.type === '')

    if (isDir) {
      setFolderPath(filePath)
    } else {
      // 파일 하나를 드롭 → 부모 폴더 사용
      const parent = filePath.includes('/')
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : filePath.substring(0, filePath.lastIndexOf('\\'))
      setFolderPath(parent)
    }
    setSource('folder')
  }

  async function handleIngest() {
    setError('')
    setJobStatus('processing')
    try {
      const body = source === 'folder'
        ? { source: 'local_folder', path: folderPath }
        : { source: 'notion', notion_token: notionToken, database_id: notionDbId }

      const res = await fetch(`${backend}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || '인제스트 실패'); setJobStatus('failed'); return }
      setJobId(data.job_id)
    } catch {
      setError('백엔드 연결 실패. 앱을 다시 시작해보세요.')
      setJobStatus('failed')
    }
  }

  const apiKeyReady = apiKeyStatus === 'saved'
  const canIngest = source === 'folder'
    ? folderPath.trim()
    : notionToken.trim() && notionDbId.trim()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl">🔬</div>
          <h1 className="text-2xl font-bold text-gray-900">Research Companion</h1>
          <p className="text-gray-500 text-sm">내 논문 전체를 아는 AI 연구 파트너</p>
        </div>

        {/* Step 1 — API Key */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <span className="bg-gray-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">1</span>
            Anthropic API Key
          </label>

          {apiKeyStatus === 'saved' ? (
            <div className="flex items-center justify-between px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"/>
                </svg>
                키체인에 안전하게 저장됨
              </div>
              <button
                onClick={() => { setApiKeyStatus('editing'); setApiKeyInput('') }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >변경</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => { setApiKeyInput(e.target.value); setApiKeyError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                  placeholder="sk-ant-api03-..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >저장</button>
              </div>
              {apiKeyError && <p className="text-xs text-red-500">{apiKeyError}</p>}
              <p className="text-xs text-gray-400">
                OS 키체인에 암호화 저장됩니다 — 앱 외부에서 읽을 수 없습니다.{' '}
                <a href="https://console.anthropic.com/settings/keys" target="_blank"
                   rel="noreferrer" className="underline hover:text-gray-600">키 발급 →</a>
              </p>
            </div>
          )}
        </div>

        {/* Step 2 — Source */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <span className="bg-gray-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">2</span>
            논문 어디 있어요?
          </label>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSource('folder')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                source === 'folder' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="text-2xl mb-1">📁</div>
              <div className="font-medium text-sm text-gray-900">폴더 선택</div>
              <div className="text-xs text-gray-500">PDF 파일이 있는 폴더</div>
            </button>
            <button onClick={() => setSource('notion')}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                source === 'notion' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="text-2xl mb-1">🔗</div>
              <div className="font-medium text-sm text-gray-900">Notion 연결</div>
              <div className="text-xs text-gray-500">노션 논문 DB</div>
            </button>
          </div>

          {/* Folder — drag & drop zone */}
          {source === 'folder' && (
            <div
              ref={dropRef}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : folderPath
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {folderPath ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-green-700">✓ 폴더 선택됨</p>
                  <p className="text-xs text-gray-500 break-all font-mono bg-gray-50 rounded px-2 py-1">{folderPath}</p>
                  <button onClick={() => { setFolderPath(''); setError('') }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">변경</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500">
                    {dragging ? '놓으면 추가됩니다' : 'PDF 폴더를 여기에 드래그하거나'}
                  </p>
                  {isElectron && (
                    <button onClick={handleSelectFolder}
                      className="text-sm text-blue-600 hover:underline">
                      폴더 직접 선택
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notion inputs */}
          {source === 'notion' && (
            <div className="space-y-2">
              <input type="password" value={notionToken}
                onChange={e => setNotionToken(e.target.value)}
                placeholder="Notion 통합 토큰 (secret_...)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={notionDbId}
                onChange={e => setNotionDbId(e.target.value)}
                placeholder="데이터베이스 ID"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>

        {/* Progress */}
        {jobStatus === 'processing' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>처리 중...</span>
              <span>{progress.processed} / {progress.total || '?'}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: progress.total ? `${(progress.processed / progress.total) * 100}%` : '5%' }} />
            </div>
          </div>
        )}
        {jobStatus === 'done' && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
            ✅ {progress.total}개 청크 인덱싱 완료
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {jobStatus !== 'done' ? (
            <button onClick={handleIngest}
              disabled={!apiKeyReady || !canIngest || jobStatus === 'processing'}
              className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {jobStatus === 'processing' ? '처리 중...' : '논문 인덱싱 시작'}
            </button>
          ) : (
            <button onClick={onComplete}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
              시작하기 →
            </button>
          )}
          {jobStatus === null && (
            <button onClick={onComplete}
              className="w-full py-2 text-gray-400 text-sm hover:text-gray-600">
              건너뛰기 (나중에 추가)
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
