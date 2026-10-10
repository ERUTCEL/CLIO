import { memo, useEffect, useRef, useState } from 'react'
import { strokePath, strokeHit, markHit, emptyPage, uid } from '../lib/ink'
import { MARK_COLORS, NOTE_TEXT_COLOR } from '../lib/colors'

const DRAW_TOOLS = new Set(['pen', 'highlighter', 'eraser', 'text'])

function PdfCanvas({ pdf, pageNumber, scale, size, visible }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!visible) return
    let task
    let cancelled = false
    pdf.getPage(pageNumber).then(page => {
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: scale * dpr })
      const canvas = ref.current
      canvas.width = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp })
      task.promise.catch(() => {})
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, scale, visible])
  return <canvas ref={ref} className="pdf-canvas" style={{ width: size.width * scale, height: size.height * scale }} />
}

function TextBox({ box, scale, editable, autoFocus, onChange, onDelete, onBeginEdit }) {
  const dragRef = useRef(null)

  const startDrag = e => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    onBeginEdit()
    dragRef.current = { sx: e.clientX, sy: e.clientY, x: box.x, y: box.y }
  }
  const moveDrag = e => {
    const d = dragRef.current
    if (!d) return
    onChange({ ...box, x: d.x + (e.clientX - d.sx) / scale, y: d.y + (e.clientY - d.sy) / scale })
  }

  const color = box.ai ? NOTE_TEXT_COLOR[box.ai] || box.color : box.color
  return (
    <div
      className={`textbox ${box.ai ? 'ai-note' : ''} ${editable ? 'editable' : ''}`}
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.w * scale,
        borderColor: box.ai ? MARK_COLORS[box.ai] : undefined,
      }}
      onPointerDown={e => editable && e.stopPropagation()}
    >
      {editable && (
        <div className="textbox-bar">
          <span className="grip" onPointerDown={startDrag} onPointerMove={moveDrag}
            onPointerUp={() => (dragRef.current = null)} title="드래그해서 이동">⠿</span>
          <button onClick={onDelete} title="삭제">×</button>
        </div>
      )}
      <textarea
        value={box.text}
        readOnly={!editable}
        autoFocus={autoFocus}
        placeholder="타이핑..."
        onFocus={onBeginEdit}
        onChange={e => onChange({ ...box, text: e.target.value })}
        style={{ fontSize: box.size * scale, color, lineHeight: 1.35 }}
      />
    </div>
  )
}

function PageView({ pdf, pageNumber, size, scale, tool, color, width, penOnly, data, flash, onUpdate, onSnapshot }) {
  const page = data || emptyPage()
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const liveRef = useRef(null)
  const [live, setLive] = useState(null)
  const [visible, setVisible] = useState(false)
  const [focusId, setFocusId] = useState(null)

  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '600px 0px' })
    io.observe(wrapRef.current)
    return () => io.disconnect()
  }, [])

  const toPage = e => {
    const r = svgRef.current.getBoundingClientRect()
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]
  }

  const eraseAt = (px, py, base) => {
    const radius = 6 / scale + 4
    const strokes = base.strokes.filter(s => !strokeHit(s, px, py, radius))
    const marks = base.marks.filter(m => !markHit(m, px, py, 0))
    if (strokes.length === base.strokes.length && marks.length === base.marks.length) return base
    return { ...base, strokes, marks }
  }

  const onPointerDown = e => {
    if (!DRAW_TOOLS.has(tool) || e.button > 0) return
    if (penOnly && e.pointerType === 'touch') return
    e.preventDefault()
    const [px, py] = toPage(e)

    if (tool === 'text') {
      onSnapshot()
      const box = { id: uid(), x: px, y: py - 10, w: 220, text: '', color, size: 14 }
      onUpdate(pageNumber, { ...page, texts: [...page.texts, box] })
      setFocusId(box.id)
      return
    }

    svgRef.current.setPointerCapture(e.pointerId)
    onSnapshot()
    if (tool === 'eraser') {
      liveRef.current = { erasing: true, page: eraseAt(px, py, page) }
      onUpdate(pageNumber, liveRef.current.page)
      return
    }
    const stroke = { tool, color, width: tool === 'highlighter' ? width * 4 : width, points: [px, py] }
    liveRef.current = { stroke }
    setLive(stroke)
  }

  const onPointerMove = e => {
    const cur = liveRef.current
    if (!cur) return
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent]
    if (cur.erasing) {
      let next = cur.page
      for (const ev of events) next = eraseAt(...toPage(ev), next)
      if (next !== cur.page) {
        cur.page = next
        onUpdate(pageNumber, next)
      }
      return
    }
    const pts = cur.stroke.points
    for (const ev of events) {
      const [px, py] = toPage(ev)
      const lx = pts[pts.length - 2]
      const ly = pts[pts.length - 1]
      if (Math.hypot(px - lx, py - ly) * scale < 1.5) continue
      if (cur.stroke.tool === 'highlighter' && e.shiftKey) pts.push(px, ly)
      else pts.push(Math.round(px * 10) / 10, Math.round(py * 10) / 10)
    }
    setLive({ ...cur.stroke })
  }

  const onPointerUp = () => {
    const cur = liveRef.current
    liveRef.current = null
    if (!cur || cur.erasing) return
    setLive(null)
    onUpdate(pageNumber, { ...page, strokes: [...page.strokes, cur.stroke] })
  }

  const updateText = box => onUpdate(pageNumber, { ...page, texts: page.texts.map(t => (t.id === box.id ? box : t)) })
  const deleteText = id => {
    onSnapshot()
    onUpdate(pageNumber, { ...page, texts: page.texts.filter(t => t.id !== id) })
  }

  const textEditable = tool === 'hand' || tool === 'text'
  const renderStroke = (s, key) => (
    <path key={key} d={strokePath(s.points)} fill="none" stroke={s.color} strokeWidth={s.width}
      strokeLinecap={s.tool === 'highlighter' ? 'butt' : 'round'} strokeLinejoin="round"
      className={s.tool === 'highlighter' ? 'hl' : undefined} />
  )

  return (
    <div ref={wrapRef} className={`page ${flash ? 'flash' : ''}`} data-page={pageNumber}
      style={{ width: size.width * scale, height: size.height * scale }}>
      <PdfCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} size={size} visible={visible} />
      <svg
        ref={svgRef}
        className={`ink tool-${tool}`}
        viewBox={`0 0 ${size.width} ${size.height}`}
        style={{ touchAction: DRAW_TOOLS.has(tool) ? 'none' : 'auto' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {page.marks.map(m => m.rects.map(([x, y, w, h], i) => m.kind === 'underline'
          ? <rect key={`${m.id}-${i}`} x={x} y={y + h - 1} width={w} height={2} fill={MARK_COLORS[m.color]} opacity={0.9} />
          : <rect key={`${m.id}-${i}`} x={x} y={y} width={w} height={h} fill={MARK_COLORS[m.color]} className="hl" />))}
        {page.strokes.map((s, i) => renderStroke(s, i))}
        {live && renderStroke(live, 'live')}
      </svg>
      {page.texts.map(box => (
        <TextBox key={box.id} box={box} scale={scale} editable={textEditable} autoFocus={box.id === focusId}
          onBeginEdit={onSnapshot} onChange={updateText} onDelete={() => deleteText(box.id)} />
      ))}
      <div className="page-number">{pageNumber}</div>
    </div>
  )
}

export default memo(PageView)
