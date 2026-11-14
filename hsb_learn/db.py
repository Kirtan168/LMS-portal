"""
HSB Learn - Database & Storage Module
SQLite persistent database for MBA Product Management LMS
"""

import sqlite3
import os
import json
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "hsb_learn.db"
UPLOADS_DIR = DATA_DIR / "uploads"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Terms table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        academic_year TEXT DEFAULT '2026-2027',
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # Subjects table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT DEFAULT '',
        instructor TEXT DEFAULT '',
        credits INTEGER DEFAULT 3,
        color TEXT DEFAULT 'indigo',
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
    )
    """)

    # Study Materials table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        file_type TEXT NOT NULL,
        extracted_text TEXT DEFAULT '',
        upload_date TEXT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
    """)

    # Revision Notes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        material_id INTEGER,
        title TEXT NOT NULL,
        content_markdown TEXT NOT NULL,
        is_ai_generated INTEGER DEFAULT 1,
        is_edited INTEGER DEFAULT 0,
        summary_tags TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
    )
    """)

    # Quizzes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_id INTEGER NOT NULL,
        material_id INTEGER,
        title TEXT NOT NULL,
        num_questions INTEGER DEFAULT 10,
        difficulty TEXT DEFAULT 'Medium',
        question_types TEXT DEFAULT 'MCQ',
        questions_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
        FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
    )
    """)

    # Quiz Attempts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        percentage REAL NOT NULL,
        answers_json TEXT NOT NULL,
        time_spent_seconds INTEGER DEFAULT 0,
        completed_at TEXT NOT NULL,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
    """)

    # Assignments table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term_id INTEGER NOT NULL,
        subject_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        due_date TEXT NOT NULL,
        priority TEXT DEFAULT 'Medium',
        status TEXT DEFAULT 'Pending',
        reminder_datetime TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    )
    """)

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)

    # Check if default terms exist, if not seed initial MBA courses
    cursor.execute("SELECT COUNT(*) as count FROM terms")
    if cursor.fetchone()["count"] == 0:
        seed_initial_data(cursor)

    # Initialize default settings if missing
    default_settings = {
        "student_name": "",
        "roll_number": "",
        "program_name": "MBA in Product Management",
        "institution": "Hari Shankar Singhania School of Business (HSB)",
        "has_onboarded": "0",
        "academic_year": "2026-2027",
        "ai_provider": "gemini",
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "gemini_model": "gemini-2.5-flash",
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "openai_model": "gpt-4o-mini",
        "active_theme": "light"
    }

    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, str(val)))

    conn.commit()
    conn.close()


