const CONFIG = {
  high:      { dot: 'bg-[#0f9f8d]', label: '높음', text: 'text-[#086c61]', bg: 'bg-[#ecfffb]' },
  medium:    { dot: 'bg-[#d48a00]', label: '보통', text: 'text-[#8a5a00]', bg: 'bg-[#fff7e6]' },
  low:       { dot: 'bg-[#d95f59]', label: '낮음', text: 'text-[#b9413c]', bg: 'bg-[#fff1f0]' },
  no_source: { dot: 'bg-[#8a93a3]', label: '없음', text: 'text-[#59606b]', bg: 'bg-[#f8fafc]' },
}

export default function ConfidenceBadge({ confidence }) {
  const c = CONFIG[confidence] ?? CONFIG.no_source
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      출처 신뢰도 {c.label}
    </span>
  )
}
