import { useEffect, useState } from 'react'

// 업데이트가 "다운로드 완료" 상태일 때만 배너를 띄운다.
// 확인/다운로드 중/실패는 사용자 작업을 방해하지 않도록 조용히 넘어간다.
export default function UpdateBanner() {
  const [status, setStatus] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.api?.getUpdateStatus) return
    window.api.getUpdateStatus().then(setStatus).catch(() => {})
    const off = window.api.onUpdateStatus?.(setStatus)
    return () => off?.()
  }, [])

  if (dismissed || status?.state !== 'downloaded') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border border-[#C7D2FE] bg-[#EEF2FF] px-4 py-3 text-xs text-[#3730A3] shadow-lg">
      <span>
        새 버전 {status.version ? `v${status.version}` : ''} 준비 완료 — 재시작하면 적용됩니다.
      </span>
      <button
        onClick={() => window.api?.installUpdate?.()}
        className="rounded-md bg-[#4F46E5] px-3 py-1.5 font-medium text-white hover:bg-[#4338CA]">
        지금 재시작
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="rounded-md border border-[#C7D2FE] px-2 py-1.5 text-[#4F46E5] hover:bg-white/60">
        나중에
      </button>
    </div>
  )
}
