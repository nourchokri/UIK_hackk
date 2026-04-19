from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from datetime import datetime, timezone
from collections import defaultdict

from services.supabase_client import supabase
from services.llm import client, MODEL, SYSTEM_PROMPT

router = APIRouter()


class ChatRequest(BaseModel):
    user_id: str
    message: str
    conversation_history: list[dict[str, Any]] = []


class ChatResponse(BaseModel):
    reply: str


def _build_context(user_id: str) -> str:
    # ── Profile ──────────────────────────────────────────────────────────────
    profile_res = (
        supabase.table("profiles")
        .select("full_name, business_type, city")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="User not found")
    profile = profile_res.data[0]

    # ── Business wallet ───────────────────────────────────────────────────────
    wallet_res = (
        supabase.table("wallets")
        .select("id, balance")
        .eq("user_id", user_id)
        .eq("type", "business")
        .limit(1)
        .execute()
    )
    if not wallet_res.data:
        raise HTTPException(status_code=404, detail="Business wallet not found")
    wallet = wallet_res.data[0]

    # ── Last 30 transactions ──────────────────────────────────────────────────
    txs_res = (
        supabase.table("transactions")
        .select("amount, direction, category, merchant, created_at")
        .eq("wallet_id", wallet["id"])
        .order("created_at", desc=True)
        .limit(30)
        .execute()
    )
    transactions = txs_res.data or []

    # ── Current-month aggregates ──────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    month_revenue = 0.0
    month_expenses = 0.0
    category_spend: dict[str, float] = defaultdict(float)

    for tx in transactions:
        # created_at comes back as an ISO string
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
        if tx_date.year == now.year and tx_date.month == now.month:
            amount = float(tx["amount"])
            if tx["direction"] == "in":
                month_revenue += amount
            else:
                month_expenses += amount
                category_spend[tx["category"]] += amount

    net_profit = month_revenue - month_expenses

    top_3 = sorted(category_spend.items(), key=lambda x: x[1], reverse=True)[:3]
    top_str = ", ".join(f"{cat} ({amt:.0f} TND)" for cat, amt in top_3) or "—"

    # ── Transaction lines ─────────────────────────────────────────────────────
    tx_lines = []
    for tx in transactions:
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
        direction = "IN " if tx["direction"] == "in" else "OUT"
        sign = "+" if tx["direction"] == "in" else "-"
        tx_lines.append(
            f"{tx_date.strftime('%Y-%m-%d')} | {direction} | "
            f"{sign}{float(tx['amount']):.3f} TND | "
            f"{tx['category']:<10} | {tx['merchant']}"
        )

    tx_block = "\n".join(tx_lines) if tx_lines else "Aucune transaction récente."

    context = f"""CONTEXTE UTILISATEUR:
Nom: {profile['full_name']}
Activité: {profile['business_type']}
Ville: {profile['city']}

SITUATION FINANCIÈRE CE MOIS:
Revenus: {month_revenue:.3f} TND
Dépenses: {month_expenses:.3f} TND
Bénéfice net: {net_profit:.3f} TND
Top dépenses: {top_str}

30 DERNIÈRES TRANSACTIONS:
{tx_block}"""

    return context


@router.post("/chat", response_model=ChatResponse)
def advisor_chat(req: ChatRequest):
    context_string = _build_context(req.user_id)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": context_string},
        *req.conversation_history,
        {"role": "user", "content": req.message},
    ]

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=400,
        top_p=0.9,
        frequency_penalty=0.0,
        presence_penalty=0.0,
    )

    reply = response.choices[0].message.content

    return ChatResponse(reply=reply)
