"""
HSB Learn - FastAPI Application Server
Provides REST APIs for Dashboard, Terms, Subjects, Materials, AI Notes, Quizzes, and Assignments.
"""

import os
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import get_db, init_db, UPLOADS_DIR
from .parsers import extract_text_from_file
from .ai_service import generate_short_notes, generate_quiz, test_llm_connection

# Initialize Database on startup
init_db()

app = FastAPI(
    title="HSB Learn - AI-Powered MBA Learning Management System",
    description="Dedicated Academic LMS and AI Study Assistant for MBA Product Management at Hari Shankar Singhania School of Business (HSB)",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Serve static frontend files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def get_current_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


# =========================================================================
# Pydantic Request Models
# =========================================================================

class TermCreate(BaseModel):
    name: str
    academic_year: Optional[str] = "2026-2027"
    is_active: Optional[int] = 1

class TermUpdate(BaseModel):
    name: Optional[str] = None
    academic_year: Optional[str] = None
    is_active: Optional[int] = None

class SubjectCreate(BaseModel):
    term_id: int
    name: str
    code: Optional[str] = ""
    instructor: Optional[str] = ""
    credits: Optional[int] = 3
    color: Optional[str] = "indigo"
    description: Optional[str] = ""

class SubjectUpdate(BaseModel):
    term_id: Optional[int] = None
    name: Optional[str] = None
    code: Optional[str] = None
    instructor: Optional[str] = None
    credits: Optional[int] = None
    color: Optional[str] = None
    description: Optional[str] = None

class ManualMaterialCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    content: str

class NoteCreate(BaseModel):
    subject_id: int
    material_id: Optional[int] = None
    title: str
    content_markdown: str
    summary_tags: Optional[List[str]] = []

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content_markdown: Optional[str] = None
    summary_tags: Optional[List[str]] = None

class GenerateNotesRequest(BaseModel):
    subject_id: int
    material_id: Optional[int] = None
    custom_title: Optional[str] = None
    raw_text: Optional[str] = None

class GenerateQuizRequest(BaseModel):
    subject_id: int
    material_id: Optional[int] = None
    num_questions: Optional[int] = 10
    difficulty: Optional[str] = "Medium"
    question_types: Optional[str] = "Mixed (MCQ, True/False, Concept)"

class QuizAttemptSubmit(BaseModel):
    answers: dict  # {question_id: selected_answer_string}
    time_spent_seconds: Optional[int] = 0

class AssignmentCreate(BaseModel):
    term_id: int
    subject_id: int
    title: str
    description: Optional[str] = ""
    due_date: str
    priority: Optional[str] = "Medium"
    status: Optional[str] = "Pending"
    reminder_datetime: Optional[str] = ""

class AssignmentUpdate(BaseModel):
    term_id: Optional[int] = None
    subject_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    reminder_datetime: Optional[str] = None

class SettingsUpdate(BaseModel):
    settings: dict

class TestKeyRequest(BaseModel):
    provider: str
    api_key: str
    model: str


# =========================================================================
# Root Frontend Endpoint
# =========================================================================

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0"
        }
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"), headers=headers)
    return HTMLResponse(content="<h1>HSB Learn API Running. static/index.html not found yet.</h1>")


