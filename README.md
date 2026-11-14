# HSB Learn — AI-Powered MBA Learning Management System
**Dedicated Academic Workspace & AI Study Assistant for MBA Product Management**  
*Hari Shankar Singhania School of Business (HSB)*

---

## 🌟 Executive Overview
**HSB Learn** is a modern, fully functional, AI-powered personal Learning Management System (LMS) specifically architected for MBA students. It merges the clean aesthetic and flexibility of **Notion**, the structured rigor of a **Modern University LMS**, and the active recall superpowers of an **AI Study Companion**.

---

## 🚀 Key Modules & Capabilities

### 1. Central Academic Dashboard
- **Academic Metrics**: Live tracking of total MBA subjects, uploaded study materials, active revision notes, and pending deliverables.
- **Urgent Deadlines Tracker**: Highlights assignments due soon with automatic countdown badges (`Due in 2 days`, `Overdue`, etc.).
- **Quick Term & Course Access**: Jump directly into any subject workspace with one click.
- **Recent Revision Notes & Quizzes**: Quick review of recently synthesized materials and performance trends.

### 2. Term-wise Academic Organisation
- Multi-term management (Term 1, Term 2, Term 3, etc.).
- Create, edit, and delete terms with academic year tagging.
- Dedicated subject creation with custom subject codes (e.g. `PM101`, `MKT102`), instructor details, credit units, and theme accents.
- Pre-seeded with authentic MBA Product Management coursework:
  - *Product Management*
  - *Marketing Management*
  - *Business Statistics*
  - *Financial Management*
  - *Organisational Behaviour*
  - *Business Communication*

### 3. Subject Dedicated Workspace
- Dedicated hub for each course.
- **Document Management**:
  - Drag-and-drop file upload for **PDF**, **DOCX**, **PPTX**, and **TXT** files.
  - Multi-file batch upload support.
  - Manual note and lecture transcript input.
  - Built-in text extraction viewer to inspect exact parsed content.
  - Direct file download and management.

### 4. AI-Powered Short Notes Generator
- **Grounded Document Summarisation**: AI reads the extracted text and synthesizes structured, high-yield MBA revision notes:
  - Executive Summary & Core Objectives
  - Core Frameworks, Theories & Models (Double Diamond, RICE, Kano, AARRR, SWOT, etc.)
  - Key MBA Definitions with highlight formatting
  - Strategic Takeaways & Managerial Implications
  - 5-Minute Pre-Exam Flash Checklist
- **Interactive Reader & Split-View Editor**:
  - Full-screen Markdown reader with KaTeX LaTeX formula support ($\text{RICE} = \frac{R \times I \times C}{E}$).
  - Split-view toggle showing the original source document alongside the generated notes.
  - In-app editor to customize and polish notes.
  - **Export to PDF**: One-click formatted PDF revision sheet download.

### 5. AI Quiz Centre & Interactive Quiz Runner
- **Customizable Quiz Engine**:
  - Question count: 5, 10, 15, or 20 questions.
  - Difficulty levels: Easy (Foundations), Medium (Standard MBA), Hard (Case & Frameworks).
  - Question types: MCQs, True/False, and Concept-based questions.
- **Interactive Quiz Runner**:
  - Clean 1-question-at-a-time focus interface with animated progress bar and timer.
  - Instant submission and scoring.
  - Celebration confetti on scores $\ge 70\%$.
- **Detailed Explanation Breakdown**:
  - Question-by-question review with green/red status.
  - Your Answer vs. Correct Answer comparison.
  - Authoritative source rationale explaining why the answer is correct based on the uploaded notes.
  - Retake quiz anytime; all past attempts are persistently saved in the database.

### 6. Assignment & Deadline Tracker
- Add deadlines with subject, title, due date & time, priority (High, Medium, Low), and custom reminder times.
- Real-time status toggling (Pending $\leftrightarrow$ Completed) with strike-through styling.
- Categorized tabs: All, Pending, Completed, Overdue.
- Browser notification integration for timely submission alerts.

### 7. AI Intelligence & Model Support
- **Dual-Mode Intelligence**:
  - **Google Gemini REST API**: Supports `gemini-2.5-flash`, `gemini-1.5-flash`, etc. Simply add your API key in Settings or `.env`.
  - **Built-in MBA Academic Heuristic Engine**: Works 100% offline out-of-the-box even without an external API key!
  - **OpenAI / OpenRouter Compatible**: Configure custom models or local LM Studio endpoints.
  - Live "Test Connection" tool in Settings.

---

## 🛠️ Quick Start & Running the LMS

### Option 1: Double-Click Startup
Double-click `start_hsb_learn.bat` in this folder:
```
c:\Users\hp\OneDrive\Desktop\Mobile App PM\start_hsb_learn.bat
```
This automatically starts the server and opens `http://127.0.0.1:8000` in your default web browser.

### Option 2: Command Line Startup
```bash
python run_hsb_learn.py
```
Open your browser at:
```
http://127.0.0.1:8000
```

---

## 📁 Project Architecture
```
Mobile App PM/
├── hsb_learn/
│   ├── app.py              # FastAPI application server & REST APIs
│   ├── db.py               # SQLite persistent database schema & seed data
│   ├── parsers.py          # Document text extractors (PDF, DOCX, PPTX, TXT)
│   ├── ai_service.py       # Gemini API, OpenAI API, and built-in MBA engine
│   ├── data/
│   │   ├── hsb_learn.db    # Persistent SQLite database file
│   │   └── uploads/        # Uploaded course documents
│   └── static/
│       ├── index.html      # Modern SPA frontend (Notion-LMS aesthetic)
│       ├── css/style.css   # Typography, Markdown styles, KaTeX, Print layout
│       └── js/app.js       # SPA router, state manager, quiz runner, PDF exporter
├── run_hsb_learn.py        # Python launcher script with auto-browser opener
├── start_hsb_learn.bat     # Windows one-click batch launcher
├── .env.example            # Environment variables template
└── README.md               # Complete platform documentation
```

---

## 🎓 Verified with Real MBA Course Materials
The application has been verified using real Product Management course documents (`PROTOMANIA_Product_Strategy_and_PRD.docx`), accurately extracting over 1,900 words, synthesizing high-yield revision notes, and generating interactive 5-question quizzes with full answer keys and explanations!
