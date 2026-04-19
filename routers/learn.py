import json
import re
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.supabase_client import supabase
from services.llm import client, MODEL

router = APIRouter()

# ── Level config ─────────────────────────────────────────────────────────────

LEVEL_LABELS = {
    1: "Entrepreneur Débutant",
    2: "Entrepreneur Averti",
    3: "Entrepreneur Confirmé",
    4: "Entrepreneur Expert",
}

LEVEL_THRESHOLDS = [0, 100, 250, 500]  # XP needed to reach level 1,2,3,4


def _xp_to_level(xp: int) -> int:
    if xp >= 500:
        return 4
    if xp >= 250:
        return 3
    if xp >= 100:
        return 2
    return 1


def _xp_to_next(xp: int, level: int) -> int:
    thresholds = {1: 100, 2: 250, 3: 500, 4: 500}
    return max(0, thresholds[level] - xp)


def _progress_percent(xp: int, level: int) -> int:
    brackets = {1: (0, 100), 2: (100, 250), 3: (250, 500), 4: (500, 500)}
    lo, hi = brackets[level]
    if hi == lo:
        return 100
    return min(100, int((xp - lo) / (hi - lo) * 100))


# ── Shared data-fetch helper ─────────────────────────────────────────────────

def _fetch_user_data(user_id: str) -> dict:
    """Return profile, wallet, transactions + computed aggregates."""
    profile_res = (
        supabase.table("profiles")
        .select("full_name, business_type, city")
        .eq("id", user_id)
        .execute()
    )
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    profile = profile_res.data[0]

    wallet_res = (
        supabase.table("wallets")
        .select("id")
        .eq("user_id", user_id)
        .eq("type", "business")
        .execute()
    )
    if not wallet_res.data:
        raise HTTPException(status_code=404, detail="Business wallet not found")
    wallet_id = wallet_res.data[0]["id"]

    txs_res = (
        supabase.table("transactions")
        .select("amount, direction, category, created_at")
        .eq("wallet_id", wallet_id)
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    transactions = txs_res.data or []

    now = datetime.now(timezone.utc)
    revenue = 0.0
    expenses = 0.0
    category_spend: dict[str, float] = defaultdict(float)
    has_savings = False

    for tx in transactions:
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
        amount = float(tx["amount"])
        cat = tx["category"]
        if tx["direction"] == "in":
            revenue += amount
        else:
            expenses += amount
            category_spend[cat] += amount
        if cat == "savings":
            has_savings = True

    top_category, top_amount = max(category_spend.items(), key=lambda x: x[1], default=("—", 0.0))
    net_profit = revenue - expenses

    return {
        "profile": profile,
        "revenue": revenue,
        "expenses": expenses,
        "net_profit": net_profit,
        "top_category": top_category,
        "top_amount": top_amount,
        "has_savings": has_savings,
        "category_spend": dict(category_spend),
    }


# ── Endpoint 1 — GET /learn/generate ─────────────────────────────────────────

@router.get("/generate")
def generate_lesson(user_id: str):
    data = _fetch_user_data(user_id)

    profile = data["profile"]
    revenue = data["revenue"]
    expenses = data["expenses"]
    net_profit = data["net_profit"]
    top_category = data["top_category"]
    top_amount = data["top_amount"]
    has_savings = data["has_savings"]
    supplies_total = data["category_spend"].get("supplies", 0.0)

    # ── Topic detection ───────────────────────────────────────────────────────
    if expenses > revenue * 0.7:
        topic = "marge_beneficiaire"
        topic_label = "Comprendre votre marge bénéficiaire"
    elif not has_savings:
        topic = "epargne"
        topic_label = "Pourquoi épargner même un peu chaque mois"
    elif top_category == "supplies" and supplies_total > revenue * 0.4:
        topic = "negociation_fournisseurs"
        topic_label = "Comment négocier avec vos fournisseurs"
    else:
        topic = "tresorerie"
        topic_label = "Gérer sa trésorerie au quotidien"

    prompt = f"""Tu es un professeur financier pour micro-entrepreneurs tunisiens.
Génère une leçon financière courte et personnalisée + un quiz de 3 questions.

DONNÉES RÉELLES DE L'UTILISATEUR:
Nom: {profile['full_name']}
Activité: {profile['business_type']}
Revenus ce mois: {revenue:.3f} TND
Dépenses ce mois: {expenses:.3f} TND
Bénéfice net: {net_profit:.3f} TND
Catégorie de dépense principale: {top_category} ({top_amount:.3f} TND)

SUJET DE LA LEÇON: {topic_label}

FORMAT DE RÉPONSE — réponds UNIQUEMENT avec ce JSON valide, rien d'autre:
{{
  "lesson": {{
    "title": "titre court et accrocheur",
    "hook": "une phrase d'accroche personnalisée qui mentionne ses vrais chiffres",
    "content": "explication simple en 4-5 phrases max, en français avec quelques mots darija naturels, avec un exemple concret basé sur ses chiffres",
    "tip": "un conseil actionnable cette semaine en une phrase"
  }},
  "quiz": [
    {{
      "question": "question basée sur ses vrais chiffres",
      "options": ["option A", "option B", "option C"],
      "correct": 0,
      "explanation": "explication courte pourquoi c'est la bonne réponse"
    }},
    {{
      "question": "...",
      "options": ["...", "...", "..."],
      "correct": 1,
      "explanation": "..."
    }},
    {{
      "question": "...",
      "options": ["...", "...", "..."],
      "correct": 2,
      "explanation": "..."
    }}
  ]
}}"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": "Tu es un professeur financier expert. Tu réponds TOUJOURS avec du JSON valide uniquement, sans markdown, sans explication avant ou après.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
        max_tokens=800,
        top_p=0.9,
        frequency_penalty=0.3,
        presence_penalty=0.0,
    )

    raw = response.choices[0].message.content
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail=f"LLM returned invalid JSON: {raw[:200]}")

    return {
        "topic": topic,
        "lesson": parsed["lesson"],
        "quiz": parsed["quiz"],
        "user_stats": {
            "revenue": revenue,
            "expenses": expenses,
            "net_profit": net_profit,
            "top_category": top_category,
        },
    }


# ── Endpoint 2 — POST /learn/quiz/complete ────────────────────────────────────

class QuizCompleteRequest(BaseModel):
    user_id: str
    topic: str
    score: int
    total: int


@router.post("/quiz/complete")
def quiz_complete(req: QuizCompleteRequest):
    xp_earned = req.score * 10

    # Fetch profile name for the message
    profile_res = (
        supabase.table("profiles")
        .select("full_name")
        .eq("id", req.user_id)
        .execute()
    )
    first_name = profile_res.data[0]["full_name"].split()[0] if profile_res.data else "chérie"

    # Fetch existing progress
    progress_res = (
        supabase.table("learn_progress")
        .select("*")
        .eq("user_id", req.user_id)
        .execute()
    )
    existing = progress_res.data[0] if progress_res.data else None

    now = datetime.now(timezone.utc).isoformat()

    if existing is None:
        new_xp = xp_earned
        new_quizzes = 1
        new_level = _xp_to_level(new_xp)
        supabase.table("learn_progress").insert({
            "user_id": req.user_id,
            "xp": new_xp,
            "level": new_level,
            "quizzes_completed": new_quizzes,
            "last_lesson_topic": req.topic,
            "updated_at": now,
        }).execute()
        leveled_up = False
    else:
        old_level = existing["level"]
        new_xp = existing["xp"] + xp_earned
        new_quizzes = existing["quizzes_completed"] + 1
        new_level = _xp_to_level(new_xp)
        leveled_up = new_level > old_level
        supabase.table("learn_progress").update({
            "xp": new_xp,
            "level": new_level,
            "quizzes_completed": new_quizzes,
            "last_lesson_topic": req.topic,
            "updated_at": now,
        }).eq("user_id", req.user_id).execute()

    return {
        "xp_earned": xp_earned,
        "total_xp": new_xp,
        "level": new_level,
        "level_label": LEVEL_LABELS[new_level],
        "leveled_up": leveled_up,
        "message": f"Barcha bien {first_name}! +{xp_earned} XP 🎉",
    }


# ── Endpoint 3 — GET /learn/progress ─────────────────────────────────────────

@router.get("/progress")
def get_progress(user_id: str):
    progress_res = (
        supabase.table("learn_progress")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if not progress_res.data:
        # No progress yet — return defaults
        return {
            "xp": 0,
            "level": 1,
            "level_label": LEVEL_LABELS[1],
            "xp_to_next_level": 100,
            "quizzes_completed": 0,
            "progress_percent": 0,
        }

    row = progress_res.data[0]
    xp = row["xp"]
    level = row["level"]

    return {
        "xp": xp,
        "level": level,
        "level_label": LEVEL_LABELS[level],
        "xp_to_next_level": _xp_to_next(xp, level),
        "quizzes_completed": row["quizzes_completed"],
        "progress_percent": _progress_percent(xp, level),
    }
