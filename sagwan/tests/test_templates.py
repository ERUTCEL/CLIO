import pytest

from sagwan.templates import (
    build_prompt,
    extract_placeholders,
    fill_placeholders,
    list_templates,
    load_template,
    split_sections,
)

EXPECTED_TEMPLATES = ["causal", "compare", "context", "graph", "hanja_preprocess"]

EXPECTED_PLACEHOLDERS = {
    "causal": {"event_name", "event_date", "analysis_type", "retrieved_docs"},
    "context": {"period", "depth", "retrieved_docs"},
    "graph": {"retrieved_docs", "focal_person", "time_range"},
    "hanja_preprocess": {
        "hanja_text",
        "source_name",
        "author_or_org",
        "date",
        "source_reference",
        "purpose",
    },
    "compare": {
        "comparison_topic",
        "source_a_name",
        "author_a",
        "date_a",
        "source_a_type",
        "source_a_viewpoint",
        "source_a_content",
        "source_b_name",
        "author_b",
        "date_b",
        "source_b_type",
        "source_b_viewpoint",
        "source_b_content",
    },
}


def test_list_templates_excludes_common_rules():
    assert list_templates() == EXPECTED_TEMPLATES


def test_unknown_template_raises():
    with pytest.raises(KeyError):
        load_template("nonexistent")


@pytest.mark.parametrize("name", EXPECTED_TEMPLATES)
def test_every_template_has_system_and_user(name):
    sections = split_sections(load_template(name))
    assert sections["system"]
    assert sections["user"]


def test_common_rules_is_system_only():
    sections = split_sections(load_template("common_rules"))
    assert "system" in sections
    assert "user" not in sections


@pytest.mark.parametrize("name", EXPECTED_TEMPLATES)
def test_user_section_placeholders(name):
    user = split_sections(load_template(name))["user"]
    assert extract_placeholders(user) == EXPECTED_PLACEHOLDERS[name]


def test_fill_placeholders_ignores_json_braces():
    text = '{"nodes": []} and {retrieved_docs}'
    filled = fill_placeholders(text, {"retrieved_docs": "[DOC-1] ..."})
    assert filled == '{"nodes": []} and [DOC-1] ...'


def test_fill_placeholders_leaves_missing_intact():
    assert fill_placeholders("{event_name} in {event_date}", {"event_name": "X"}) == (
        "X in {event_date}"
    )


def test_build_prompt_prepends_common_rules():
    system, user = build_prompt(
        "causal",
        {
            "event_name": "갑오개혁",
            "event_date": "1894",
            "analysis_type": "전체",
            "retrieved_docs": "[DOC-1] 사료명: 테스트",
        },
    )
    assert system.startswith(split_sections(load_template("common_rules"))["system"])
    assert "근현대 한국사 전문 역사 분석가" in system
    assert "갑오개혁" in user
    assert "[DOC-1] 사료명: 테스트" in user


def test_build_prompt_system_keeps_descriptive_placeholder():
    system, _ = build_prompt("causal", {"retrieved_docs": "SHOULD NOT LEAK"})
    assert "{retrieved_docs}" in system
    assert "SHOULD NOT LEAK" not in system


def test_build_prompt_without_common_rules():
    system, _ = build_prompt("graph", {}, include_common_rules=False)
    assert "인물 관계망 분석 전문가" in system
    assert "공통 분석 원칙" not in system
