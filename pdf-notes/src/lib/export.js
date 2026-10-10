import { PDFDocument } from 'pdf-lib'
import { strokePath } from './ink'
import { MARK_COLORS, NOTE_TEXT_COLOR } from './colors'

const EXPORT_SCALE = 2

function wrapLines(ctx, text, maxWidth) {
  const lines = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }
  return lines
}

export function drawAnnotations(ctx, data) {
  for (const mark of data.marks) {
    const color = MARK_COLORS[mark.color] || mark.color
    ctx.fillStyle = color
    for (const [x, y, w, h] of mark.rects) {
      if (mark.kind === 'underline') {
        ctx.globalAlpha = 0.9
        ctx.fillRect(x, y + h - 1, w, 2)
      } else {
        ctx.globalAlpha = 0.35
        ctx.fillRect(x, y, w, h)
      }
    }
  }
  ctx.globalAlpha = 1
  for (const s of data.strokes) {
    ctx.save()
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = s.tool === 'highlighter' ? 'butt' : 'round'
    ctx.lineJoin = 'round'
    if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.35
      ctx.globalCompositeOperation = 'multiply'
    }
    ctx.stroke(new Path2D(strokePath(s.points)))
    ctx.restore()
  }
  for (const t of data.texts) {
    if (!t.text.trim()) continue
    ctx.font = `${t.bold ? 'bold ' : ''}${t.size}px system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
    const lines = wrapLines(ctx, t.text, t.w - 8)
    const lh = t.size * 1.35
    if (t.ai || t.bg) {
      ctx.fillStyle = t.bg ? '#ffffff' : 'rgba(255,255,255,0.88)'
      ctx.fillRect(t.x, t.y, t.w, lines.length * lh + 8)
    }
    ctx.fillStyle = t.ai ? (NOTE_TEXT_COLOR[t.ai] || t.color) : t.color
    ctx.textBaseline = 'top'
    lines.forEach((line, i) => ctx.fillText(line, t.x + 4, t.y + 4 + i * lh))
  }
}

/** Flatten every page (PDF + ink + notes) into images and build a new PDF. */
export async function exportAnnotatedPdf(pdf, sizes, pages, onProgress) {
  const out = await PDFDocument.create()
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(n, pdf.numPages)
    const page = await pdf.getPage(n)
    const vp = page.getViewport({ scale: EXPORT_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d')
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
    ctx.save()
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE)
    if (pages[n]) drawAnnotations(ctx, pages[n])
    ctx.restore()
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
    const img = await out.embedJpg(await blob.arrayBuffer())
    const { width, height } = sizes[n - 1]
    out.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height })
  }
  return out.save()
}

export function notesMarkdown(name, doc) {
  const lines = [`# ${name} — 필기 노트`, '']
  if (doc.memo?.trim()) lines.push('## 메모', '', doc.memo.trim(), '')
  if (doc.todos?.length) {
    lines.push('## 할 일', '')
    for (const t of doc.todos) lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`)
    lines.push('')
  }
  if (doc.aiLog?.length) {
    lines.push('## 교수님 말씀', '')
    for (const log of doc.aiLog) {
      lines.push(`### ${new Date(log.at).toLocaleString('ko-KR')}`, '', `> ${log.remark.replace(/\n/g, '\n> ')}`, '')
      if (log.summary) lines.push(`**요약:** ${log.summary}`, '')
      for (const a of log.annotations) {
        lines.push(`- p.${a.page}${a.quote ? ` "${a.quote}"` : ''} — ${a.note}`)
      }
      lines.push('')
    }
  }
  const pageNums = Object.keys(doc.pages).map(Number).sort((a, b) => a - b)
  const typed = pageNums.flatMap(n => doc.pages[n].texts.filter(t => t.text.trim()).map(t => ({ n, t })))
  if (typed.length) {
    lines.push('## 페이지별 필기', '')
    for (const { n, t } of typed) lines.push(`- p.${n}: ${t.text.trim().replace(/\n/g, ' ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