# =========================================================================
# Dashboard Stats API
# =========================================================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    conn = get_db()

    total_subjects = conn.execute("SELECT COUNT(*) as c FROM subjects").fetchone()["c"]
    total_materials = conn.execute("SELECT COUNT(*) as c FROM materials").fetchone()["c"]
    total_notes = conn.execute("SELECT COUNT(*) as c FROM notes").fetchone()["c"]
    total_quizzes = conn.execute("SELECT COUNT(*) as c FROM quizzes").fetchone()["c"]

    # Upcoming Assignments
    upcoming_assignments = conn.execute("""
        SELECT a.*, s.name as subject_name, s.color as subject_color, t.name as term_name
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        JOIN terms t ON a.term_id = t.id
        WHERE a.status != 'Completed'
        ORDER BY a.due_date ASC
        LIMIT 6
    """).fetchall()

    # Overdue Assignments count
    now_iso = datetime.now().isoformat()
    overdue_count = conn.execute("""
        SELECT COUNT(*) as c FROM assignments
        WHERE status != 'Completed' AND due_date < ?
    """, (now_iso,)).fetchone()["c"]

    # Recently Uploaded Materials
    recent_materials = conn.execute("""
        SELECT m.*, s.name as subject_name, s.color as subject_color
        FROM materials m
        JOIN subjects s ON m.subject_id = s.id
        ORDER BY m.id DESC
        LIMIT 5
    """).fetchall()

    # Recently Generated Notes
    recent_notes = conn.execute("""
        SELECT n.id, n.title, n.subject_id, n.is_ai_generated, n.updated_at, s.name as subject_name, s.color as subject_color
        FROM notes n
        JOIN subjects s ON n.subject_id = s.id
        ORDER BY n.id DESC
        LIMIT 5
    """).fetchall()

    # Recently Generated Quizzes
    recent_quizzes = conn.execute("""
        SELECT q.id, q.title, q.num_questions, q.difficulty, q.created_at, s.name as subject_name, s.color as subject_color
        FROM quizzes q
        JOIN subjects s ON q.subject_id = s.id
        ORDER BY q.id DESC
        LIMIT 5
    """).fetchall()

    # Quiz Performance Summary
    quiz_stats = conn.execute("""
        SELECT COUNT(*) as total_attempts,
               COALESCE(AVG(percentage), 0) as avg_score,
               COALESCE(MAX(percentage), 0) as high_score
        FROM quiz_attempts
    """).fetchone()

    # Terms with Subjects
    terms = conn.execute("SELECT * FROM terms ORDER BY id ASC").fetchall()
    terms_list = []
    for t in terms:
        t_dict = dict(t)
        subjs = conn.execute("SELECT * FROM subjects WHERE term_id = ? ORDER BY id ASC", (t["id"],)).fetchall()
        t_dict["subjects"] = [dict(s) for s in subjs]
        t_dict["subject_count"] = len(subjs)
        terms_list.append(t_dict)

    conn.close()

    return {
        "metrics": {
            "total_subjects": total_subjects,
            "total_materials": total_materials,
            "total_notes": total_notes,
            "total_quizzes": total_quizzes,
            "overdue_assignments": overdue_count,
            "quiz_attempts": quiz_stats["total_attempts"],
            "quiz_avg_score": round(quiz_stats["avg_score"], 1),
            "quiz_high_score": round(quiz_stats["high_score"], 1)
        },
        "upcoming_assignments": [dict(r) for r in upcoming_assignments],
        "recent_materials": [dict(r) for r in recent_materials],
        "recent_notes": [dict(r) for r in recent_notes],
        "recent_quizzes": [dict(r) for r in recent_quizzes],
        "terms": terms_list
    }


# =========================================================================
# Terms Endpoints
# =========================================================================

@app.get("/api/terms")
async def list_terms():
    conn = get_db()
    terms = conn.execute("SELECT * FROM terms ORDER BY id ASC").fetchall()
    res = []
    for t in terms:
        t_dict = dict(t)
        count = conn.execute("SELECT COUNT(*) as c FROM subjects WHERE term_id = ?", (t["id"],)).fetchone()["c"]
        t_dict["subject_count"] = count
        res.append(t_dict)
    conn.close()
    return res


@app.post("/api/terms")
async def create_term(data: TermCreate):
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO terms (name, academic_year, is_active, created_at) VALUES (?, ?, ?, ?)",
        (data.name, data.academic_year, data.is_active, now)
    )
    conn.commit()
    term_id = cursor.lastrowid
    new_term = conn.execute("SELECT * FROM terms WHERE id = ?", (term_id,)).fetchone()
    conn.close()
    return dict(new_term)


