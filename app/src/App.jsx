import { useState, useEffect } from 'react'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Library from './pages/Library'

const BACKEND = '/api'
const POLL_MS = 1500

export default function App() {
  const [page, setPage] = useState('onboarding')
  const [ready, setReady] = useState(false)
  const [readyDetail, setReadyDetail] = useState('백엔드 시작 중...')

  // Poll /health until ready
  useEffect(() => {
    if (ready) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/health`)
        const data = await res.json()
        setReadyDetail(data.detail ?? '로딩 중...')
        if (data.ready) {
          setReady(true)
          clearInterval(id)
        }
      } catch {
        setReadyDetail('백엔드 연결 대기 중...')
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [ready])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#f7f7f4] flex flex-col items-center justify-center gap-4 text-[#171717]">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#151a23] text-sm font-semibold text-white shadow-sm">RC</div>
        <p className="font-semibold text-lg">Research Companion</p>
        <div className="flex items-center gap-2 text-[#59606b] text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {readyDetail}
        </div>
        <p className="text-[#7b8190] text-xs mt-2">임베딩 모델 로딩 중 — 최초 실행 시 30초~1분 소요됩니다</p>
      </div>
    )
  }

  if (page === 'onboarding') {
    return <Onboarding backend={BACKEND} onComplete={() => setPage('chat')} />
  }

  return (
    <div className="flex h-screen bg-[#f6f6f2] text-[#171717]">
      <div className="w-20 border-r border-[#d8dbe1] bg-[#151a23] flex flex-col items-center py-4 gap-3 text-white">
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-[#2dd4bf] text-xs font-bold text-[#0f1720] shadow-sm">
          RC
        </div>
        <button onClick={() => setPage('chat')} title="Decision desk"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'chat' ? 'bg-white text-[#151a23]' : 'text-[#aab2bf] hover:bg-[#252b36] hover:text-white'
          }`}>
          <span className="text-sm font-semibold">D</span>
          Desk
        </button>
        <button onClick={() => setPage('library')} title="Library"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'library' ? 'bg-white text-[#151a23]' : 'text-[#aab2bf] hover:bg-[#252b36] hover:text-white'
          }`}>
          <span className="text-sm font-semibold">L</span>
          Library
        </button>
        <div className="mt-auto h-8 w-8 rounded-md border border-[#384150] bg-[#1f2631]" title="Local workspace" />
      </div>
      <div className="flex-1 overflow-hidden">
        {page === 'chat'    && <Chat    backend={BACKEND} />}
        {page === 'library' && <Library backend={BACKEND} />}
      </div>
    </div>
  )
}
