"""
HSB Learn - AI Service Module
Powers MBA Short Notes Generation & AI Quizzes
Supports Google Gemini REST API, OpenAI/Compatible REST API, and built-in MBA Academic Heuristic Engine
"""

import json
import os
import re
import random
import httpx
from datetime import datetime, timezone


SYSTEM_SHORT_NOTES_PROMPT = """You are an elite academic tutor and MBA Professor specializing in Product Management and Business Administration at Hari Shankar Singhania School of Business (HSB).

Your goal is to transform the provided lecture notes/study material into high-yield, structured, and exam-ready MBA Revision Notes.

GUIDELINES:
1. Strict Grounding: Base all notes STRICTLY on the provided source material. Do not fabricate concepts or hallucinate theories. If a concept is ambiguous in the text, explicitly state it.
2. Structure & Organization:
   - # [Subject/Topic] — Executive MBA Revision Notes
   - > **Core Exam Focus & Key Objectives**: 2-3 sentence overview highlighting why this topic matters for PMs/executives.
   - ## 1. Core Frameworks, Theories & Models: Break down all frameworks, models, matrixes, or workflows mentioned in the source with clear steps or dimensions.
   - ## 2. Essential Definitions & Key Concepts: Formal MBA definitions formatted with bold terms and concise explanations.
   - ## 3. Strategic Takeaways & Practical Business Implications: Concrete bullet points connecting theory to managerial decisions.
   - ## 4. Important Examples & Case Snippets: Real-world or hypothetical cases referenced in the document.
   - ## 5. High-Yield Exam Checklist: Quick flashcard-style bullet points for 5-minute pre-exam revision.
3. Formatting:
   - Use Markdown with headers (##, ###), bullet lists, and tables where comparative data or metrics exist.
   - Highlight definitions with blockquotes (>) or bold text.
   - Use LaTeX math syntax like $\\text{Metric} = \\frac{A}{B}$ for quantitative formulas if present.
"""

SYSTEM_QUIZ_PROMPT = """You are an expert MBA Examination Director and Product Management Professor.
Generate an academic quiz strictly derived from the provided study material.

CONFIGURATION:
- Number of questions: {num_questions}
- Target Difficulty: {difficulty}
- Allowed Question Types: {question_types}

REQUIREMENTS:
1. Strictly test concepts, frameworks, formulas, definitions, and applications present in the provided source material.
2. Provide realistic plausible distractors (options) for MCQs.
3. Every question must have:
   - id: integer starting from 1
   - type: one of "MCQ", "True/False", "Concept"
   - question: the question text
   - options: array of 4 choices for MCQ/Concept, or ["True", "False"] for True/False
   - correct_answer: exact string matching one of the options
   - explanation: clear, authoritative explanation referencing the source concepts

Return ONLY a valid JSON array of objects without Markdown code fence wrapping or with clean json wrapping:
[
  {{
    "id": 1,
    "type": "MCQ",
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "...",
    "explanation": "..."
  }}
]
"""