def seed_initial_data(cursor):
    now = datetime.now(timezone.utc).isoformat()

    # Term 1
    cursor.execute(
        "INSERT INTO terms (name, academic_year, is_active, created_at) VALUES (?, ?, ?, ?)",
        ("Term 1", "2026-2027", 1, now)
    )
    term1_id = cursor.lastrowid

    # Term 2
    cursor.execute(
        "INSERT INTO terms (name, academic_year, is_active, created_at) VALUES (?, ?, ?, ?)",
        ("Term 2", "2026-2027", 0, now)
    )
    term2_id = cursor.lastrowid

    # Term 3
    cursor.execute(
        "INSERT INTO terms (name, academic_year, is_active, created_at) VALUES (?, ?, ?, ?)",
        ("Term 3", "2026-2027", 0, now)
    )
    term3_id = cursor.lastrowid

    # Term 4
    cursor.execute(
        "INSERT INTO terms (name, academic_year, is_active, created_at) VALUES (?, ?, ?, ?)",
        ("Term 4", "2026-2027", 0, now)
    )
    term4_id = cursor.lastrowid

    # Subjects for Term 1
    t1_subjects = [
        ("Product Management", "PM101", "Prof. R. Sharma", 4, "indigo", "Core MBA PM course covering product discovery, PRDs, roadmap prioritization, and metrics."),
        ("Marketing Management", "MKT102", "Dr. A. Verma", 3, "emerald", "Foundations of customer acquisition, segmentation, 4Ps, positioning and growth."),
        ("Business Statistics", "STAT103", "Prof. K. Rao", 3, "blue", "Statistical inference, hypothesis testing, regression analysis, and quantitative decision making."),
        ("Financial Management", "FIN104", "Dr. S. Menon", 3, "amber", "Corporate valuation, capital budgeting, working capital, and unit economics for tech products."),
        ("Organisational Behaviour", "OB105", "Prof. P. Nair", 3, "purple", "Leadership, stakeholder management, cross-functional team dynamics, and agile culture."),
        ("Business Communication", "COMM106", "Dr. M. Roy", 2, "rose", "Executive presence, stakeholder persuasion, memos, pitches, and board reporting.")
    ]

    subject_ids = {}
    for name, code, instructor, credits, color, desc in t1_subjects:
        cursor.execute(
            """INSERT INTO subjects (term_id, name, code, instructor, credits, color, description, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (term1_id, name, code, instructor, credits, color, desc, now)
        )
        subject_ids[name] = cursor.lastrowid

    # Subjects for Term 2
    t2_subjects = [
        ("Product Strategy & Growth", "PM201", "Prof. R. Sharma", 4, "violet", "Advanced product teardowns, network effects, retention loops, and PLG."),
        ("Digital Marketing & Analytics", "MKT202", "Dr. A. Verma", 3, "teal", "CAC/LTV modeling, performance marketing, GA4, Mixpanel, and attribution."),
        ("Operations Management", "OPS203", "Prof. V. Iyer", 3, "sky", "Process optimization, lean manufacturing, supply chain, and scalability.")
    ]

    for name, code, instructor, credits, color, desc in t2_subjects:
        cursor.execute(
            """INSERT INTO subjects (term_id, name, code, instructor, credits, color, description, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (term2_id, name, code, instructor, credits, color, desc, now)
        )

    # Initial Assignment Deadlines
    assignments = [
        (term1_id, subject_ids["Product Management"], "Product Strategy & PRD Teardown", "Complete comprehensive PRD document teardown including RICE prioritization, persona mapping, and success metrics.", "2026-11-06T23:59:00", "High", "Pending"),
        (term1_id, subject_ids["Marketing Management"], "Customer Acquisition & 4Ps Analysis", "Draft a market segmentation and positioning strategy deck for a B2B SaaS startup.", "2026-11-10T18:00:00", "Medium", "Pending"),
        (term1_id, subject_ids["Business Statistics"], "A/B Test Hypothesis Simulation", "Perform paired sample t-test and calculate statistical significance on conversion data.", "2026-11-14T23:59:00", "Low", "Pending")
    ]

    for term_id, subj_id, title, desc, due, priority, status in assignments:
        cursor.execute(
            """INSERT INTO assignments (term_id, subject_id, title, description, due_date, priority, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (term_id, subj_id, title, desc, due, priority, status, now)
        )

    # Initial sample revision note for Product Management
    sample_notes = """# MBA Product Management — Core Frameworks & Revision Notes

> **Exam Focus**: Product Lifecycle (PLC), Prioritization Frameworks, Product Requirements Documentation (PRD), and Unit Economics.

---

## 1. Product Discovery & The Double Diamond Model
Product discovery answers the question: *Are we building the right thing?* before answering *Are we building the thing right?*

- **Discover (Diverge)**: User research, customer interviews, pain-point mining, observational studies.
- **Define (Converge)**: Problem statement formulation, persona synthesis, empathy mapping, Jobs-To-Be-Done (JTBD).
- **Develop (Diverge)**: Ideation, solution brainstorming, user journey mapping, low-fidelity wireframing.
- **Deliver (Converge)**: Prototyping, MVP scoping, agile user stories, acceptance criteria, engineering sprints.

---

## 2. Feature Prioritization Frameworks

### A. RICE Scoring Model
$$\\text{RICE Score} = \\frac{\\text{Reach} \\times \\text{Impact} \\times \\text{Confidence}}{\\text{Effort}}$$

| Factor | Definition | Scale / Unit |
|---|---|---|
| **Reach** | Customers impacted over a given timeframe | Absolute number (e.g., 5,000 users/month) |
| **Impact** | Lift per user towards the goal | 3 (Massive), 2 (High), 1 (Medium), 0.5 (Low), 0.25 (Minimal) |
| **Confidence** | Certainty level in your estimates | 100% (High data), 80% (Medium), 50% (Low / Gut feeling) |
| **Effort** | Person-months required by engineering/design | Person-months (e.g., 2 person-months) |

### B. Kano Model Classification
1. **Must-Haves (Basic / Expected)**: Absence causes extreme dissatisfaction; presence does not delight.
2. **Performance (Linear)**: Satisfaction increases proportionally with feature quality/speed.
3. **Delighters (Excitement)**: Unexpected features that create high NPS; absence does not cause anger.
4. **Indifferent**: Users do not care whether it exists or not.
5. **Reverse**: Causes dissatisfaction when present for specific cohorts.

---

## 3. Product Metrics & North Star Hierarchy
- **North Star Metric (NSM)**: The single metric that best captures the core value your product delivers to customers (e.g., Spotify: *Time Spent Listening*; Airbnb: *Nights Booked*; Slack: *Messages Sent*).
- **AARRR (Pirate Metrics)**:
  - **Acquisition**: Where are users coming from? (Organic, Paid, Referral)
  - **Activation**: Do users experience the 'Aha!' moment?
  - **Retention**: Are users returning day 7, day 30, day 90?
  - **Revenue**: LTV, ARPU, Monetization velocity.
  - **Referral**: Viral coefficient ($K$-factor $> 1.0$).

---

## 4. Key Exam Takeaways
1. A good PRD specifies **Problem**, **Target Persona**, **Hypothesis**, **Success Metrics**, and **Out-of-Scope items**—it never dictates the engineering implementation.
2. Retention is the true foundation of product growth; acquiring users into a leaky bucket destroys marketing ROI.
3. An MVP must be the smallest experiment that tests your riskiest assumption with real user behavior.
"""

    cursor.execute(
        """INSERT INTO notes (subject_id, title, content_markdown, is_ai_generated, is_edited, summary_tags, created_at, updated_at)
           VALUES (?, ?, ?, 1, 0, ?, ?, ?)""",
        (subject_ids["Product Management"], "Core PM Revision Notes: Discovery, RICE & Metrics", sample_notes, json.dumps(["Prioritization", "PRD", "RICE", "Kano", "AARRR"]), now, now)
    )
    sample_note_id = cursor.lastrowid

    # Initial sample quiz for Product Management
    sample_quiz_questions = [
        {
            "id": 1,
            "type": "MCQ",
            "question": "In the RICE prioritization framework, which element acts as the denominator?",
            "options": ["Risk", "Effort", "Cost", "Timeline"],
            "correct_answer": "Effort",
            "explanation": "RICE score is calculated as (Reach × Impact × Confidence) / Effort. Effort is the denominator representing the resources (like person-months) needed."
        },
        {
            "id": 2,
            "type": "True/False",
            "question": "According to the Kano Model, 'Must-Have' features generate high customer delight when executed well.",
            "options": ["True", "False"],
            "correct_answer": "False",
            "explanation": "Must-have features are baseline expectations. Their absence causes extreme dissatisfaction, but their presence merely brings customer satisfaction to neutral."
        },
        {
            "id": 3,
            "type": "MCQ",
            "question": "What is the primary purpose of identifying a North Star Metric (NSM)?",
            "options": [
                "To optimize short-term quarterly revenue",
                "To align the team around the core value delivered to customers",
                "To reduce cloud infrastructure expenses",
                "To measure developer pull request velocity"
            ],
            "correct_answer": "To align the team around the core value delivered to customers",
            "explanation": "A North Star Metric aligns the cross-functional team around the single key action that reflects authentic value delivered to the end user."
        },
        {
            "id": 4,
            "type": "Concept",
            "question": "Which phase of the Double Diamond framework emphasizes convergent thinking to define user problems and synthesize personas?",
            "options": ["Discover", "Define", "Develop", "Deliver"],
            "correct_answer": "Define",
            "explanation": "In the Double Diamond model, 'Define' is the first convergent phase where raw insights from the 'Discover' phase are distilled into actionable problem statements and personas."
        },
        {
            "id": 5,
            "type": "MCQ",
            "question": "Which of the following is an example of an 'Activation' metric in the AARRR Pirate Metrics framework?",
            "options": [
                "Cost Per Click (CPC) from LinkedIn Ads",
                "Percentage of users completing onboarding and creating their first project within 24 hours",
                "Monthly Recurring Revenue (MRR) per user",
                "Net Promoter Score (NPS) after 6 months"
            ],
            "correct_answer": "Percentage of users completing onboarding and creating their first project within 24 hours",
            "explanation": "Activation measures when a newly acquired user experiences their first 'Aha!' moment and completes the primary value setup."
        }
    ]

    cursor.execute(
        """INSERT INTO quizzes (subject_id, title, num_questions, difficulty, question_types, questions_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (subject_ids["Product Management"], "Product Management Fundamentals & Prioritization Quiz", 5, "Medium", "Mixed (MCQ, T/F, Concept)", json.dumps(sample_quiz_questions), now)
    )
