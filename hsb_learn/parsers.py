"""
HSB Learn - Document Text Extraction Module
Extracts text reliably from PDF, DOCX, PPTX, and TXT files.
"""

import os
import re
from pathlib import Path


def extract_text_from_file(file_path: str) -> dict:
    """
    Extracts structured text and metadata from uploaded study documents.
    Returns:
    {
        "success": bool,
        "text": str,
        "word_count": int,
        "char_count": int,
        "page_or_slide_count": int,
        "error": str or None
    }
    """
    path = Path(file_path)
    if not path.exists():
        return {"success": False, "text": "", "word_count": 0, "char_count": 0, "page_or_slide_count": 0, "error": f"File not found: {file_path}"}

    ext = path.suffix.lower()

    try:
        if ext == ".pdf":
            return _extract_pdf(path)
        elif ext in [".docx", ".doc"]:
            return _extract_docx(path)
        elif ext in [".pptx", ".ppt"]:
            return _extract_pptx(path)
        elif ext in [".txt", ".md", ".csv", ".json", ".rtf"]:
            return _extract_txt(path)
        else:
            # Fallback text attempt
            return _extract_txt(path)
    except Exception as e:
        return {
            "success": False,
            "text": "",
            "word_count": 0,
            "char_count": 0,
            "page_or_slide_count": 0,
            "error": f"Error parsing {path.name}: {str(e)}"
        }


def _clean_text(raw_text: str) -> str:
    # Normalize unicode spaces and line breaks
    text = re.sub(r"\r\n|\r", "\n", raw_text)
    # Remove excessive blank lines (more than 2)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip null bytes
    text = text.replace("\x00", "")
    return text.strip()


def _extract_pdf(path: Path) -> dict:
    import pypdf
    reader = pypdf.PdfReader(str(path))
    pages_text = []
    page_count = len(reader.pages)

    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        if page_text.strip():
            pages_text.append(f"--- [Page {idx + 1}] ---\n{page_text.strip()}")

    combined = _clean_text("\n\n".join(pages_text))
    return {
        "success": True,
        "text": combined,
        "word_count": len(combined.split()),
        "char_count": len(combined),
        "page_or_slide_count": page_count,
        "error": None
    }


def _extract_docx(path: Path) -> dict:
    import docx
    doc = docx.Document(str(path))
    lines = []

    # Paragraphs
    for p in doc.paragraphs:
        txt = p.text.strip()
        if txt:
            # Preserve headings if heading style
            if p.style.name.startswith("Heading"):
                lines.append(f"\n### {txt}\n")
            else:
                lines.append(txt)

    # Tables
    for table in doc.tables:
        table_lines = []
        for row in table.rows:
            row_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
            if any(row_cells):
                table_lines.append(" | ".join(row_cells))
        if table_lines:
            lines.append("\n[Table Data]:\n" + "\n".join(table_lines) + "\n")

    combined = _clean_text("\n\n".join(lines))
    return {
        "success": True,
        "text": combined,
        "word_count": len(combined.split()),
        "char_count": len(combined),
        "page_or_slide_count": max(1, len(doc.paragraphs) // 15),
        "error": None
    }


def _extract_pptx(path: Path) -> dict:
    import pptx
    prs = pptx.Presentation(str(path))
    slides_text = []
    slide_count = len(prs.slides)

    for idx, slide in enumerate(prs.slides):
        slide_parts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    t = paragraph.text.strip()
                    if t:
                        slide_parts.append(t)
            elif shape.has_table:
                for row in shape.table.rows:
                    row_txt = [c.text.strip().replace("\n", " ") for c in row.cells]
                    if any(row_txt):
                        slide_parts.append(" | ".join(row_txt))

        # Check speaker notes
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                slide_parts.append(f"[Speaker Notes]: {notes}")

        if slide_parts:
            slides_text.append(f"--- [Slide {idx + 1}] ---\n" + "\n".join(slide_parts))

    combined = _clean_text("\n\n".join(slides_text))
    return {
        "success": True,
        "text": combined,
        "word_count": len(combined.split()),
        "char_count": len(combined),
        "page_or_slide_count": slide_count,
        "error": None
    }


def _extract_txt(path: Path) -> dict:
    encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]
    content = ""
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc) as f:
                content = f.read()
            break
        except Exception:
            continue

    combined = _clean_text(content)
    return {
        "success": True,
        "text": combined,
        "word_count": len(combined.split()),
        "char_count": len(combined),
        "page_or_slide_count": 1,
        "error": None
    }
