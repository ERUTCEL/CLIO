import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export async function openPdf(bytes) {
  // pdf.js detaches the buffer it is given, so hand it a copy.
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const sizes = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const vp = (await pdf.getPage(i)).getViewport({ scale: 1 })
    sizes.push({ width: vp.width, height: vp.height })
  }
  return { pdf, sizes, fingerprint: pdf.fingerprints?.[0] || `doc-${bytes.byteLength}` }
}

const textCache = new WeakMap()

/** Text items of a page with boxes in page units (scale 1, top-left origin). */
export async function pageTextItems(pdf, pageNumber) {
  let perDoc = textCache.get(pdf)
  if (!perDoc) textCache.set(pdf, (perDoc = new Map()))
  if (perDoc.has(pageNumber)) return perDoc.get(pageNumber)

  const page = await pdf.getPage(pageNumber)
  const vp = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const items = content.items
    .filter(it => it.str)
    .map(it => {
      const tx = pdfjs.Util.transform(vp.transform, it.transform)
      const h = Math.hypot(tx[2], tx[3]) || 10
      return { str: it.str, eol: it.hasEOL, x: tx[4], y: tx[5] - h, w: it.width, h }
    })
  perDoc.set(pageNumber, items)
  return items
}

export async function pageText(pdf, pageNumber) {
  const items = await pageTextItems(pdf, pageNumber)
  return items.map(it => it.str + (it.eol ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim()
}

const norm = ch => ch.toLowerCase()
const isSpace = ch => /\s/.test(ch)

/**
 * Find `quote` on a page and return the rectangles covering it.
 * Whitespace and case are ignored so line breaks in the PDF don't break matching.
 */
export function locateQuote(items, quote) {
  const q = [...quote].filter(ch => !isSpace(ch) && ch !== '-').map(norm).join('')
  if (q.length < 2) return []

  let hay = ''
  const map = [] // hay index -> [itemIndex, charIndex]
  items.forEach((it, i) => {
    ;[...it.str].forEach((ch, j) => {
      if (isSpace(ch) || ch === '-') return
      hay += norm(ch)
      map.push([i, j])
    })
  })

  let start = hay.indexOf(q)
  let len = q.length
  if (start === -1 && q.length > 24) {
    // Model may paraphrase the tail; fall back to the opening words.
    len = 24
    start = hay.indexOf(q.slice(0, len))
  }
  if (start === -1) return []

  const spans = new Map()
  for (let k = start; k < start + len; k++) {
    const [i, j] = map[k]
    const span = spans.get(i) || [j, j]
    span[0] = Math.min(span[0], j)
    span[1] = Math.max(span[1], j)
    spans.set(i, span)
  }
  return [...spans].map(([i, [a, b]]) => {
    const it = items[i]
    const n = [...it.str].length || 1
    const x0 = it.x + (it.w * a) / n
    const x1 = it.x + (it.w * (b + 1)) / n
    return [x0, it.y, x1 - x0, it.h]
  })
}

/** Pages with (almost) no text layer are treated as scans/images. */
export const isImagePage = text => text.replace(/\s/g, '').length < 20

/** Render a page to a base64 JPEG for vision models. */
export async function renderPageImage(pdf, pageNumber, maxDim = 1568) {
  const page = await pdf.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: maxDim / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
}
