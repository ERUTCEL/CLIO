import { useState, useEffect } from 'react'
import Onboarding from './pages/Onboarding'
import Chat from './pages/Chat'
import Library from './pages/Library'
import BrandMark from './components/BrandMark'

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
        <BrandMark size="lg" />
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
    <div className="flex h-screen bg-[#F8FAFC] text-[#1E293B]">
      <div className="w-20 border-r border-[#E2E8F0] bg-white flex flex-col items-center py-4 gap-3">
        <div className="mb-2"><BrandMark /></div>
        <button onClick={() => setPage('chat')} title="Decision desk"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'chat' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
          }`}>
          <span className="text-sm font-semibold">D</span>
          Desk
        </button>
        <button onClick={() => setPage('library')} title="Library"
          className={`flex h-12 w-14 flex-col items-center justify-center rounded-md text-[11px] transition-colors ${
            page === 'library' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
          }`}>
          <span className="text-sm font-semibold">L</span>
          Library
        </button>
        <div className="mt-auto h-8 w-8 rounded-md border border-[#E2E8F0] bg-[#F8FAFC]" title="Local workspace" />
      </div>
      <div className="flex-1 overflow-hidden">
        {page === 'chat'    && <Chat    backend={BACKEND} />}
        {page === 'library' && <Library backend={BACKEND} />}
      </div>
    </div>
  )
}
