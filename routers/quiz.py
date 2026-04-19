"""
Quiz API Endpoints — adapted from ranim_backend/quiz_api.py
Uses project-local supabase + llm clients (sync, wrapped in asyncio.to_thread)
"""
import asyncio
import json
import re
import logging
from typing import Dict, List, Optional
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from services.supabase_client import supabase
from services.llm import client as llm_client, MODEL
from services.quiz_models import (
    QuizResponse, AnswerSubmission, QuizFeedback,
    QuizCompletion, Question, QuizOption,
)
from services.quiz_generator import (
    analyze_user_transactions, determine_difficulty,
    build_quiz_prompt, select_focus_area,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory storage for active quizzes (use Redis in production)
active_quizzes: Dict[str, Dict] = {}

# ── Level helpers ──────────────────────────────────────────────────────────────

LEVEL_LABELS = {
    1: "Entrepreneur Débutant",
    2: "Entrepreneur Averti",
    3: "Entrepreneur Confirmé",
    4: "Expert",
}


def _compute_level(xp: int) -> int:
    if xp < 100:
        return 1
    if xp < 250:
        return 2
    if xp < 500:
        return 3
    return 4


def _compute_progress_percent(xp: int, level: int) -> float:
    if level == 1:
        return (xp / 100) * 100
    if level == 2:
        return ((xp - 100) / 150) * 100
    if level == 3:
        return ((xp - 250) / 250) * 100
    return 100.0


# ── LLM helpers ───────────────────────────────────────────────────────────────

def _parse_quiz_json(content: str) -> Optional[List[Dict]]:
    """Strip markdown fences and parse JSON questions array."""
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()

    try:
        quiz_data = json.loads(content)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", content)
        if not m:
            return None
        try:
            quiz_data = json.loads(m.group(0))
        except Exception:
            return None

    if "questions" not in quiz_data:
        return None

    questions = []
    for q in quiz_data["questions"]:
        if not all(f in q for f in ["question_text", "options", "correct_answer", "explanation"]):
            continue
        if not isinstance(q["options"], list) or len(q["options"]) < 3:
            continue
        opts = []
        for opt in q["options"]:
            if isinstance(opt, dict) and "id" in opt and "text" in opt:
                opts.append(opt)
            elif isinstance(opt, str):
                opts.append({"id": chr(65 + len(opts)), "text": opt})
        questions.append({
            "question_text": q["question_text"],
            "options": opts,
            "correct_answer": q["correct_answer"],
            "explanation": q["explanation"],
            "topic": q.get("topic", "general"),
            "learning_tip": q.get("learning_tip", ""),
        })

    return questions if len(questions) >= 3 else None


async def _generate_questions_llm(prompt: str) -> Optional[List[Dict]]:
    """Call the sync OpenAI-compatible client in a thread pool."""

    def _sync() -> str:
        response = llm_client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a financial literacy educator creating personalized quiz "
                        "questions for micro-entrepreneurs. Generate questions in valid JSON format only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=1500,
        )
        return response.choices[0].message.content or ""

    for attempt in range(2):
        try:
            content = await asyncio.to_thread(_sync)
            questions = _parse_quiz_json(content)
            if questions:
                return questions
        except Exception as e:
            logger.error(f"LLM attempt {attempt + 1} failed: {e}")
    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/progress")
