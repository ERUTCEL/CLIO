import { useEffect, useState } from 'react'

export default function LocalAISetup({ backend }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [pulling, setPulling] = useState('')

  async function refresh() {
    try {
      const res = await fetch(`${backend}/local-ai/status`)
      setStatus(await res.json())
    } catch {
      setStatus({ available: false, installed_models: [], recommended: [] })
      setMessage('로컬 AI 상태를 확인하지 못했습니다.')
    }
  }

  useEffect(() => { refresh() }, [])

  async function pull(model) {
    if (status && status.server_running === false) {
      setMessage('Ollama가 실행 중이 아닙니다. Ollama를 먼저 설치하거나 실행한 뒤 다시 시도하세요.')
      return
    }
    setPulling(model)
    setMessage(`${model} 설치를 시작했습니다. 모델 크기에 따라 오래 걸릴 수 있습니다.`)
    try {
      const res = await fetch(`${backend}/local-ai/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      const job = await res.json()
      const id = setInterval(async () => {
        const s = await fetch(`${backend}/local-ai/pull/${job.job_id}`).then(r => r.json())
        if (s.status === 'done' || s.status === 'failed' || s.status === 'missing') {
          clearInterval(id)
          setPulling('')
          setMessage(s.status === 'done' ? `${model} 설치 완료` : `설치 실패: ${s.error || 'unknown error'}`)
          refresh()
        }
      }, 2000)
    } catch {
      setPulling('')
      setMessage('설치를 시작하지 못했습니다.')
    }
  }

  const available = status?.available
  const serverReady = status?.server_running !== false

  return (
    <div className="rounded-md border border-[#d9d2c3] bg-[#fffdf8]">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs">
        <span className="font-medium text-[#20211f]">Local AI</span>
        <span className={available ? 'text-[#3f6f5d]' : 'text-[#8c8171]'}>
          {available ? status.model : '설정 필요'}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#ebe5d9] p-3 text-xs text-[#5d625b]">
          <p>
            로컬 AI는 필수는 아니지만, 그림/다이어그램 근거를 정리할 때 품질을 올려줍니다.
            최소 10GB, 기본 모델은 20GB 이상의 여유 저장공간을 권장합니다.
          </p>
          <div className="grid gap-2 rounded-md bg-[#f4f1ea] p-3 text-[#6b6258]">
            <div className="flex items-center justify-between gap-3">
              <span>전체 권장 구성</span>
              <span className="font-medium text-[#20211f]">40GB 이상 여유 공간</span>
            </div>
            <div className="text-[#8c8171]">
              처음에는 가벼운 모델만 설치하고, 논문/다이어그램 추론을 많이 쓸 때 기본 또는 깊은 추론 모델을 추가하세요.
            </div>
          </div>
          {status?.server_running === false && (
            <div className="rounded-md border border-[#dfc9a5] bg-[#fff8e8] px-3 py-2 text-[#7b5a25]">
              Ollama가 실행 중이 아닙니다. 로컬 모델을 설치하려면 Ollama를 먼저 설치하거나 실행해야 합니다.
            </div>
          )}
          <div className="space-y-2">
            {(status?.recommended || []).map(item => {
              const installed = status?.installed_models?.includes(item.name)
              return (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-[#f4f1ea] px-3 py-2">
                  <div>
                    <div className="font-mono text-[#20211f]">{item.name}</div>
                    <div className="text-[#8c8171]">{item.role} · {item.target}</div>
                    <div className="mt-1 text-[#6b6258]">
                      다운로드 {item.download_size || '용량 확인 필요'} · 여유 공간 {item.free_space || '10GB 이상 권장'}
                    </div>
                  </div>
                  <button onClick={() => pull(item.name)}
                    disabled={installed || !!pulling || !serverReady}
                    className="rounded-md bg-[#243c35] px-2 py-1 text-white disabled:bg-[#cfc6b6]">
                    {installed ? '설치됨' : pulling === item.name ? '설치 중' : serverReady ? '설치' : '대기'}
                  </button>
                </div>
              )
            })}
          </div>
          {message && <div className="rounded-md bg-[#f4f1ea] px-3 py-2 text-[#69512d]">{message}</div>}
          {!status?.installed_models?.length && (
            <div className="text-[#8c8171]">
              Ollama 앱이 설치되어 있지 않으면 먼저 Ollama가 필요합니다. 이후 모델 설치는 여기서 처리합니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
