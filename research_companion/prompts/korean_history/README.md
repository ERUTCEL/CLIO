# Korean History Analysis Prompts

Prompt templates for analyzing modern Korean history sources (근현대 한국사) and
classical Chinese (한문/한자) historical documents with the RAG pipeline.

Loaded via `generation/history_prompts.py`:

```python
from generation.history_prompts import build_history_prompt, list_templates

system, user = build_history_prompt(
    "causal",
    {
        "event_name": "갑오개혁",
        "event_date": "1894",
        "analysis_type": "전체",
        "retrieved_docs": docs_block,
    },
)
```

## Template Format

Each `.txt` file has an optional `[SYSTEM]` section (role + analysis rules) and
`[USER]` section (input slots + required output format). `{placeholder}` tokens
in the `[USER]` section are filled at build time; only lowercase ASCII
identifiers are treated as placeholders, so the literal JSON examples inside
the templates are left untouched.

## Templates

| File | Purpose | Key placeholders |
|------|---------|------------------|
| `common_rules.txt` | Shared analysis principles prepended to every system prompt: source-grounded answers, `추정:` marking for inference, `제공 사료만으로는 확인 불가` for gaps, primary/secondary source distinction, `[DOC-N]` input format | — (system only) |
| `hanja_preprocess.txt` | Structure a hanja/hanmun source for RAG ingest: preserve original text, flag OCR-suspect glyphs, punctuate (표점), translate, extract entities and metadata | `hanja_text`, `source_name`, `author_or_org`, `date`, `source_reference`, `purpose` |
| `causal.txt` | Causal analysis of an event: structural vs. direct causes, domestic vs. international factors, immediate results vs. long-term impact | `event_name`, `event_date`, `analysis_type`, `retrieved_docs` |
| `compare.txt` | Source criticism comparing two documents: authorship, viewpoint, bias, silences, conflicting claims | `comparison_topic`, `source_a_*`, `source_b_*` |
| `context.txt` | Period context synthesis: politics, economy, society, culture, international relations, and their interconnections | `period`, `depth`, `retrieved_docs` |
| `graph.txt` | Extract person/organization/event nodes and typed relation edges (협력/대립/위계/혈연/영향/소속/참여) as parseable JSON | `retrieved_docs`, `focal_person`, `time_range` |