async def get_quiz_progress(user_id: str):
    """Return XP, level, level label, progress percent and quizzes completed."""
    try:
        resp = supabase.table("learn_progress").select("*").eq("user_id", user_id).execute()
        if resp.data:
            row = resp.data[0]
            xp = row.get("xp", 0)
            quizzes_completed = row.get("quizzes_completed", 0)
        else:
            xp = 0
            quizzes_completed = 0

        level = _compute_level(xp)
        progress_percent = round(_compute_progress_percent(xp, level), 1)

        return {
            "xp": xp,
            "level": level,
            "level_label": LEVEL_LABELS[level],
            "progress_percent": progress_percent,
            "quizzes_completed": quizzes_completed,
        }
    except Exception as e:
        logger.error(f"Error fetching quiz progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(user_id: str, focus_area: Optional[str] = None):
    """Generate a personalized quiz for the user based on their transactions."""
    try:
        # 1. Fetch user profile
        profile_response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        if not profile_response.data:
            raise HTTPException(status_code=404, detail="User not found")
        user_profile = profile_response.data[0]

        # 2. Fetch / create learn_progress
        progress_response = supabase.table("learn_progress").select("*").eq("user_id", user_id).execute()
        if progress_response.data:
            progress = progress_response.data[0]
            current_level = progress.get("level", 1)
            current_xp = progress.get("xp", 0)
        else:
            supabase.table("learn_progress").insert({
                "user_id": user_id,
                "xp": 0,
                "level": 1,
                "quizzes_completed": 0,
            }).execute()
            current_level = 1
            current_xp = 0

        # 3. Fetch recent transactions
        transactions_response = (
            supabase.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        transactions = transactions_response.data
        for t in transactions:
            if "direction" in t:
                t["type"] = "income" if t["direction"] == "in" else "expense"

        # 4. Analyse
        transaction_analysis = analyze_user_transactions(transactions)

        # 5. Difficulty & focus
        difficulty = determine_difficulty(current_level)
        if not focus_area:
            focus_area = select_focus_area(transaction_analysis)

        # 6. Generate via LLM
        if not transaction_analysis["has_data"]:
            raise HTTPException(
                status_code=400,
                detail="Insufficient transaction data to generate personalized quiz. Please add more transactions.",
            )

        prompt = build_quiz_prompt(
            user_data={
                "level": current_level,
                "business_type": user_profile.get("business_type", "small business"),
                "city": user_profile.get("city", "Tunisie"),
            },
            transaction_analysis=transaction_analysis,
            difficulty=difficulty,
            focus_area=focus_area,
            num_questions=4,
        )

        logger.info(f"Generating quiz for user {user_id}, difficulty={difficulty}, focus={focus_area}")
        questions = await _generate_questions_llm(prompt)

        if not questions:
            raise HTTPException(
                status_code=503,
                detail="Quiz generation failed. Please try again in a moment.",
            )

        logger.info(f"LLM generated {len(questions)} questions")

        # 7. Format & store
        quiz_id = str(uuid4())
        formatted_questions = []
        for i, q in enumerate(questions):
            question_id = f"{quiz_id}_q{i + 1}"
            formatted_questions.append(
                Question(
                    question_id=question_id,
                    question_text=q["question_text"],
                    options=[QuizOption(**opt) for opt in q["options"]],
                    topic=q.get("topic", "general"),
                )
            )

        active_quizzes[quiz_id] = {
            "user_id": user_id,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now(timezone.utc),
        }

        return QuizResponse(
            quiz_id=quiz_id,
            user_id=user_id,
            questions=formatted_questions,
            current_level=current_level,
            current_xp=current_xp,
            estimated_time_minutes=2,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating quiz: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit-answer", response_model=QuizFeedback)
async def submit_answer(submission: AnswerSubmission):
    """Submit an answer and receive immediate feedback."""
    try:
        quiz = active_quizzes.get(submission.quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found or expired")

        question_index = int(submission.question_id.split("_q")[1]) - 1
        if question_index >= len(quiz["questions"]):
            raise HTTPException(status_code=400, detail="Invalid question ID")

        question = quiz["questions"][question_index]
        correct_answer = question["correct_answer"]
        is_correct = submission.selected_answer == correct_answer

        quiz["answers"][submission.question_id] = {
            "selected": submission.selected_answer,
            "correct": is_correct,
        }

        xp_earned = 10 if is_correct else 0

        why_wrong = None
        if not is_correct:
            selected_option = next(
                (opt for opt in question["options"] if opt["id"] == submission.selected_answer),
                None,
            )
            correct_option = next(
                (opt for opt in question["options"] if opt["id"] == correct_answer),
                None,
            )
            if selected_option and correct_option:
                why_wrong = (
                    f"Vous avez choisi '{selected_option['text']}', "
                    f"mais la meilleure réponse est '{correct_option['text']}'."
                )

        return QuizFeedback(
            is_correct=is_correct,
            correct_answer=correct_answer,
            explanation=question["explanation"],
            why_wrong=why_wrong,
            learning_tip=question.get("learning_tip", ""),
            xp_earned=xp_earned,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/complete", response_model=QuizCompletion)
async def complete_quiz(quiz_id: str):
    """Finalise the quiz and persist updated XP / level to Supabase."""
    try:
        quiz = active_quizzes.get(quiz_id)
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        user_id = quiz["user_id"]
        total_questions = len(quiz["questions"])
        correct_answers = sum(1 for ans in quiz["answers"].values() if ans["correct"])
        score_percentage = int((correct_answers / total_questions) * 100) if total_questions else 0
        total_xp_earned = correct_answers * 10

        progress_response = supabase.table("learn_progress").select("*").eq("user_id", user_id).execute()

        if progress_response.data:
            progress = progress_response.data[0]
            old_xp = progress.get("xp", 0)
            old_level = progress.get("level", 1)
            quizzes_completed = progress.get("quizzes_completed", 0)
            last_quiz_date = progress.get("updated_at")

            new_xp = old_xp + total_xp_earned
            new_level = _compute_level(new_xp)
            level_up = new_level > old_level

            current_streak = quizzes_completed
            if last_quiz_date:
                last_date = datetime.fromisoformat(str(last_quiz_date).replace("Z", "+00:00"))
                days_since = (datetime.now(timezone.utc) - last_date).days
                if days_since == 1:
                    current_streak += 1
                elif days_since > 1:
                    current_streak = 1
            else:
                current_streak = 1

            supabase.table("learn_progress").update({
                "xp": new_xp,
                "level": new_level,
                "quizzes_completed": quizzes_completed + 1,
                "last_lesson_topic": quiz["questions"][0].get("topic", "general"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("user_id", user_id).execute()

        else:
            new_xp = total_xp_earned
            new_level = _compute_level(new_xp)
            level_up = new_level > 1
            current_streak = 1

            supabase.table("learn_progress").insert({
                "user_id": user_id,
                "xp": new_xp,
                "level": new_level,
                "quizzes_completed": 1,
                "last_lesson_topic": quiz["questions"][0].get("topic", "general"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

        del active_quizzes[quiz_id]

        return QuizCompletion(
            quiz_id=quiz_id,
            total_questions=total_questions,
            correct_answers=correct_answers,
            score_percentage=score_percentage,
            total_xp_earned=total_xp_earned,
            new_level=new_level,
            new_xp=new_xp,
            level_up=level_up,
            current_streak=current_streak,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing quiz: {e}")
        raise HTTPException(status_code=500, detail=str(e))
