# 사관 (Sagwan) — CLAUDE.md

## 프로젝트 개요

근현대 한국사 및 한자 사료를 엄밀하게 분석하는 Claude API 기반 CLI + 파이썬
라이브러리. `CLIO`(별개 프로젝트) 저장소 안에 있지만 완전히 독립적이며,
`sagwan/` 디렉토리만 그대로 다른 저장소로 옮겨도 동작한다.

핵심은 사용자가 원래 제공한 6개 프롬프트(공통 원칙 + 5개 분석 모드)이며,
이를 감싸는 최소한의 파이썬 레이어(템플릿 로더, 사료 모델, Claude API 호출,
CLI)로 실제로 쓸 수 있는 도구로 만든 것.

## 지금까지 한 일 (완료)

1. **CLIO에 잘못 통합했던 것을 되돌림** — 처음에 `research_companion/`에
   붙였다가, 사용자가 "CLIO를 건들면 안 된다"고 해서 revert(`8750687`)하고
   별도 프로젝트로 재구성함.
2. **`sagwan/` 프로젝트 뼈대 구성** (커밋 `84bac9a`):
   - `sagwan/prompts/*.txt` — 사용자가 준 6개 프롬프트 원문 그대로
     (common_rules, causal, compare, context, graph, hanja_preprocess)
   - `sagwan/templates.py` — `[SYSTEM]`/`[USER]` 섹션 분리, `{placeholder}`
     치환(ASCII 식별자만, USER 섹션에만 적용 — JSON 예시나 common_rules의
     설명용 `{retrieved_docs}` 언급이 깨지지 않도록)
   - `sagwan/documents.py` — `SourceDocument` 데이터클래스(common_rules의
     `[DOC-N]` 입력 형식과 1:1 대응), JSON 파일/디렉토리 로드
   - `sagwan/analyzer.py` — `HistoryAnalyzer` 클래스. `claude-opus-4-8`,
     스트리밍, adaptive thinking, 시스템 프롬프트 캐싱(`cache_control`).
     모드별 메서드: `causal`, `compare`, `period_context`, `graph`,
     `hanja_preprocess`
   - `sagwan/cli.py` — `sagwan causal|compare|context|graph|hanja` 서브커맨드
   - `tests/` — 가짜 클라이언트로 API 호출 없이 검증 (27개)
   - `examples/donghak/` — 동학농민운동 예시 사료 2건 (매천야록/관찬 실록)
3. **HTML 사료 수집 기능 추가** (커밋 `eb7af2e`):
   - `sagwan/html_ingest.py` — stdlib `html.parser`만 사용, `<title>` →
     사료명, 본문 텍스트 → 원문 추출. script/style 태그 스킵.
   - CLI: `sagwan ingest-html <파일들>.html --out <디렉토리>` — HTML을
     편집 가능한 JSON 초안으로 변환 (메타데이터는 빈 채로, 연구자가 채움)
   - 테스트 7개 추가 (총 34개, 전부 통과)

모든 작업은 브랜치 `claude/korean-history-analysis-rules-ny5vvq`에 커밋·푸시됨.

## 진행 중 (미완료) — Google Drive 사료 수집

사용자가 "구글드라이브에 사료자료 올려놨으니까 학습하고 깃허브에 푸쉬해줘"라고
요청함. `list_recent_files`로 확인한 결과:

- 파일 형식: **XML** (`text/xml`), 파일명 패턴 `mk_082.xml` 등
  ("mk"는 아마 매일신보(每日申報) 등의 약자로 추정 — **확인 필요**)
- 소유자: `choigangdany@gmail.com`
- 예시 file ID: `1ZfQJtUqCzljM1d564nupx3jpAZKr31fn` (mk_082.xml, ~1.9MB)
- 폴더(`parentId`): `1grr2PQlE7GtO6ekUefWD8hNXFIIyNY0z`
- `list_recent_files` 결과가 매우 커서(12만+ 토큰) 파일로 저장됨 → jq로
  파싱해야 함. 서브에이전트에 위임하는 게 나을 수 있음.

**다음에 이어서 할 일:**
1. `parentId`로 폴더 안의 전체 XML 목록을 가져오기 (search_files with
   `parentId = '1grr2PQlE7GtO6ekUefWD8hNXFIIyNY0z'`)
2. XML 샘플 1~2개를 `read_file_content` 또는 `download_file_content`로 받아
   구조 파악 (TEI? 자체 스키마? 한자/국한문 혼용?)
3. `sagwan/html_ingest.py`를 참고해 `sagwan/xml_ingest.py`(가칭) 작성 —
   XML → `SourceDocument` JSON 초안 변환. HTML과 달리 XML에는 메타데이터
   태그가 이미 있을 가능성이 높으므로, 태그 매핑을 확인 후 최대한 자동 채움
4. 전체 파일(정확한 개수 미확인, 최소 20개 이상 존재)을 일괄 변환
5. `sagwan/examples/` 또는 새 디렉토리에 결과 JSON 저장, 커밋 + 푸시

**주의:** 아직 어떤 사료도 실제로 다운로드/변환하지 않았음. "학습"은 아직
시작 전 — Drive 파일 목록 확인까지만 진행됨.

## 참고 — 알게 된 것

- `mcp__Google_Drive__list_recent_files`는 출력이 커서 바로 못 받고 파일로
  떨어짐 → `jq`로 구조 확인 후 필요한 필드만 추출할 것.
- 이 세션은 원격 컨테이너라 사용자의 로컬 "바탕화면"에는 접근 불가 — Drive,
  GitHub, 또는 채팅 첨부로만 파일을 받을 수 있음.
