// 선택적 크래시 리포팅 (Sentry).
//
// 로컬 우선/프라이버시가 CLIO의 핵심 가치이므로 기본은 완전 비활성화입니다.
// 활성화하려면:
//   1. `npm i @sentry/electron`
//   2. 아래 SENTRY_DSN에 프로젝트 DSN 입력
// DSN이 비어 있거나 패키지가 없으면 아무 것도 하지 않습니다.
// 사용자 문서/개인 데이터는 절대 첨부하지 않고 크래시 스택만 전송합니다.

const SENTRY_DSN = ''

export async function initTelemetry(log) {
  if (!SENTRY_DSN) return false
  try {
    const Sentry = await import('@sentry/electron/main')
    Sentry.init({
      dsn: SENTRY_DSN,
      // 프라이버시: 기본 PII(IP 등) 전송 금지
      sendDefaultPii: false,
      autoSessionTracking: false,
    })
    log?.info('[telemetry] Sentry crash reporting enabled')
    return true
  } catch (err) {
    log?.warn('[telemetry] Sentry not available:', err?.message)
    return false
  }
}
