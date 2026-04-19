from fastapi import APIRouter, HTTPException
from services.supabase_client import supabase
from services.detectors import run_full_analysis

router = APIRouter()


@router.get("/health")
def get_health_score(user_id: str):
    """
    Returns the financial health score and KPIs for a user,
    computed using the AnomalyDetector from ranim_backend/detectors.py.
    """
    # ── Fetch business wallet ─────────────────────────────────────────────
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
    current_balance = float(wallet["balance"])

    # ── Fetch last 90 transactions (enough history for trend analysis) ────
    txs_res = (
        supabase.table("transactions")
        .select("id, amount, direction, category, merchant, created_at, note")
        .eq("wallet_id", wallet["id"])
        .order("created_at", desc=True)
        .limit(90)
        .execute()
    )
    transactions = txs_res.data or []

    # ── Run detectors ─────────────────────────────────────────────────────
    result = run_full_analysis(transactions, current_balance)

    return {
        "user_id": user_id,
        "balance": current_balance,
        **result,
    }
