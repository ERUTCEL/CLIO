# 사관 (Sagwan)

근현대 한국사 사료 분석 어시스턴트. 조선의 사관(史官)처럼, 제공된 사료에 근거해
엄밀한 역사학적 분석을 수행합니다. Claude API 기반의 독립형 CLI + 파이썬 라이브러리입니다.

## 분석 모드

| 모드 | 설명 | 템플릿 |
|------|------|--------|
| `causal` | 사건 인과관계 분석 — 구조적/직접 원인, 국내/국제 요인, 즉각적 결과와 장기적 영향 구분 | `causal.txt` |
| `compare` | 두 사료 비교·대조 — 작성 주체, 관점, 편향, 침묵, 상충 서술의 개연성 판단 | `compare.txt` |
| `context` | 시대 맥락 종합 분석 — 정치·경제·사회·문화·국제관계와 상호 연관성 | `context.txt` |
| `graph` | 인물·단체·사건 관계망 추출 — 협력/대립/위계/혈연/영향 관계를 그래프 JSON으로 | `graph.txt` |
| `hanja` | 한자·한문 사료 전처리 — 원문 보존, OCR 오류 표시, 표점, 번역, 개체명·메타데이터 추출 | `hanja_preprocess.txt` |

모든 모드에 공통 분석 원칙(`common_rules.txt`)이 시스템 프롬프트로 선행됩니다:
사료 근거 답변, `추정:` 표시, `제공 사료만으로는 확인 불가` 명시, 1차/2차 사료 구분 등.

## 설치

```bash
cd sagwan
pip install -e ".[dev]"
export ANTHROPIC_API_KEY=sk-ant-...   # 또는 `ant auth login`
```

## 사용법 (CLI)

```bash
# 사건 인과관계 분석
sagwan causal --event-name "동학농민운동" --event-date "1894" \
    --analysis-type 전체 --docs examples/donghak/

# 두 사료 비교
sagwan compare --topic "전주성 입성 경위" \
    --source-a examples/donghak/maecheon.json \
    --source-b examples/donghak/official.json

# 시대 맥락 분석
sagwan context --period "1890년대 조선" --depth 심층 --docs examples/donghak/

# 인물 관계망 추출
sagwan graph --docs examples/donghak/ --focal-person "전봉준" --time-range "1892~1895"

# 한문 사료 전처리
sagwan hanja --input scan_ocr.txt --source-name "매천야록" --author "황현"
```

공통 옵션: `--model` (기본 `claude-opus-4-8`), `--max-tokens` (기본 64000),
`-o/--output 결과.md`, `-q/--quiet` (스트리밍 끄기).

## 사료 입력 형식 (JSON)

`--docs`는 JSON 파일 하나(객체 또는 배열) 또는 `.json` 파일들이 든 디렉토리를 받습니다.

```json
{
  "source_name": "매천야록",
  "author_or_org": "황현",
  "created_date": "1894~1910",
  "event_date": "1894",
  "source_type": "1차 사료",
  "viewpoint": "민간",
  "language": "한문",
  "original_text": "...",
  "punctuated_text": "...",
  "translation": "...",
  "people": ["전봉준"],
  "organizations": [],
  "places": ["전주"],
  "keywords": ["동학농민운동"],
  "reference": "...",
  "license": ""
}
```

모든 필드는 선택이며, 비어 있는 필드는 프롬프트에서 생략됩니다.

## 라이브러리 사용

```python
from sagwan import HistoryAnalyzer, load_documents

analyzer = HistoryAnalyzer()
docs = load_documents("examples/donghak/")
result = analyzer.causal("동학농민운동", "1894", docs)
print(result.text)
```

## 테스트

```bash
pytest tests/   # API 호출 없이 프롬프트 조립·문서 포맷을 검증
```

## 구조

```
sagwan/
  sagwan/
    prompts/       # 분석 프롬프트 템플릿 ([SYSTEM]/[USER] 구조)
    templates.py   # 템플릿 로드·섹션 분리·플레이스홀더 치환
    documents.py   # SourceDocument 모델 + [DOC-N] 블록 포맷
    analyzer.py    # Claude API 호출 (스트리밍, adaptive thinking, prompt caching)
    cli.py         # sagwan 명령
  tests/
  examples/
```
