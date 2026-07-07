import json

import pytest

from sagwan.documents import SourceDocument, format_docs, load_documents

DOC = {
    "source_name": "매천야록",
    "author_or_org": "황현",
    "created_date": "1894~1910",
    "source_type": "1차 사료",
    "viewpoint": "민간",
    "language": "한문",
    "translation": "동학군이 전주성에 입성하였다.",
    "people": ["전봉준", "황현"],
    "keywords": ["동학농민운동"],
}


def test_to_block_orders_and_skips_empty():
    block = SourceDocument.from_dict(DOC).to_block(3)
    lines = block.splitlines()
    assert lines[0] == "[DOC-3]"
    assert "사료명: 매천야록" in lines
    assert "주요 인물: 전봉준, 황현" in lines
    # empty fields are omitted entirely
    assert not any(line.startswith("표점문") for line in lines)
    assert not any(line.endswith(": ") for line in lines)


def test_from_dict_rejects_unknown_fields():
    with pytest.raises(ValueError, match="unknown document field"):
        SourceDocument.from_dict({"title": "oops"})


def test_format_docs_numbers_sequentially():
    docs = [SourceDocument(source_name="A"), SourceDocument(source_name="B")]
    text = format_docs(docs)
    assert "[DOC-1]\n사료명: A" in text
    assert "[DOC-2]\n사료명: B" in text


def test_load_documents_single_object_and_list(tmp_path):
    single = tmp_path / "one.json"
    single.write_text(json.dumps(DOC), encoding="utf-8")
    assert len(load_documents(single)) == 1

    many = tmp_path / "many.json"
    many.write_text(json.dumps([DOC, DOC]), encoding="utf-8")
    assert len(load_documents(many)) == 2


def test_load_documents_directory(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps(DOC), encoding="utf-8")
    (tmp_path / "b.json").write_text(json.dumps([DOC, DOC]), encoding="utf-8")
    assert len(load_documents(tmp_path)) == 3


def test_load_documents_empty_directory_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_documents(tmp_path)