@app.put("/api/terms/{term_id}")
async def update_term(term_id: int, data: TermUpdate):
    conn = get_db()
    existing = conn.execute("SELECT * FROM terms WHERE id = ?", (term_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Term not found")

    name = data.name if data.name is not None else existing["name"]
    year = data.academic_year if data.academic_year is not None else existing["academic_year"]
    active = data.is_active if data.is_active is not None else existing["is_active"]

    conn.execute(
        "UPDATE terms SET name = ?, academic_year = ?, is_active = ? WHERE id = ?",
        (name, year, active, term_id)
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM terms WHERE id = ?", (term_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/terms/{term_id}")
async def delete_term(term_id: int):
    conn = get_db()
    conn.execute("DELETE FROM terms WHERE id = ?", (term_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Term {term_id} deleted."}


# =========================================================================
# Subjects Endpoints
# =========================================================================

@app.get("/api/subjects")
async def list_subjects(term_id: Optional[int] = None):
    conn = get_db()
    if term_id:
        rows = conn.execute("SELECT s.*, t.name as term_name FROM subjects s JOIN terms t ON s.term_id = t.id WHERE s.term_id = ? ORDER BY s.id ASC", (term_id,)).fetchall()
    else:
        rows = conn.execute("SELECT s.*, t.name as term_name FROM subjects s JOIN terms t ON s.term_id = t.id ORDER BY s.term_id ASC, s.id ASC").fetchall()

    results = []
    for s in rows:
        d = dict(s)
        sid = s["id"]
        d["materials_count"] = conn.execute("SELECT COUNT(*) as c FROM materials WHERE subject_id = ?", (sid,)).fetchone()["c"]
        d["notes_count"] = conn.execute("SELECT COUNT(*) as c FROM notes WHERE subject_id = ?", (sid,)).fetchone()["c"]
        d["quizzes_count"] = conn.execute("SELECT COUNT(*) as c FROM quizzes WHERE subject_id = ?", (sid,)).fetchone()["c"]
        d["assignments_count"] = conn.execute("SELECT COUNT(*) as c FROM assignments WHERE subject_id = ? AND status != 'Completed'", (sid,)).fetchone()["c"]
        results.append(d)
    conn.close()
    return results


@app.get("/api/subjects/{subject_id}")
async def get_subject_workspace(subject_id: int):
    conn = get_db()
    subj = conn.execute("SELECT s.*, t.name as term_name FROM subjects s JOIN terms t ON s.term_id = t.id WHERE s.id = ?", (subject_id,)).fetchone()
    if not subj:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    subj_dict = dict(subj)
    materials = conn.execute("SELECT * FROM materials WHERE subject_id = ? ORDER BY id DESC", (subject_id,)).fetchall()
    notes = conn.execute("SELECT * FROM notes WHERE subject_id = ? ORDER BY id DESC", (subject_id,)).fetchall()
    quizzes = conn.execute("SELECT * FROM quizzes WHERE subject_id = ? ORDER BY id DESC", (subject_id,)).fetchall()
    assignments = conn.execute("SELECT * FROM assignments WHERE subject_id = ? ORDER BY due_date ASC", (subject_id,)).fetchall()

    subj_dict["materials"] = [dict(m) for m in materials]
    subj_dict["notes"] = [dict(n) for n in notes]
    subj_dict["quizzes"] = [dict(q) for q in quizzes]
    subj_dict["assignments"] = [dict(a) for a in assignments]

    conn.close()
    return subj_dict


@app.post("/api/subjects")
async def create_subject(data: SubjectCreate):
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO subjects (term_id, name, code, instructor, credits, color, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (data.term_id, data.name, data.code, data.instructor, data.credits, data.color, data.description, now))
    conn.commit()
    sid = cursor.lastrowid
    new_sub = conn.execute("SELECT * FROM subjects WHERE id = ?", (sid,)).fetchone()
    conn.close()
    return dict(new_sub)


@app.put("/api/subjects/{subject_id}")
async def update_subject(subject_id: int, data: SubjectUpdate):
    conn = get_db()
    existing = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    term_id = data.term_id if data.term_id is not None else existing["term_id"]
    name = data.name if data.name is not None else existing["name"]
    code = data.code if data.code is not None else existing["code"]
    instructor = data.instructor if data.instructor is not None else existing["instructor"]
    credits = data.credits if data.credits is not None else existing["credits"]
    color = data.color if data.color is not None else existing["color"]
    description = data.description if data.description is not None else existing["description"]

    conn.execute("""
        UPDATE subjects
        SET term_id = ?, name = ?, code = ?, instructor = ?, credits = ?, color = ?, description = ?
        WHERE id = ?
    """, (term_id, name, code, instructor, credits, color, description, subject_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/subjects/{subject_id}")
async def delete_subject(subject_id: int):
    conn = get_db()
    conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Subject {subject_id} deleted."}


# =========================================================================
# Study Materials & File Uploads Endpoints
# =========================================================================

@app.get("/api/materials")
async def list_materials(subject_id: Optional[int] = None, q: Optional[str] = None):
    conn = get_db()
    query = """
        SELECT m.*, s.name as subject_name, s.color as subject_color, t.name as term_name
        FROM materials m
        JOIN subjects s ON m.subject_id = s.id
        JOIN terms t ON s.term_id = t.id
        WHERE 1=1
    """
    params = []
    if subject_id:
        query += " AND m.subject_id = ?"
        params.append(subject_id)
    if q:
        query += " AND (m.title LIKE ? OR m.file_name LIKE ? OR m.description LIKE ?)"
        term = f"%{q}%"
        params.extend([term, term, term])

    query += " ORDER BY m.id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/subjects/{subject_id}/materials/upload")
async def upload_materials(
    subject_id: int,
    files: List[UploadFile] = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form("")
):
    conn = get_db()
    subj = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if not subj:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    saved_materials = []
    now = datetime.now(timezone.utc).isoformat()

    for file in files:
        safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename.replace(' ', '_')}"
        dest_path = UPLOADS_DIR / safe_name

        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(dest_path)
        file_ext = dest_path.suffix.lower()

        # Extract Text
        extraction = extract_text_from_file(str(dest_path))
        extracted_text = extraction.get("text", "")

        material_title = title if (title and len(files) == 1) else file.filename

        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO materials (subject_id, title, description, file_path, file_name, file_size, file_type, extracted_text, upload_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            subject_id,
            material_title,
            description or f"Uploaded {file_ext.upper()} document ({extraction.get('word_count', 0)} words extracted)",
            str(dest_path),
            file.filename,
            file_size,
            file_ext.replace(".", "").upper(),
            extracted_text,
            now
        ))
        conn.commit()
        mid = cursor.lastrowid
        m_row = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
        saved_materials.append(dict(m_row))

    conn.close()
    return {"success": True, "count": len(saved_materials), "materials": saved_materials}


@app.post("/api/subjects/{subject_id}/materials/manual")
async def add_manual_material(subject_id: int, data: ManualMaterialCreate):
    conn = get_db()
    subj = conn.execute("SELECT * FROM subjects WHERE id = ?", (subject_id,)).fetchone()
    if not subj:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    now = datetime.now(timezone.utc).isoformat()
    # Save text as a .txt file in uploads
    safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_notes.txt"
    dest_path = UPLOADS_DIR / safe_name
    dest_path.write_text(data.content, encoding="utf-8")

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO materials (subject_id, title, description, file_path, file_name, file_size, file_type, extracted_text, upload_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        subject_id,
        data.title,
        data.description or "Directly entered study notes",
        str(dest_path),
        safe_name,
        len(data.content.encode("utf-8")),
        "TXT",
        data.content,
        now
    ))
    conn.commit()
    mid = cursor.lastrowid
    m_row = conn.execute("SELECT * FROM materials WHERE id = ?", (mid,)).fetchone()
    conn.close()
    return dict(m_row)


@app.get("/api/materials/{material_id}/download")
async def download_material(material_id: int):
    conn = get_db()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    conn.close()
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")

    path = Path(mat["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Physical file missing on server")

    return FileResponse(
        path=str(path),
        filename=mat["file_name"],
        media_type="application/octet-stream"
    )


@app.delete("/api/materials/{material_id}")
async def delete_material(material_id: int):
    conn = get_db()
    mat = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if mat and mat["file_path"]:
        try:
            p = Path(mat["file_path"])
            if p.exists():
                p.unlink()
        except Exception:
            pass

    conn.execute("DELETE FROM materials WHERE id = ?", (material_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Material deleted."}


# =========================================================================
# AI Revision Notes Endpoints
# =========================================================================

@app.get("/api/notes")
async def list_notes(subject_id: Optional[int] = None, material_id: Optional[int] = None):
    conn = get_db()
    query = """
        SELECT n.*, s.name as subject_name, s.color as subject_color, m.file_name as material_file_name
        FROM notes n
        JOIN subjects s ON n.subject_id = s.id
        LEFT JOIN materials m ON n.material_id = m.id
        WHERE 1=1
    """
    params = []
    if subject_id:
        query += " AND n.subject_id = ?"
        params.append(subject_id)
    if material_id:
        query += " AND n.material_id = ?"
        params.append(material_id)

    query += " ORDER BY n.id DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/notes/{note_id}")
async def get_note(note_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT n.*, s.name as subject_name, s.color as subject_color, m.file_name as material_file_name, m.extracted_text as original_text
        FROM notes n
        JOIN subjects s ON n.subject_id = s.id
        LEFT JOIN materials m ON n.material_id = m.id
        WHERE n.id = ?
    """, (note_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    return dict(row)


@app.post("/api/notes/generate")
async def generate_notes_api(req: GenerateNotesRequest):
    conn = get_db()
    subject = conn.execute("SELECT * FROM subjects WHERE id = ?", (req.subject_id,)).fetchone()
    if not subject:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    text_to_process = ""
    topic_title = req.custom_title or subject["name"]

    if req.material_id:
        mat = conn.execute("SELECT * FROM materials WHERE id = ?", (req.material_id,)).fetchone()
        if mat:
            text_to_process = mat["extracted_text"] or ""
            topic_title = req.custom_title or mat["title"]
    elif req.raw_text:
        text_to_process = req.raw_text
    else:
        # If no material specified, aggregate all materials of this subject
        all_mats = conn.execute("SELECT extracted_text FROM materials WHERE subject_id = ?", (req.subject_id,)).fetchall()
        text_to_process = "\n\n".join([m["extracted_text"] for m in all_mats if m["extracted_text"]])

    settings = get_current_settings()

    ai_result = await generate_short_notes(
        document_text=text_to_process,
        topic_title=topic_title,
        settings=settings
    )

    if not ai_result.get("success"):
        conn.close()
        raise HTTPException(status_code=400, detail=ai_result.get("error", "Failed to generate notes."))

    now = datetime.now(timezone.utc).isoformat()
    note_title = f"AI Revision Notes: {topic_title}"

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notes (subject_id, material_id, title, content_markdown, is_ai_generated, is_edited, summary_tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
    """, (
        req.subject_id,
        req.material_id,
        note_title,
        ai_result["markdown"],
        json.dumps([subject["name"], "Revision", ai_result.get("provider", "AI")]),
        now,
        now
    ))
    conn.commit()
    new_note_id = cursor.lastrowid
    note_row = conn.execute("SELECT * FROM notes WHERE id = ?", (new_note_id,)).fetchone()
    conn.close()

    res = dict(note_row)
    res["ai_provider"] = ai_result.get("provider")
    return res


@app.post("/api/notes")
async def create_manual_note(data: NoteCreate):
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notes (subject_id, material_id, title, content_markdown, is_ai_generated, is_edited, summary_tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)
    """, (data.subject_id, data.material_id, data.title, data.content_markdown, json.dumps(data.summary_tags or []), now, now))
    conn.commit()
    nid = cursor.lastrowid
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (nid,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/notes/{note_id}")
async def update_note(note_id: int, data: NoteUpdate):
    conn = get_db()
    existing = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Note not found")

    title = data.title if data.title is not None else existing["title"]
    content = data.content_markdown if data.content_markdown is not None else existing["content_markdown"]
    tags = json.dumps(data.summary_tags) if data.summary_tags is not None else existing["summary_tags"]
    now = datetime.now(timezone.utc).isoformat()

    conn.execute("""
        UPDATE notes
        SET title = ?, content_markdown = ?, summary_tags = ?, is_edited = 1, updated_at = ?
        WHERE id = ?
    """, (title, content, tags, now, note_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: int):
    conn = get_db()
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Note deleted."}


# =========================================================================
# AI Quizzes Endpoints
# =========================================================================

@app.get("/api/quizzes")
async def list_quizzes(subject_id: Optional[int] = None):
    conn = get_db()
    query = """
        SELECT q.*, s.name as subject_name, s.color as subject_color,
               (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) as attempts_count,
               (SELECT MAX(percentage) FROM quiz_attempts qa WHERE qa.quiz_id = q.id) as best_score
        FROM quizzes q
        JOIN subjects s ON q.subject_id = s.id
        WHERE 1=1
    """
    params = []
    if subject_id:
        query += " AND q.subject_id = ?"
        params.append(subject_id)
    query += " ORDER BY q.id DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/quizzes/{quiz_id}")
async def get_quiz(quiz_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT q.*, s.name as subject_name, s.color as subject_color
        FROM quizzes q
        JOIN subjects s ON q.subject_id = s.id
        WHERE q.id = ?
    """, (quiz_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found")

    d = dict(row)
    try:
        d["questions"] = json.loads(d["questions_json"])
    except Exception:
        d["questions"] = []

    attempts = conn.execute("""
        SELECT * FROM quiz_attempts WHERE quiz_id = ? ORDER BY id DESC
    """, (quiz_id,)).fetchall()
    d["attempts"] = [dict(a) for a in attempts]

    conn.close()
    return d


@app.post("/api/quizzes/generate")
async def generate_quiz_api(req: GenerateQuizRequest):
    conn = get_db()
    subject = conn.execute("SELECT * FROM subjects WHERE id = ?", (req.subject_id,)).fetchone()
    if not subject:
        conn.close()
        raise HTTPException(status_code=404, detail="Subject not found")

    text_to_process = ""
    topic_title = subject["name"]

    if req.material_id:
        mat = conn.execute("SELECT * FROM materials WHERE id = ?", (req.material_id,)).fetchone()
        if mat:
            text_to_process = mat["extracted_text"] or ""
            topic_title = mat["title"]
    else:
        # Aggregated materials or subject notes
        mats = conn.execute("SELECT extracted_text FROM materials WHERE subject_id = ?", (req.subject_id,)).fetchall()
        text_to_process = "\n\n".join([m["extracted_text"] for m in mats if m["extracted_text"]])
        if not text_to_process:
            notes = conn.execute("SELECT content_markdown FROM notes WHERE subject_id = ?", (req.subject_id,)).fetchall()
            text_to_process = "\n\n".join([n["content_markdown"] for n in notes if n["content_markdown"]])

    settings = get_current_settings()

    ai_result = await generate_quiz(
        document_text=text_to_process,
        topic_title=topic_title,
        num_questions=req.num_questions or 10,
        difficulty=req.difficulty or "Medium",
        question_types=req.question_types or "Mixed",
        settings=settings
    )

    if not ai_result.get("success") or not ai_result.get("questions"):
        conn.close()
        raise HTTPException(status_code=400, detail=ai_result.get("error", "Could not generate questions."))

    questions = ai_result["questions"]
    now = datetime.now(timezone.utc).isoformat()
    quiz_title = f"{topic_title} — {req.difficulty} Quiz ({len(questions)} Questions)"

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO quizzes (subject_id, material_id, title, num_questions, difficulty, question_types, questions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req.subject_id,
        req.material_id,
        quiz_title,
        len(questions),
        req.difficulty,
        req.question_types,
        json.dumps(questions),
        now
    ))
    conn.commit()
    new_qid = cursor.lastrowid
    q_row = conn.execute("SELECT * FROM quizzes WHERE id = ?", (new_qid,)).fetchone()
    conn.close()

    res = dict(q_row)
    res["questions"] = questions
    res["ai_provider"] = ai_result.get("provider")
    return res


@app.post("/api/quizzes/{quiz_id}/attempt")
async def submit_quiz_attempt(quiz_id: int, submission: QuizAttemptSubmit):
    conn = get_db()
    quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
    if not quiz:
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = json.loads(quiz["questions_json"])
    score = 0
    total = len(questions)
    breakdown = []

    for q in questions:
        qid_str = str(q["id"])
        user_answer = submission.answers.get(qid_str)
        is_correct = (user_answer == q["correct_answer"])
        if is_correct:
            score += 1
        breakdown.append({
            "id": q["id"],
            "question": q["question"],
            "options": q.get("options", []),
            "selected_answer": user_answer,
            "correct_answer": q["correct_answer"],
            "is_correct": is_correct,
            "explanation": q.get("explanation", "")
        })

    percentage = round((score / total) * 100, 1) if total > 0 else 0
    now = datetime.now(timezone.utc).isoformat()

    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO quiz_attempts (quiz_id, score, total_questions, percentage, answers_json, time_spent_seconds, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (quiz_id, score, total, percentage, json.dumps(breakdown), submission.time_spent_seconds or 0, now))
    conn.commit()
    attempt_id = cursor.lastrowid
    conn.close()

    return {
        "attempt_id": attempt_id,
        "quiz_id": quiz_id,
        "score": score,
        "total_questions": total,
        "percentage": percentage,
        "breakdown": breakdown,
        "time_spent_seconds": submission.time_spent_seconds or 0,
        "completed_at": now
    }


@app.get("/api/quiz-attempts/all")
async def list_all_quiz_attempts():
    conn = get_db()
    rows = conn.execute("""
        SELECT qa.*, q.title as quiz_title, s.name as subject_name, s.color as subject_color
        FROM quiz_attempts qa
        JOIN quizzes q ON qa.quiz_id = q.id
        JOIN subjects s ON q.subject_id = s.id
        ORDER BY qa.id DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.delete("/api/quizzes/{quiz_id}")
async def delete_quiz(quiz_id: int):
    conn = get_db()
    conn.execute("DELETE FROM quizzes WHERE id = ?", (quiz_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Quiz deleted."}


# =========================================================================
# Assignment Tracker Endpoints
# =========================================================================

@app.get("/api/assignments")
async def list_assignments(
    term_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    status: Optional[str] = None
):
    conn = get_db()
    query = """
        SELECT a.*, s.name as subject_name, s.color as subject_color, t.name as term_name
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        JOIN terms t ON a.term_id = t.id
        WHERE 1=1
    """
    params = []
    if term_id:
        query += " AND a.term_id = ?"
        params.append(term_id)
    if subject_id:
        query += " AND a.subject_id = ?"
        params.append(subject_id)
    if status:
        query += " AND a.status = ?"
        params.append(status)

    query += " ORDER BY a.due_date ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/assignments")
async def create_assignment(data: AssignmentCreate):
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO assignments (term_id, subject_id, title, description, due_date, priority, status, reminder_datetime, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (data.term_id, data.subject_id, data.title, data.description or "", data.due_date, data.priority or "Medium", data.status or "Pending", data.reminder_datetime or "", now))
    conn.commit()
    aid = cursor.lastrowid
    row = conn.execute("""
        SELECT a.*, s.name as subject_name, s.color as subject_color, t.name as term_name
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        JOIN terms t ON a.term_id = t.id
        WHERE a.id = ?
    """, (aid,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/assignments/{assignment_id}")
async def update_assignment(assignment_id: int, data: AssignmentUpdate):
    conn = get_db()
    existing = conn.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Assignment not found")

    term_id = data.term_id if data.term_id is not None else existing["term_id"]
    subject_id = data.subject_id if data.subject_id is not None else existing["subject_id"]
    title = data.title if data.title is not None else existing["title"]
    description = data.description if data.description is not None else existing["description"]
    due_date = data.due_date if data.due_date is not None else existing["due_date"]
    priority = data.priority if data.priority is not None else existing["priority"]
    status = data.status if data.status is not None else existing["status"]
    reminder = data.reminder_datetime if data.reminder_datetime is not None else existing["reminder_datetime"]

    conn.execute("""
        UPDATE assignments
        SET term_id = ?, subject_id = ?, title = ?, description = ?, due_date = ?, priority = ?, status = ?, reminder_datetime = ?
        WHERE id = ?
    """, (term_id, subject_id, title, description, due_date, priority, status, reminder, assignment_id))
    conn.commit()

    updated = conn.execute("""
        SELECT a.*, s.name as subject_name, s.color as subject_color, t.name as term_name
        FROM assignments a
        JOIN subjects s ON a.subject_id = s.id
        JOIN terms t ON a.term_id = t.id
        WHERE a.id = ?
    """, (assignment_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.patch("/api/assignments/{assignment_id}/toggle-status")
async def toggle_assignment_status(assignment_id: int):
    conn = get_db()
    existing = conn.execute("SELECT status FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Assignment not found")

    new_status = "Completed" if existing["status"] != "Completed" else "Pending"
    conn.execute("UPDATE assignments SET status = ? WHERE id = ?", (new_status, assignment_id))
    conn.commit()
    conn.close()
    return {"id": assignment_id, "status": new_status}


@app.delete("/api/assignments/{assignment_id}")
async def delete_assignment(assignment_id: int):
    conn = get_db()
    conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Assignment deleted."}


# =========================================================================
# Settings Endpoints
# =========================================================================

@app.get("/api/settings")
async def get_settings():
    return get_current_settings()


@app.post("/api/settings")
async def update_settings(data: SettingsUpdate):
    conn = get_db()
    cursor = conn.cursor()
    for k, v in data.settings.items():
        cursor.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", (k, str(v), str(v)))
    conn.commit()
    conn.close()
    return {"success": True, "settings": get_current_settings()}


@app.post("/api/settings/test-key")
async def test_key_endpoint(data: TestKeyRequest):
    result = await test_llm_connection(
        provider=data.provider,
        api_key=data.api_key,
        model=data.model
    )
    return result
