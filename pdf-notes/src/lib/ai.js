import Anthropic from '@anthropic-ai/sdk'

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (정확)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠름)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 빠름·저렴)' },
]

const SYSTEM = `너는 대학원생의 PDF 필기 보조다. 학생이 교수님의 말씀(코멘트, 지시, 수업 중 발언)을 입력하면
그 말씀을 PDF 위에 바로 적용할 필기로 바꾼다.

- quote: 해당 페이지 텍스트에 실제로 있는 연속된 문구를 바꾸지 말고 그대로 복사한다 (5~120자).
  위치를 특정할 수 없는 말씀이면 빈 문자열로 두고 page는 가장 관련 있는 페이지로 한다.
- note: 학생이 여백에 적을 짧은 한국어 필기 (1~2문장). 교수님이 강조한 이유나 해야 할 일을 담는다.
- kind: highlight(중요·시험), underline(수정 필요·주의), note(메모만).
- color: 중요=yellow, 수정 필요=red, 참고=blue, 아이디어=green, 질문=pink.
- todos: 교수님이 시킨 할 일(과제, 실험, 수정 요청)이 있으면 넣고, 없으면 빈 배열.
- summary: 말씀의 핵심 한 줄 요약.
말씀 하나가 여러 위치에 해당하면 annotation을 여러 개 만든다.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'annotations', 'todos'],
  properties: {
    summary: { type: 'string' },
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'quote', 'note', 'kind', 'color'],
        properties: {
          page: { type: 'integer' },
          quote: { type: 'string' },
          note: { type: 'string' },
          kind: { type: 'string', enum: ['highlight', 'underline', 'note'] },
          color: { type: 'string', enum: ['yellow', 'green', 'blue', 'pink', 'red'] },
        },
      },
    },
    todos: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * Ask Claude to turn a professor's remark into annotations for the given pages.
 * pages: [{ page, text }]
 */
export async function applyRemark({ apiKey, model, remark, pages, currentPage }) {
  if (!apiKey) throw new Error('설정에서 Anthropic API 키를 먼저 입력해 주세요.')
  // The key never leaves this browser except to api.anthropic.com.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const context = pages
    .map(p => `[page ${p.page}]\n${p.text || '(텍스트 없음 — 스캔본일 수 있음)'}`)
    .join('\n\n')
  const user = `현재 보고 있는 페이지: ${currentPage}\n\n<pdf>\n${context}\n</pdf>\n\n교수님 말씀:\n${remark.trim()}`

  // Haiku has no server-side refusal fallback; Opus/Sonnet use the default routing.
  const fallback = model === 'claude-haiku-5-5'
    ? {}
    : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }

  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    ...fallback,
  })

  if (res.stop_reason === 'refusal') {
    throw new Error('AI가 이 요청을 처리하지 않았습니다. 말씀을 조금 바꿔서 다시 시도해 주세요.')
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('응답이 너무 길어 잘렸습니다. 범위를 좁혀서 다시 시도해 주세요.')
  }
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const data = JSON.parse(text)
  const valid = new Set(pages.map(p => p.page))
  data.annotations = data.annotations.map(a => ({ ...a, page: valid.has(a.page) ? a.page : currentPage }))
  return data
}

export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'API 키가 올바르지 않습니다.'
  if (err instanceof Anthropic.RateLimitError) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  if (err instanceof Anthropic.APIConnectionError) return '네트워크 연결을 확인해 주세요.'
  if (err instanceof Anthropic.APIError) return `AI 오류 (${err.status}): ${err.message}`
  return err?.message || String(err)
}
