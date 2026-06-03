export default function CitationCard({ citation }) {
  const { index, title, author, year, page, source_type, is_user_memo, parse_quality_warning, content_type, figure_type, caption } = citation

  const isNotion = source_type?.startsWith('notion') || is_user_memo
  const isVisual = content_type === 'figure' || content_type === 'diagram'
  const label = is_user_memo ? '내 메모' : isVisual ? '그림 근거' : '논문'
  const labelColor = is_user_memo
    ? 'border-[#f2d49a] bg-[#fff7e6] text-[#8a5a00]'
    : isVisual
    ? 'border-[#b8ece4] bg-[#ecfffb] text-[#086c61]'
    : 'border-[#c9d3dd] bg-[#f6f9fb] text-[#34566f]'

  let meta = ''
  if (!is_user_memo) {
    if (author) meta += author
    if (year)   meta += (meta ? ', ' : '') + year
    if (page)   meta += (meta ? ', ' : '') + `p.${page}`
  }

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-[#dce2e8] bg-[#f8fafc] p-3 transition-colors hover:bg-white">
      <span className="text-xs font-bold text-[#8a93a3] mt-0.5 w-4 shrink-0">[{index}]</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${labelColor}`}>{label}</span>
          {figure_type && (
            <span className="rounded border border-[#dce2e8] bg-white px-1.5 py-0.5 text-xs text-[#59606b]">{figure_type}</span>
          )}
          {parse_quality_warning && (
            <span title="파싱 품질이 낮습니다 — 직접 확인 권장" className="rounded bg-[#fff7e6] px-1.5 py-0.5 text-xs text-[#8a5a00]">확인 필요</span>
          )}
        </div>
        <p className="text-sm font-medium text-[#171717] mt-0.5 truncate">{title || '(제목 없음)'}</p>
        {caption && <p className="text-xs text-[#59606b] mt-0.5 line-clamp-2">{caption}</p>}
        {meta && <p className="text-xs text-[#697386] mt-0.5">{meta}</p>}
      </div>
    </div>
  )
}
