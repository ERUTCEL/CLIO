import { useEffect, useRef, useState } from 'react'
import { MODELS } from '../lib/ai'
import { MARK_COLORS } from '../lib/colors'

const SCOPES = [
  { id: 'page', label: '현재 페이지' },
  { id: 'near', label: '앞뒤 2쪽' },
  { id: 'all', label: '문서 전체' },
]

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null

function useDictation(onText) {
  const recRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')

  useEffect(() => () => recRef.current?.stop(), [])

  const toggle = () => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = e => {
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) onText(r[0].transcript.trim())
        else partial += r[0].transcript
      }
      setInterim(partial)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }
    rec.onerror = () => setListening(false)
    rec.start()
    recRef.current = rec
    setListening(true)
  }
  return { supported: Boolean(SpeechRecognition), listening, interim, toggle }
}

function Settings({ settings, onChange }) {
  return (
    <details className="settings" open={!settings.apiKey}>
      <summary>AI 설정 {settings.apiKey ? '✓' : '(API 키 필요)'}</summary>
      <label>
        Anthropic API 키
        <input type="password" value={settings.apiKey} placeholder="sk-ant-..."
          onChange={e => onChange({ ...settings, apiKey: e.target.value.trim() })} />
      </label>
      <label>
        모델
        <select value={settings.model} onChange={e => onChange({ ...settings, model: e.target.value })}>
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </label>
      <p className="hint">키는 이 브라우저에만 저장되고 api.anthropic.com으로만 전송됩니다.</p>
    </details>
  )
}

function AITab({ settings, onSettings, busy, error, log, onApply, onJump, onUndoLog }) {
  const [remark, setRemark] = useState('')
  const [scope, setScope] = useState('near')
  const dictation = useDictation(text => setRemark(r => (r ? `${r} ${text}` : text)))

  const submit = async () => {
    if (!remark.trim() || busy) return
    if (await onApply(remark, scope)) setRemark('')
  }

  return (
    <div className="tab-body">
      <Settings settings={settings} onChange={onSettings} />
      <label className="field-label">교수님 말씀</label>
      <textarea className="remark" rows={5} value={remark}
        placeholder={'예) "3절의 정의 2는 시험에 꼭 나온다"\n"실험 결과 표에서 baseline이 빠졌으니 다음 주까지 추가해 와"'}
        onChange={e => setRemark(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
      {dictation.interim && <div className="interim">🎙 {dictation.interim}</div>}
      <div className="row">
        <div className="segmented">
          {SCOPES.map(s => (
            <button key={s.id} className={scope === s.id ? 'on' : ''} onClick={() => setScope(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="row">
        {dictation.supported && (
          <button className={`btn ${dictation.listening ? 'rec' : ''}`} onClick={dictation.toggle}
            title="말하면 받아 적습니다 (Chrome/Edge)">
            {dictation.listening ? '■ 받아쓰기 중지' : '🎙 받아쓰기'}
          </button>
        )}
        <button className="btn primary grow" disabled={busy || !remark.trim()} onClick={submit}>
          {busy ? 'AI가 필기 중…' : 'PDF에 바로 적용 (⌘/Ctrl+Enter)'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="log">
        {log.slice().reverse().map(entry => (
          <div key={entry.id} className="log-entry">
            <div className="log-head">
              <span>{new Date(entry.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              <button className="link" onClick={() => onUndoLog(entry.id)}>필기 지우기</button>
            </div>
            <blockquote>{entry.remark}</blockquote>
            {entry.summary && <p className="summary">{entry.summary}</p>}
            <ul>
              {entry.annotations.map((a, i) => (
                <li key={i}>
                  <button className="jump" onClick={() => onJump(a.page)}>
                    <span className="dot" style={{ background: MARK_COLORS[a.color] }} />
                    p.{a.page}
                  </button>
                  {a.note}
                  {a.quote && !a.found && <span className="muted"> (위치 못 찾음 — 페이지 상단에 메모)</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function TodoTab({ todos, onChange }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    if (!draft.trim()) return
    onChange([...todos, { id: Date.now(), text: draft.trim(), done: false }])
    setDraft('')
  }
  return (
    <div className="tab-body">
      <div className="row">
        <input className="grow" value={draft} placeholder="할 일 추가" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>추가</button>
      </div>
      <ul className="todos">
        {todos.map(t => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <input type="checkbox" checked={t.done}
              onChange={() => onChange(todos.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
            <span>{t.text}</span>
            <button className="link" onClick={() => onChange(todos.filter(x => x.id !== t.id))}>×</button>
          </li>
        ))}
        {!todos.length && <li className="muted">교수님이 시킨 일은 AI가 여기에 자동으로 모읍니다.</li>}
      </ul>
    </div>
  )
}

export default function SidePanel(props) {
  const [tab, setTab] = useState('ai')
  const openTodos = props.doc.todos.filter(t => !t.done).length
  return (
    <aside className="side">
      <nav className="tabs">
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI 교수님 말씀</button>
        <button className={tab === 'memo' ? 'on' : ''} onClick={() => setTab('memo')}>메모</button>
        <button className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>
          할 일{openTodos ? ` ${openTodos}` : ''}
        </button>
      </nav>
      {tab === 'ai' && (
        <AITab settings={props.settings} onSettings={props.onSettings} busy={props.busy} error={props.error}
          log={props.doc.aiLog} onApply={props.onApply} onJump={props.onJump} onUndoLog={props.onUndoLog} />
      )}
      {tab === 'memo' && (
        <div className="tab-body">
          <textarea className="memo" value={props.doc.memo} placeholder="이 문서에 대한 자유 메모 (자동 저장)"
            onChange={e => props.onDocChange({ memo: e.target.value })} />
        </div>
      )}
      {tab === 'todo' && <TodoTab todos={props.doc.todos} onChange={todos => props.onDocChange({ todos })} />}
    </aside>
  )
}
