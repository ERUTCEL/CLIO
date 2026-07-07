"""Prompt template loading and rendering.

Templates live in ``sagwan/prompts/`` as plain-text files with a
``[SYSTEM]`` / ``[USER]`` section structure and ``{placeholder}`` variables.
``common_rules`` has no ``[USER]`` section: it is a shared system preamble
prepended to every analysis template's system prompt.

Templates embed literal JSON examples, so ``str.format`` cannot be used;
only ``{ascii_identifier}`` tokens are treated as placeholders, and filling
applies to the [USER] section only — common_rules mentions
``{retrieved_docs}`` descriptively when documenting the input format.
"""

import re
from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).parent / "prompts"
COMMON_RULES = "common_rules"
_PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]*)\}")
_SECTION_RE = re.compile(r"^\[(SYSTEM|USER)\]\s*$", re.MULTILINE)


def list_templates() -> list[str]:
    """Names of the analysis templates (excludes the shared common_rules)."""
    return sorted(
        p.stem for p in PROMPT_DIR.glob("*.txt") if p.stem != COMMON_RULES
    )


@lru_cache(maxsize=None)
def load_template(name: str) -> str:
    path = PROMPT_DIR / f"{name}.txt"
    if not path.is_file():
        available = ", ".join(list_templates())
        raise KeyError(f"unknown template {name!r}; available: {available}")
    return path.read_text(encoding="utf-8")


def split_sections(text: str) -> dict[str, str]:
    """Split template text into its [SYSTEM] / [USER] sections."""
    sections: dict[str, str] = {}
    matches = list(_SECTION_RE.finditer(text))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections[m.group(1).lower()] = text[m.end():end].strip()
    return sections


def extract_placeholders(text: str) -> set[str]:
    return set(_PLACEHOLDER_RE.findall(text))


def fill_placeholders(text: str, variables: dict[str, str]) -> str:
    def _sub(m: re.Match[str]) -> str:
        return variables.get(m.group(1), m.group(0))

    return _PLACEHOLDER_RE.sub(_sub, text)


def build_prompt(
    name: str,
    variables: dict[str, str],
    include_common_rules: bool = True,
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for one analysis template.

    ``variables`` fills the ``{placeholder}`` tokens in the [USER] section
    (e.g. ``retrieved_docs``, ``event_name``). Missing placeholders are left
    intact so callers can layer fills; unknown keys are ignored.
    """
    sections = split_sections(load_template(name))
    system = sections.get("system", "")
    user = sections.get("user", "")

    if include_common_rules:
        common = split_sections(load_template(COMMON_RULES)).get("system", "")
        system = f"{common}\n\n{system}" if system else common

    return system, fill_placeholders(user, variables)
