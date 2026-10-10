// Shared geometry for drawing strokes (SVG on screen, Canvas2D on export).

/** Smooth SVG path through a flat [x0, y0, x1, y1, ...] point list. */
export function strokePath(pts) {
  const n = pts.length / 2
  if (n === 0) return ''
  const x = i => pts[i * 2].toFixed(1)
  const y = i => pts[i * 2 + 1].toFixed(1)
  if (n === 1) return `M${x(0)} ${y(0)}l0.01 0`
  let d = `M${x(0)} ${y(0)}`
  for (let i = 1; i < n - 1; i++) {
    const mx = ((pts[i * 2] + pts[i * 2 + 2]) / 2).toFixed(1)
    const my = ((pts[i * 2 + 1] + pts[i * 2 + 3]) / 2).toFixed(1)
    d += `Q${x(i)} ${y(i)} ${mx} ${my}`
  }
  return d + `L${x(n - 1)} ${y(n - 1)}`
}

export function strokeHit(stroke, px, py, radius) {
  const r = radius + stroke.width / 2
  const pts = stroke.points
  for (let i = 0; i < pts.length; i += 2) {
    if (Math.hypot(pts[i] - px, pts[i + 1] - py) <= r) return true
  }
  return false
}

export function markHit(mark, px, py, radius) {
  return mark.rects.some(([x, y, w, h]) =>
    px >= x - radius && px <= x + w + radius && py >= y - radius && py <= y + h + radius)
}

export const emptyPage = () => ({ strokes: [], texts: [], marks: [] })

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
