import { useCallback, useEffect, useRef, useState } from 'react'
import PageView from './components/PageView'
import SidePanel from './components/SidePanel'
import { openPdf, pageText, pageTextItems, locateQuote } from './lib/pdf'
import { applyRemark, describeError } from './lib/ai'
import { emptyPage, uid } from './lib/ink'
import { PEN_COLORS, HIGHLIGHT_COLORS } from './lib/colors'
import { exportAnnotatedPdf, notesMarkdown, download } from './lib/export'
import * as store from './lib/storage'

const SETTINGS_KEY = 'pdf-notes.settings'
const newDoc = () => ({ pages: {}, memo: '', todos: [], aiLog: [] })

function loadSettings() {
  try {
    return { apiKey: '', model: 'claude-opus-5-5', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { apiKey: '', model: 'claude-opus-5-5' }
  }
}

function Home({ onOpen }) {
  const [recent, setRecent] = useState([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { store.listRecent().then(setRecent).catch(() => {}) }, [])

  const openFile = async file => {
    if (!file || !/\.pdf$/i.test(file.name)) return
    onOpen({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
  }

  return (
    <div className={`home ${dragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]) }}>
      <div className="home-card">
        <h1>PDF 필기노트</h1>
        <p>PDF 위에 펜으로 쓰고, 타이핑하고, 교수님 말씀을 AI로 바로 필기에 반영하세요.</p>
        <button className="btn primary big" onClick={() => inputRef.current.click()}>PDF 열기</button>
        <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={e => openFile(e.target.files[0])} />
        <p className="muted">또는 PDF 파일을 여기로 끌어다 놓기</p>
        {recent.length > 0 && (
          <div className="recent">
            <h2>최근 문서</h2>
            {recent.map(r => (
              <div key={r.id} className="recent-item">
                <button className="link" onClick={async () => {
                  const f = await store.getFile(r.id)
                  if (f) onOpen({ name: f.name, bytes: f.bytes })
                }}>{r.name}</button>
                <span className="muted">{new Date(r.openedAt).toLocaleDateString('ko-KR')}</span>
                <button className="link danger" title="필기와 함께 삭제" onClick={async () => {
                  if (!confirm(`"${r.name}"과 필기를 삭제할까요?`)) return
                  await store.removeRecent(r.id)
                  setRecent(await store.listRecent())
                }}>삭제</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Toolbar({ tool, setTool, color, setColor, width, setWidth, penOnly, setPenOnly, scale, setScale, onFit,
  canUndo, canRedo, onUndo, onRedo, onExportPdf, onExportMd, onClose, name, page, total, exporting }) {
  const palette = tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS
  const tools = [
    ['hand', '✋', '이동/선택 (V)'],
    ['pen', '✒️', '펜 (P)'],
    ['highlighter', '🖍', '형광펜 (H) — Shift: 수평'],
    ['eraser', '🧽', '지우개 (E)'],
    ['text', 'T', '타이핑 (T)'],
  ]
  return (
    <header className="toolbar">
      <button className="btn ghost" onClick={onClose} title="문서 닫기">←</button>
      <span className="doc-name" title={name}>{name}</span>
      <span className="muted">{page} / {total}</span>
      <div className="sep" />
      {tools.map(([id, icon, title]) => (
        <button key={id} className={`tool ${tool === id ? 'on' : ''}`} title={title} onClick={() => setTool(id)}>{icon}</button>
      ))}
      <div className="sep" />
      {palette.map(c => (
        <button key={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
      ))}
      <input type="range" min="1" max="8" step="0.5" value={width} title="굵기" onChange={e => setWidth(Number(e.target.value))} />
      <label className="check" title="손가락/손바닥 터치는 무시하고 펜으로만 그리기">
        <input type="checkbox" checked={penOnly} onChange={e => setPenOnly(e.target.checked)} /> 펜만
      </label>
      <div className="sep" />
      <button className="btn ghost" disabled={!canUndo} onClick={onUndo} title="실행 취소 (Ctrl+Z)">↶</button>
      <button className="btn ghost" disabled={!canRedo} onClick={onRedo} title="다시 실행 (Ctrl+Shift+Z)">↷</button>
      <div className="sep" />
      <button className="btn ghost" onClick={() => setScale(s => Math.max(0.5, +(s - 0.1).toFixed(2)))}>−</button>
      <button className="btn ghost" onClick={onFit} title="폭 맞춤">{Math.round(scale * 100)}%</button>
      <button className="btn ghost" onClick={() => setScale(s => Math.min(3, +(s + 0.1).toFixed(2)))}>+</button>
      <div className="grow" />
      <button className="btn" onClick={onExportMd}>노트 .md</button>
      <button className="btn" disabled={Boolean(exporting)} onClick={onExportPdf}>{exporting || '필기 포함 PDF 저장'}</button>
    </header>
  )
}

function Editor({ file, onClose }) {
  const [loaded, setLoaded] = useState(null) // { pdf, sizes, id }
  const [doc, setDoc] = useState(null)
  const [tool, setTool] = useState('pen')
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [hlColor, setHlColor] = useState(HIGHLIGHT_COLORS[0])
  const [width, setWidth] = useState(2)
  const [penOnly, setPenOnly] = useState(false)
  const [scale, setScale] = useState(1.2)
  const [currentPage, setCurrentPage] = useState(1)
  const [flashPage, setFlashPage] = useState(0)
  const [history, setHistory] = useState({ undo: [], redo: [] })
  const [settings, setSettings] = useState(loadSettings)
  const [busy, setBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [exporting, setExporting] = useState('')
  const [loadError, setLoadError] = useState('')
  const scrollRef = useRef(null)
  const docRef = useRef(null)
  const historyRef = useRef(history)
  docRef.current = doc

  useEffect(() => {
    let alive = true
    openPdf(file.bytes)
      .then(async ({ pdf, sizes, fingerprint }) => {
        await store.saveFile(fingerprint, file.name, file.bytes)
        const saved = await store.getNotes(fingerprint)
        if (!alive) return
        setDoc({ ...newDoc(), ...saved })
        setLoaded({ pdf, sizes, id: fingerprint })
      })
      .catch(err => setLoadError(`PDF를 열 수 없습니다: ${err.message}`))
    return () => { alive = false }
  }, [file])

  // Autosave
  useEffect(() => {
    if (!doc || !loaded) return
    const t = setTimeout(() => store.saveNotes(loaded.id, doc).catch(() => {}), 400)
    return () => clearTimeout(t)
  }, [doc, loaded])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* private mode */ }
  }, [settings])

  const snapshot = useCallback(() => {
    const pages = docRef.current?.pages
    const h = historyRef.current
    if (!pages || h.undo[h.undo.length - 1] === pages) return
    historyRef.current = { undo: [...h.undo.slice(-99), pages], redo: [] }
    setHistory(historyRef.current)
  }, [])

  const updatePage = useCallback((n, data) => {
    setDoc(d => ({ ...d, pages: { ...d.pages, [n]: data } }))
  }, [])

  const step = useCallback(dir => {
    const h = historyRef.current
    const [from, to] = dir === 'undo' ? ['undo', 'redo'] : ['redo', 'undo']
    if (!h[from].length) return
    const target = h[from][h[from].length - 1]
    historyRef.current = { [from]: h[from].slice(0, -1), [to]: [...h[to], docRef.current.pages] }
    setHistory(historyRef.current)
    setDoc(d => ({ ...d, pages: target }))
  }, [])
  const undo = useCallback(() => step('undo'), [step])
  const redo = useCallback(() => step('redo'), [step])

  const jumpTo = useCallback(n => {
    scrollRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setFlashPage(n)
    setTimeout(() => setFlashPage(0), 1200)
  }, [])

  const fitWidth = () => {
    if (!loaded) return
    const maxW = Math.max(...loaded.sizes.map(s => s.width))
    setScale(+((scrollRef.current.clientWidth - 48) / maxW).toFixed(2))
  }

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest?.('textarea, input, select')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (!mod) {
        const map = { v: 'hand', p: 'pen', h: 'highlighter', e: 'eraser', t: 'text' }
        if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const onScroll = () => {
    const el = scrollRef.current
    const line = el.getBoundingClientRect().top + el.clientHeight / 3
    for (const p of el.querySelectorAll('[data-page]')) {
      if (p.getBoundingClientRect().bottom > line) {
        setCurrentPage(Number(p.dataset.page))
        break
      }
    }
  }

  const applyAI = async (remark, scope) => {
    const { pdf } = loaded
    const total = pdf.numPages
    const range = scope === 'page' ? [currentPage, currentPage]
      : scope === 'near' ? [Math.max(1, currentPage - 2), Math.min(total, currentPage + 2)]
      : [1, total]
    setBusy(true)
    setAiError('')
    try {
      const pages = []
      for (let n = range[0]; n <= range[1]; n++) pages.push({ page: n, text: await pageText(pdf, n) })
      const result = await applyRemark({ apiKey: settings.apiKey, model: settings.model, remark, pages, currentPage })

      const logId = uid()
      const placed = []
      const nextPages = { ...docRef.current.pages }
      for (const a of result.annotations) {
        const size = loaded.sizes[a.page - 1]
        const pageData = { ...emptyPage(), ...nextPages[a.page] }
        const items = await pageTextItems(pdf, a.page)
        const rects = a.quote ? locateQuote(items, a.quote) : []
        const marks = [...pageData.marks]
        const texts = [...pageData.texts]
        if (rects.length && a.kind !== 'note') marks.push({ id: uid(), logId, rects, kind: a.kind, color: a.color })
        if (a.note) {
          // Prefer the right margin so the note doesn't cover the text; otherwise sit under the quote.
          const textRight = items.length ? Math.max(...items.map(it => it.x + it.w)) : size.width / 2
          const margin = size.width - textRight - 10
          let x, y, w
          if (margin >= 100) {
            x = textRight + 6
            w = Math.min(220, margin)
            y = rects.length ? Math.min(...rects.map(r => r[1])) - 2 : 12
          } else {
            w = 240
            x = rects.length ? Math.min(...rects.map(r => r[0])) : 16
            y = rects.length ? Math.max(...rects.map(r => r[1] + r[3])) + 3 : 12
          }
          x = Math.max(4, Math.min(x, size.width - w - 4))
          const estHeight = 8 + 15 * Math.ceil((a.note.length * 11) / (w - 8))
          const taken = texts.filter(t => t.ai && Math.abs(t.x - x) < w)
          for (const t of taken.sort((p, q) => p.y - q.y)) {
            if (y < t.y + (t.h || 30) && y + estHeight > t.y) y = t.y + (t.h || 30) + 4
          }
          texts.push({ id: uid(), logId, x, y: Math.min(y, size.height - 30), w, h: estHeight,
            text: a.note, color: '#111827', size: 11, ai: a.color })
        }
        nextPages[a.page] = { ...pageData, marks, texts }
        placed.push({ ...a, found: rects.length > 0 })
      }

      snapshot()
      setDoc(d => ({
        ...d,
        pages: nextPages,
        todos: [...d.todos, ...result.todos.map((text, i) => ({ id: Date.now() + i, text, done: false }))],
        aiLog: [...d.aiLog, { id: logId, at: Date.now(), remark, summary: result.summary, annotations: placed }],
      }))
      if (placed[0]) jumpTo(placed[0].page)
      return true
    } catch (err) {
      setAiError(describeError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const clearLog = logId => {
    snapshot()
    setDoc(d => {
      const pages = {}
      for (const [n, p] of Object.entries(d.pages)) {
        pages[n] = { ...p, marks: p.marks.filter(m => m.logId !== logId), texts: p.texts.filter(t => t.logId !== logId) }
      }
      return { ...d, pages }
    })
  }

  const exportPdf = async () => {
    try {
      const bytes = await exportAnnotatedPdf(loaded.pdf, loaded.sizes, doc.pages, (n, t) => setExporting(`저장 중 ${n}/${t}`))
      download(bytes, file.name.replace(/\.pdf$/i, '') + '_필기.pdf', 'application/pdf')
    } catch (err) {
      alert(`PDF 저장 실패: ${err.message}`)
    } finally {
      setExporting('')
    }
  }

  if (loadError) return <div className="center"><p>{loadError}</p><button className="btn" onClick={onClose}>돌아가기</button></div>
  if (!loaded || !doc) return <div className="center">PDF 여는 중…</div>

  const color = tool === 'highlighter' ? hlColor : penColor
  return (
    <div className="editor">
      <Toolbar tool={tool} setTool={setTool} color={color} setColor={tool === 'highlighter' ? setHlColor : setPenColor}
        width={width} setWidth={setWidth} penOnly={penOnly} setPenOnly={setPenOnly} scale={scale} setScale={setScale}
        onFit={fitWidth} canUndo={history.undo.length > 0} canRedo={history.redo.length > 0} onUndo={undo} onRedo={redo}
        onExportPdf={exportPdf} onExportMd={() => download(notesMarkdown(file.name, doc), file.name.replace(/\.pdf$/i, '') + '_노트.md', 'text/markdown')}
        onClose={onClose} name={file.name} page={currentPage} total={loaded.pdf.numPages} exporting={exporting} />
      <div className="workspace">
        <main className="pages" ref={scrollRef} onScroll={onScroll}>
          {loaded.sizes.map((size, i) => (
            <PageView key={i} pdf={loaded.pdf} pageNumber={i + 1} size={size} scale={scale} tool={tool} color={color}
              width={width} penOnly={penOnly} data={doc.pages[i + 1]} flash={flashPage === i + 1}
              onUpdate={updatePage} onSnapshot={snapshot} />
          ))}
        </main>
        <SidePanel doc={doc} settings={settings} onSettings={setSettings} busy={busy} error={aiError}
          onApply={applyAI} onJump={jumpTo} onUndoLog={clearLog} onDocChange={patch => setDoc(d => ({ ...d, ...patch }))} />
      </div>
    </div>
  )
}

export default function App() {
  const [file, setFile] = useState(null)
  return file ? <Editor key={file.name} file={file} onClose={() => setFile(null)} /> : <Home onOpen={setFile} />
}
