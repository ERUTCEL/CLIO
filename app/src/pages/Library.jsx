import { useState, useEffect, useCallback } from 'react'
import AddDocPanel from '../components/AddDocPanel'

const SOURCE_LABEL = {
  pdf:            { text: 'PDF',    bg: 'bg-[#ecfffb]', color: 'text-[#086c61]', border: 'border-[#b8ece4]' },
  notion_summary: { text: 'Notion', bg: 'bg-[#fff7e6]', color: 'text-[#8a5a00]', border: 'border-[#f2d49a]' },
  notion_memo:    { text: 'Notion', bg: 'bg-[#fff7e6]', color: 'text-[#8a5a00]', border: 'border-[#f2d49a]' },
  notion_meta:    { text: 'Notion', bg: 'bg-[#fff7e6]', color: 'text-[#8a5a00]', border: 'border-[#f2d49a]' },
}

const QUALITY_COLOR = {
  high:   'text-[#0f9f8d]',
  medium: 'text-[#d48a00]',
  low:    'text-[#d95f59]',
}

function Stars({ weight, sourceType }) {
  if (!sourceType?.startsWith('notion')) return null
  const n = weight >= 1.4 ? 3 : weight >= 0.9 ? 2 : 1
  return (
    <span className="text-yellow-400 text-sm" title={`중요도 ${n}★`}>
      {'★'.repeat(n)}{'☆'.repeat(3 - n)}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function DocCard({ doc, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const src = SOURCE_LABEL[doc.source_type] ?? { text: doc.source_type, bg: 'bg-gray-100', color: 'text-gray-600' }
  const filename = doc.source.split('/').pop()

  return (
    <div className="bg-white border border-[#dce2e8] rounded-md p-4 shadow-sm transition-colors hover:border-[#aeb8c6]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${src.bg} ${src.color} ${src.border || 'border-[#dce2e8]'}`}>
              {src.text}
            </span>
            <Stars weight={doc.importance_weight} sourceType={doc.source_type} />
            <span className={`text-xs font-medium ${QUALITY_COLOR[doc.parse_quality] ?? 'text-gray-400'}`}
                  title={`파싱 품질: ${doc.parse_quality}`}>
              ● {doc.parse_quality}
            </span>
          </div>

          {/* Title */}
          <p className="font-semibold text-[#171717] text-sm leading-tight truncate">
            {doc.title || filename}
          </p>

          {/* Meta */}
          <div className="flex items-center gap-2 mt-1 text-xs text-[#7b8190] flex-wrap">
            {doc.author && <span>{doc.author}</span>}
            {doc.year > 0 && <span>{doc.year}</span>}
            {doc.journal && <span className="truncate max-w-[150px]">{doc.journal}</span>}
            <span>{doc.chunk_count}청크</span>
            <span>{formatDate(doc.ingested_at)}</span>
          </div>

          {/* Source path */}
          <p className="text-xs text-[#a2aaba] mt-1 truncate" title={doc.source}>{doc.source}</p>
        </div>

        {/* Delete */}
        <div className="shrink-0">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-[#a2aaba] hover:text-[#d95f59] transition-colors p-1 rounded"
              title="삭제"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={() => onDelete(doc.doc_id)}
                className="text-xs px-2 py-1 bg-[#d95f59] text-white rounded hover:bg-[#c94d47]"
              >삭제</button>
              <button
                onClick={() => setConfirming(false)}
                className="text-xs px-2 py-1 bg-[#eef1f4] text-[#59606b] rounded hover:bg-[#dce2e8]"
              >취소</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Library({ backend }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${backend}/library`)
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`)
      setDocs(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [backend])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  async function handleDelete(docId) {
    try {
      const res = await fetch(`${backend}/library/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제 실패')
      setDocs(prev => prev.filter(d => d.doc_id !== docId))
    } catch (e) {
      setError(e.message)
    }
  }

  const filtered = docs.filter(d => {
    const matchSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.author.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' ||
      (filter === 'pdf' && d.source_type === 'pdf') ||
      (filter === 'notion' && d.source_type.startsWith('notion'))
    return matchSearch && matchFilter
  })

  const pdfCount    = docs.filter(d => d.source_type === 'pdf').length
  const notionCount = docs.filter(d => d.source_type.startsWith('notion')).length

  return (
    <div className="flex flex-col h-full bg-[#f6f6f2]">
      {/* Header */}
      <div className="bg-white border-b border-[#d8dbe1] px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#697386]">Library</div>
            <h1 className="mt-0.5 text-lg font-bold text-[#171717]">연구 자료실</h1>
            <p className="text-xs text-[#7b8190] mt-0.5">
              논문 {pdfCount}편 · Notion {notionCount}개
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                showAdd
                  ? 'bg-[#151a23] text-white'
                  : 'bg-[#151a23] text-white hover:bg-[#283241]'
              }`}
            >
              {showAdd ? '닫기' : '논문 추가'}
            </button>
            <button
              onClick={fetchDocs}
              className="text-xs px-3 py-1.5 border border-[#dce2e8] rounded-md text-[#59606b] hover:bg-[#eef1f4] transition-colors"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* Add panel */}
        {showAdd && (
          <div className="mt-3 p-4 bg-[#f8fafc] rounded-md border border-[#dce2e8]">
            <AddDocPanel
              backend={backend}
              compact
              onDone={() => { setShowAdd(false); fetchDocs() }}
            />
          </div>
        )}

        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8a93a3]"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="제목, 저자 검색..."
              className="w-full rounded-md border border-[#dce2e8] bg-[#f8fafc] py-1.5 pl-8 pr-3 text-sm text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]"
            />
          </div>
          {['all', 'pdf', 'notion'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                filter === f
                  ? 'bg-[#151a23] text-white border-[#151a23]'
                  : 'border-[#dce2e8] text-[#59606b] hover:bg-[#eef1f4]'
              }`}
            >
              {f === 'all' ? '전체' : f === 'pdf' ? 'PDF' : 'Notion'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center h-32 text-[#7b8190] text-sm">
            불러오는 중...
          </div>
        )}

        {error && (
          <div className="bg-[#fff1f0] border border-[#f2b8b5] rounded-md px-4 py-3 text-sm text-[#b9413c] mb-4">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[#dce2e8] bg-white text-xs font-semibold text-[#697386]">LIB</div>
            <p className="text-[#59606b] text-sm">
              {docs.length === 0 ? '인덱싱된 문서가 없습니다.' : '검색 결과가 없습니다.'}
            </p>
            {docs.length === 0 && (
              <p className="text-[#7b8190] text-xs mt-1">온보딩에서 폴더를 추가하거나 Notion을 연결해보세요.</p>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(doc => (
              <DocCard key={doc.doc_id} doc={doc} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
