"""paper/paper.md → paper/paper.docx 변환 (제목·문단·목록·표·그림·굵게).

사용법: python paper/build_docx.py
pandoc 없이 python-docx만으로 만든다. 지원하는 마크다운은 원고에 쓰는 만큼만이다.
"""
from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

HERE = Path(__file__).resolve().parent
FONT = "맑은 고딕"


def set_font(doc: Document) -> None:
    for name in ("Normal", "Heading 1", "Heading 2", "Heading 3", "Title", "List Bullet", "List Number"):
        st = doc.styles[name]
        st.font.name = FONT
        st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    doc.styles["Normal"].font.size = Pt(10.5)


def add_inline(par, text: str) -> None:
    """**굵게**, `코드` 처리."""
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = par.add_run(part[2:-2]); run.bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = par.add_run(part[1:-1]); run.font.name = "Consolas"
        else:
            par.add_run(part)


def add_table(doc: Document, lines: list[str]) -> None:
    rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in lines
            if not re.match(r"^\|?\s*:?-{2,}", ln.strip().strip("|").split("|")[0].strip() or "--")]
    rows = [r for r in rows if not all(re.fullmatch(r":?-{2,}:?", c) for c in r)]
    ncol = max(len(r) for r in rows)
    t = doc.add_table(rows=len(rows), cols=ncol)
    t.style = "Table Grid"
    for i, r in enumerate(rows):
        for j in range(ncol):
            cell = t.cell(i, j)
            cell.text = ""
            p = cell.paragraphs[0]
            add_inline(p, r[j] if j < len(r) else "")
            for run in p.runs:
                run.font.size = Pt(8.5)
                if i == 0:
                    run.bold = True
    doc.add_paragraph()


def build(md_path: Path, out_path: Path) -> None:
    doc = Document()
    set_font(doc)
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(2.2)
    lines = md_path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("|"):
            block = []
            while i < len(lines) and lines[i].startswith("|"):
                block.append(lines[i]); i += 1
            add_table(doc, block)
            continue
        m = re.match(r"^!\[(.*?)\]\((.*?)\)", ln)
        if m:
            img = (md_path.parent / m.group(2)).resolve()
            if img.exists():
                doc.add_picture(str(img), width=Cm(15))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            cap = doc.add_paragraph(m.group(1)); cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in cap.runs:
                r.font.size = Pt(9)
            i += 1
            continue
        if ln.startswith("# "):
            doc.add_heading(ln[2:].strip(), level=0)
        elif ln.startswith("## "):
            doc.add_heading(ln[3:].strip(), level=1)
        elif ln.startswith("### "):
            doc.add_heading(ln[4:].strip(), level=2)
        elif ln.startswith("#### "):
            doc.add_heading(ln[5:].strip(), level=3)
        elif re.match(r"^\s*[-*] ", ln):
            p = doc.add_paragraph(style="List Bullet"); add_inline(p, re.sub(r"^\s*[-*] ", "", ln))
        elif re.match(r"^\s*\d+\. ", ln):
            p = doc.add_paragraph(style="List Number"); add_inline(p, re.sub(r"^\s*\d+\. ", "", ln))
        elif ln.startswith("> "):
            p = doc.add_paragraph(); add_inline(p, ln[2:]); p.paragraph_format.left_indent = Cm(1)
        elif ln.strip() in ("", "---"):
            pass
        else:
            p = doc.add_paragraph(); add_inline(p, ln.strip())
        i += 1
    doc.save(out_path)


if __name__ == "__main__":
    build(HERE / "paper.md", HERE / "paper.docx")
    print("wrote", HERE / "paper.docx")