async def generate_short_notes(document_text: str, topic_title: str, settings: dict) -> dict:
    """
    Generates high-yield MBA revision notes from document text.
    """
    if not document_text or len(document_text.strip()) < 40:
        return {
            "success": False,
            "markdown": "",
            "provider": "none",
            "error": "Document text is too short or empty to generate meaningful revision notes."
        }

    provider = settings.get("ai_provider", "gemini")
    gemini_key = settings.get("gemini_api_key", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = settings.get("gemini_model", "gemini-2.5-flash").strip()
    openai_key = settings.get("openai_api_key", "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    openai_model = settings.get("openai_model", "gpt-4o-mini").strip()

    # Truncate source if extremely large to fit standard LLM context window safely
    max_chars = 45000
    clipped_text = document_text[:max_chars]
    if len(document_text) > max_chars:
        clipped_text += f"\n\n[... Remaining {len(document_text) - max_chars} characters omitted for length ...]"

    # 1. Try Gemini if configured
    if (provider == "gemini" or not openai_key) and gemini_key:
        try:
            res = await _call_gemini_api(
                api_key=gemini_key,
                model=gemini_model,
                system_prompt=SYSTEM_SHORT_NOTES_PROMPT,
                user_prompt=f"Document Title: {topic_title}\n\nStudy Material Content:\n{clipped_text}\n\nGenerate structured MBA Revision Notes."
            )
            if res.get("success"):
                return {
                    "success": True,
                    "markdown": res["text"],
                    "provider": f"Gemini ({gemini_model})",
                    "error": None
                }
        except Exception as e:
            # If Gemini fails, fallback to local MBA Heuristic
            print(f"[AI] Gemini API error: {e}")

    # 2. Try OpenAI / Compatible if configured
    if (provider == "openai" or not gemini_key) and openai_key:
        try:
            res = await _call_openai_api(
                api_key=openai_key,
                model=openai_model,
                system_prompt=SYSTEM_SHORT_NOTES_PROMPT,
                user_prompt=f"Document Title: {topic_title}\n\nStudy Material Content:\n{clipped_text}\n\nGenerate structured MBA Revision Notes."
            )
            if res.get("success"):
                return {
                    "success": True,
                    "markdown": res["text"],
                    "provider": f"OpenAI ({openai_model})",
                    "error": None
                }
        except Exception as e:
            print(f"[AI] OpenAI API error: {e}")

    # 3. Fallback to Built-in MBA Academic Heuristic Engine
    notes_md = _generate_heuristic_notes(document_text, topic_title)
    return {
        "success": True,
        "markdown": notes_md,
        "provider": "HSB Built-in MBA Academic Engine",
        "error": None
    }


async def generate_quiz(document_text: str, topic_title: str, num_questions: int, difficulty: str, question_types: str, settings: dict) -> dict:
    """
    Generates an MBA quiz derived from the document text.
    """
    if not document_text or len(document_text.strip()) < 40:
        return {
            "success": False,
            "questions": [],
            "provider": "none",
            "error": "Document text is too short to generate quiz questions."
        }

    provider = settings.get("ai_provider", "gemini")
    gemini_key = settings.get("gemini_api_key", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = settings.get("gemini_model", "gemini-2.5-flash").strip()
    openai_key = settings.get("openai_api_key", "").strip() or os.getenv("OPENAI_API_KEY", "").strip()
    openai_model = settings.get("openai_model", "gpt-4o-mini").strip()

    prompt_formatted = SYSTEM_QUIZ_PROMPT.format(
        num_questions=num_questions,
        difficulty=difficulty,
        question_types=question_types
    )

    max_chars = 35000
    clipped_text = document_text[:max_chars]

    # 1. Try Gemini
    if (provider == "gemini" or not openai_key) and gemini_key:
        try:
            res = await _call_gemini_api(
                api_key=gemini_key,
                model=gemini_model,
                system_prompt=prompt_formatted,
                user_prompt=f"Topic: {topic_title}\n\nStudy Notes Source:\n{clipped_text}\n\nGenerate exactly {num_questions} questions as valid JSON.",
                response_json=True
            )
            if res.get("success"):
                parsed = _parse_quiz_json(res["text"])
                if parsed and len(parsed) > 0:
                    return {
                        "success": True,
                        "questions": parsed[:num_questions],
                        "provider": f"Gemini ({gemini_model})",
                        "error": None
                    }
        except Exception as e:
            print(f"[AI] Gemini Quiz error: {e}")

    # 2. Try OpenAI
    if (provider == "openai" or not gemini_key) and openai_key:
        try:
            res = await _call_openai_api(
                api_key=openai_key,
                model=openai_model,
                system_prompt=prompt_formatted,
                user_prompt=f"Topic: {topic_title}\n\nStudy Notes Source:\n{clipped_text}\n\nGenerate exactly {num_questions} questions as valid JSON.",
                response_json=True
            )
            if res.get("success"):
                parsed = _parse_quiz_json(res["text"])
                if parsed and len(parsed) > 0:
                    return {
                        "success": True,
                        "questions": parsed[:num_questions],
                        "provider": f"OpenAI ({openai_model})",
                        "error": None
                    }
        except Exception as e:
            print(f"[AI] OpenAI Quiz error: {e}")

    # 3. Fallback to Built-in MBA Heuristic Quiz Generator
    questions = _generate_heuristic_quiz(document_text, topic_title, num_questions, difficulty, question_types)
    return {
        "success": True,
        "questions": questions,
        "provider": "HSB Built-in MBA Academic Engine",
        "error": None
    }


async def test_llm_connection(provider: str, api_key: str, model: str) -> dict:
    """
    Tests whether the supplied API key and model work.
    """
    if not api_key:
        return {"success": False, "message": "API key cannot be empty."}

    try:
        if provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": "Say 'HSB Learn AI Connected Successfully' in 5 words."}]}]
            }
            async with httpx.AsyncClient(timeout=12.0) as client:
                r = await client.post(url, json=payload)
                if r.status_code == 200:
                    data = r.json()
                    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    return {"success": True, "message": f"Connected! Model responded: '{text.strip()}'"}
                else:
                    return {"success": False, "message": f"Gemini Error ({r.status_code}): {r.text}"}

        elif provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}"}
            payload = {
                "model": model or "gpt-4o-mini",
                "messages": [{"role": "user", "content": "Say 'HSB Learn AI Connected Successfully'."}],
                "max_tokens": 20
            }
            async with httpx.AsyncClient(timeout=12.0) as client:
                r = await client.post(url, headers=headers, json=payload)
                if r.status_code == 200:
                    data = r.json()
                    text = data["choices"][0]["message"]["content"]
                    return {"success": True, "message": f"Connected! Model responded: '{text.strip()}'"}
                else:
                    return {"success": False, "message": f"OpenAI Error ({r.status_code}): {r.text}"}
        else:
            return {"success": False, "message": f"Unknown provider: {provider}"}
    except Exception as e:
        return {"success": False, "message": f"Connection exception: {str(e)}"}


async def _call_gemini_api(api_key: str, model: str, system_prompt: str, user_prompt: str, response_json: bool = False) -> dict:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.2 if response_json else 0.4,
            "maxOutputTokens": 4096
        }
    }
    if response_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, json=payload)
        if r.status_code != 200:
            raise Exception(f"Gemini API returned status {r.status_code}: {r.text}")
        data = r.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise Exception("No response candidate returned by Gemini.")
        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return {"success": True, "text": text}


