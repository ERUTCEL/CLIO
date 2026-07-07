import json

from sagwan.html_ingest import extract_text, html_to_document, write_json_draft

SAMPLE_HTML = """
<html>
<head><title>매천야록 (梅泉野錄) — 스캔본</title>
<style>body { color: red; }</style>
<script>console.log("skip me");</script>
</head>
<body>
<h1>고부 민란 관련 기사</h1>
<p>고부 군수 조병갑의 탐학이 심하여   백성들이 견디지 못하였다.</p>
<p>전봉준이 무리를 이끌고 관아를 습격하였다.</p>
<div>이것이 난의 시작이었다.</div>
</body>
</html>
"""


def test_extract_text_strips_script_and_style():
    title, text = extract_text(SAMPLE_HTML)
    assert title == "매천야록 (梅泉野錄) — 스캔본"
    assert "console.log" not in text
    assert "color: red" not in text
    assert "고부 군수 조병갑의 탐학이 심하여 백성들이 견디지 못하였다." in text
    assert "전봉준이 무리를 이끌고 관아를 습격하였다." in text
    assert "이것이 난의 시작이었다." in text


def test_extract_text_collapses_whitespace_within_a_block():
    _, text = extract_text("<p>여러   개의    공백</p>")
    assert "여러 개의 공백" in text
    assert "  " not in text


def test_extract_text_empty_title_falls_back_later(tmp_path):
    title, _ = extract_text("<html><body><p>본문만 있음</p></body></html>")
    assert title == ""


def test_html_to_document_uses_filename_when_no_title(tmp_path):
    html_file = tmp_path / "untitled_scan.html"
    html_file.write_text("<html><body><p>제목 없는 사료</p></body></html>", encoding="utf-8")

    doc = html_to_document(html_file)

    assert doc.source_name == "untitled_scan"
    assert "제목 없는 사료" in doc.original_text
    assert doc.reference == "untitled_scan.html"


def test_html_to_document_uses_title_when_present(tmp_path):
    html_file = tmp_path / "maecheon.html"
    html_file.write_text(SAMPLE_HTML, encoding="utf-8")

    doc = html_to_document(html_file)

    assert doc.source_name == "매천야록 (梅泉野錄) — 스캔본"
    assert doc.reference == "maecheon.html"
    # untouched metadata fields are left for the researcher to fill in
    assert doc.author_or_org == ""
    assert doc.source_type == ""


def test_write_json_draft_creates_editable_json(tmp_path):
    html_file = tmp_path / "sample.html"
    html_file.write_text(SAMPLE_HTML, encoding="utf-8")
    out_dir = tmp_path / "drafts"

    out_path = write_json_draft(html_file, out_dir)

    assert out_path == out_dir / "sample.json"
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert data["source_name"] == "매천야록 (梅泉野錄) — 스캔본"
    assert "고부 군수 조병갑" in data["original_text"]


def test_write_json_draft_creates_missing_output_dir(tmp_path):
    html_file = tmp_path / "sample.html"
    html_file.write_text("<html><body><p>내용</p></body></html>", encoding="utf-8")
    out_dir = tmp_path / "nested" / "drafts"

    out_path = write_json_draft(html_file, out_dir)

    assert out_path.exists()