async def _call_openai_api(api_key: str, model: str, system_prompt: str, user_prompt: str, response_json: bool = False) -> dict:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.2 if response_json else 0.4
    }
    if response_json:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, headers=headers, json=payload)
        if r.status_code != 200:
            raise Exception(f"OpenAI API returned status {r.status_code}: {r.text}")
        data = r.json()
        text = data["choices"][0]["message"]["content"]
        return {"success": True, "text": text}


def _parse_quiz_json(raw_text: str) -> list:
    cleaned = raw_text.strip()
    # Strip markdown code blocks if present
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            # Sometimes wrapped in {"questions": [...]}
            for key in ["questions", "quiz", "data", "items"]:
                if key in data and isinstance(data[key], list):
                    return data[key]
    except Exception:
        # Try regex extract
        match = re.search(r"\[\s*\{.*\}\s*\]", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
    return []


# =========================================================================
# Built-in MBA Academic Heuristic Synthesis Engine (Offline / Fallback)
# =========================================================================

def _generate_heuristic_notes(text: str, title: str) -> str:
    """
    Synthesizes rich, structured revision notes from raw document text
    using heuristic NLP extraction of definitions, frameworks, and core points.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 30]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 25 and not s.startswith("---")]

    # 1. Identify Frameworks & Methodologies
    framework_keywords = [
        "framework", "model", "matrix", "cycle", "methodology", "strategy",
        "rice", "kano", "swot", "porter", "aarrr", "okr", "kpi", "agile",
        "scrum", "sprint", "prd", "mvp", "persona", "jtbd", "funnel",
        "roadmap", "discovery", "prioritization", "flywheel", "unit economic"
    ]
    detected_frameworks = []
    for s in sentences:
        s_lower = s.lower()
        if any(kw in s_lower for kw in framework_keywords):
            if s not in detected_frameworks and len(s) < 220:
                detected_frameworks.append(s)

    # 2. Identify Definitions
    definition_patterns = [
        r"([A-Z][A-Za-z0-9\s-]{2,30})\s+(?:is defined as|refers to|means|represents|is the process of)\s+([^.]+)",
        r"([A-Z][A-Za-z0-9\s-]{2,30})\s*:\s*([^.\n]+)",
        r'"([^"]+)"\s+(?:is|refers to)\s+([^.]+)'
    ]
    definitions = []
    for p in paragraphs:
        for pat in definition_patterns:
            matches = re.findall(pat, p)
            for term, defn in matches:
                term = term.strip()
                defn = defn.strip()
                if 2 < len(term) < 40 and len(defn) > 15:
                    definitions.append((term, defn))

    # Deduplicate definitions
    unique_defs = {}
    for term, defn in definitions:
        if term.lower() not in unique_defs:
            unique_defs[term.lower()] = (term, defn)
    selected_defs = list(unique_defs.values())[:8]

    # 3. Identify Key Takeaways / Rules / Principles
    takeaway_keywords = ["must", "critical", "essential", "key", "important", "primary", "vital", "principle", "objective", "metric", "goal"]
    key_points = []
    for s in sentences:
        s_clean = s.replace("\n", " ").strip()
        if any(f" {kw} " in s_clean.lower() for kw in takeaway_keywords):
            if s_clean not in key_points and 30 < len(s_clean) < 250:
                key_points.append(s_clean)

    # 4. Generate structured Markdown
    now_str = datetime.now().strftime("%B %d, %Y")
    md = []
    md.append(f"# {title} — MBA Revision Notes\n")
    md.append(f"> **Exam Revision Sheet** | Hari Shankar Singhania School of Business (HSB) | Generated: {now_str}\n")
    md.append("---\n")

    # Executive Summary
    md.append("## 1. Executive Summary & Core Objectives")
    if paragraphs:
        # Use first two informative paragraphs
        summary_paras = paragraphs[:2]
        md.append("\n\n".join(summary_paras))
    else:
        md.append("This document contains key study material and foundational concepts for MBA Product Management examination revision.")
    md.append("\n\n---\n")

    # Core Frameworks & Models
    md.append("## 2. Core Frameworks, Theories & Methodologies")
    if detected_frameworks:
        for fw in detected_frameworks[:6]:
            md.append(f"- **Strategic Concept**: {fw}")
    else:
        md.append("- **Double Diamond Model**: Structured approach alternating between divergent problem discovery and convergent solution delivery.")
        md.append("- **RICE Prioritization**: Balancing Reach, Impact, and Confidence against Engineering Effort to rank backlog features.")
        md.append("- **AARRR Growth Funnel**: Mapping the customer lifecycle across Acquisition, Activation, Retention, Revenue, and Referral.")
    md.append("\n\n---\n")

    # Definitions & Terminology
    md.append("## 3. Key MBA Terminology & Definitions")
    if selected_defs:
        for term, defn in selected_defs:
            md.append(f"> **{term}**: {defn}.")
    else:
        md.append("> **Product Requirements Document (PRD)**: A central artifact authored by the Product Manager describing the target user, problem hypothesis, success metrics, and functional specifications.")
        md.append("> **Minimum Viable Product (MVP)**: The version of a new product which allows a team to collect the maximum amount of validated learning about customers with the least effort.")
        md.append("> **North Star Metric (NSM)**: The single metric that best captures the core value delivered to end users, serving as a unifying compass for product teams.")
    md.append("\n\n---\n")

    # Strategic Takeaways
    md.append("## 4. Strategic Takeaways & Managerial Implications")
    if key_points:
        for pt in key_points[:6]:
            md.append(f"- {pt}")
    else:
        md.append("- Prioritize customer retention and habit formation over short-term acquisition bursts.")
        md.append("- Cross-functional alignment between engineering, design, and marketing prevents scope creep.")
        md.append("- Quantitative metrics must always be paired with qualitative user feedback to diagnose underlying root causes.")
    md.append("\n\n---\n")

    # Pre-Exam Flash Checklist
    md.append("## 5. 5-Minute Pre-Exam Checklist")
    md.append("- [ ] Memorize the exact formulas and score derivations (e.g. RICE, CAC/LTV).")
    md.append("- [ ] Be prepared to draw the framework diagrams and identify axis labels.")
    md.append("- [ ] Note counter-examples where classical theories fail under extreme market constraints.")
    md.append("- [ ] Articulate the difference between output metrics (velocity) and outcome metrics (retention).")

    return "\n".join(md)


def _generate_heuristic_quiz(text: str, title: str, num_questions: int, difficulty: str, question_types: str) -> list:
    """
    Synthesizes multiple choice, true/false, and concept questions from document sentences.
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if 35 < len(s.strip()) < 180 and not s.startswith("---") and not s.startswith("#")]
    questions = []
    qid = 1

    # Extract potential concept pairs (Term -> Definition/Action)
    patterns = [
        r"([A-Z][A-Za-z0-9\s-]{2,25})\s+(?:is|refers to|means|represents|helps|ensures|measures)\s+([^.]+)",
        r"([A-Z][A-Za-z0-9\s-]{2,25})\s*:\s*([^.]+)"
    ]
    concept_pairs = []
    for s in sentences:
        for pat in patterns:
            match = re.search(pat, s)
            if match:
                term = match.group(1).strip()
                desc = match.group(2).strip()
                if 2 < len(term) < 35 and 15 < len(desc) < 140:
                    concept_pairs.append((term, desc, s))

    # Shuffle for variety
    random.seed(42 + num_questions)
    shuffled_pairs = list(concept_pairs)
    random.shuffle(shuffled_pairs)

    all_terms = list({p[0] for p in concept_pairs})
    if len(all_terms) < 4:
        all_terms.extend(["RICE Prioritization", "Kano Model", "Double Diamond", "North Star Metric", "AARRR Funnel", "User Story Acceptance Criteria", "Unit Economics"])

    # 1. Concept Questions
    for term, desc, orig_s in shuffled_pairs:
        if qid > num_questions:
            break
        # Create 3 plausible distractors from other terms
        other_terms = [t for t in all_terms if t.lower() != term.lower()]
        random.shuffle(other_terms)
        distractors = other_terms[:3]
        while len(distractors) < 3:
            distractors.append(f"Framework {len(distractors) + 1}")

        opts = [term] + distractors
        random.shuffle(opts)

        q_text = f"According to the study material on {title}, which concept or framework is described as: \"{desc[:120]}...\"?"
        questions.append({
            "id": qid,
            "type": "Concept",
            "question": q_text,
            "options": opts,
            "correct_answer": term,
            "explanation": f"In the document, {term} is directly defined as: {desc}."
        })
        qid += 1

    # 2. True / False Questions
    for s in sentences:
        if qid > num_questions:
            break
        # Alternate between True statements and inverted False statements
        is_true = (qid % 2 == 1)
        if is_true:
            q_text = f"Based on the notes, is the following statement accurate: \"{s}\"?"
            questions.append({
                "id": qid,
                "type": "True/False",
                "question": q_text,
                "options": ["True", "False"],
                "correct_answer": "True",
                "explanation": f"This statement directly reflects the principles outlined in the study text."
            })
        else:
            # Create a negation
            negated = re.sub(r"\b(is|are|can|should|must|requires|leads to)\b", "does not / cannot", s, count=1)
            if negated == s:
                negated = "In opposition to standard practice, " + s
            q_text = f"Based on the notes, is the following statement accurate: \"{negated}\"?"
            questions.append({
                "id": qid,
                "type": "True/False",
                "question": q_text,
                "options": ["True", "False"],
                "correct_answer": "False",
                "explanation": f"False. The document indicates that the correct principle is: \"{s}\"."
            })
        qid += 1

    # 3. Standard MCQs if more questions are needed
    sample_pool = [
        ("What is the primary objective of product discovery in an MBA curriculum?",
         "To validate user problems and eliminate assumptions before committing engineering resources",
         ["To minimize software code length", "To bypass customer feedback entirely", "To immediately deploy production database migrations"],
         "Discovery ensures the team is solving a genuine problem with measurable customer demand."),

        ("Why is retention considered the foundational health metric for tech products?",
         "Because acquiring new users into an unretentive product results in unsustainable burn and negative unit economics",
         ["Because retention eliminates the need for any product updates", "Because app store algorithms only rank downloads", "Because retention has no impact on LTV"],
         "Strong retention proves product-market fit; without it, acquisition costs cannot be amortized."),

        ("In product roadmapping, how does an outcome-driven roadmap differ from a feature-driven roadmap?",
         "It organizes priorities around business and customer impact rather than arbitrary delivery deadlines",
         ["It forbids any software development sprints", "It solely tracks developer lines of code", "It only allows marketing campaigns"],
         "Outcome-driven roadmaps focus on the delta in customer behavior and metrics rather than shipping feature lists.")
    ]

    while qid <= num_questions:
        item = sample_pool[(qid - 1) % len(sample_pool)]
        opts = [item[1]] + item[2]
        random.shuffle(opts)
        questions.append({
            "id": qid,
            "type": "MCQ",
            "question": f"[{difficulty} Level] {item[0]}",
            "options": opts,
            "correct_answer": item[1],
            "explanation": item[3]
        })
        qid += 1

    return questions[:num_questions]
