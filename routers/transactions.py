from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import logging

from services.supabase_client import supabase

router = APIRouter()
logger = logging.getLogger(__name__)


class ArticleItem(BaseModel):
    designation: str
    quantite: Optional[float] = None
    prix_unitaire: Optional[float] = None
    tva: Optional[float] = None
    remise: Optional[float] = None
    prix_total: Optional[float] = None


class ConfirmInvoiceRequest(BaseModel):
    user_id: str
    entreprise: str
    adresse: Optional[str] = None
    mf: Optional[str] = None
    facture_numero: Optional[str] = None
    date: Optional[str] = None
    total_ttc: float
    category: str = "supplies"
    articles: Optional[List[ArticleItem]] = []
    devise: Optional[str] = "TND"


@router.get("/summary")
def get_summary(user_id: str):
    try:
        wallets = supabase.table("wallets").select("*").eq("user_id", user_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    business_balance = 0.0
    personal_balance = 0.0
    for w in (wallets.data or []):
        if w["type"] == "business":
            business_balance = w.get("balance", 0) or 0
        elif w["type"] == "personal":
            personal_balance = w.get("balance", 0) or 0

    try:
        recent = (
            supabase.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat() + "+00:00"
        month_tx = (
            supabase.table("transactions")
            .select("amount,direction")
            .eq("user_id", user_id)
            .gte("created_at", month_start)
            .execute()
        )
        monthly_in = sum(t["amount"] for t in (month_tx.data or []) if t["direction"] == "in")
        monthly_out = sum(t["amount"] for t in (month_tx.data or []) if t["direction"] == "out")
    except Exception:
        monthly_in = 0.0
        monthly_out = 0.0

    return {
        "business_balance": business_balance,
        "personal_balance": personal_balance,
        "recent_transactions": recent.data or [],
        "monthly_in": monthly_in,
        "monthly_out": monthly_out,
        "monthly_profit": monthly_in - monthly_out,
    }


@router.get("/list")
def list_transactions(user_id: str, limit: int = 50):
    try:
        result = (
            supabase.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

    return {"transactions": result.data or []}


@router.post("/confirm")
def confirm_invoice(req: ConfirmInvoiceRequest):
    # Get user's business wallet (use limit(1) — .single() raises exception)
    try:
        wallet_res = (
            supabase.table("wallets")
            .select("id")
            .eq("user_id", req.user_id)
            .eq("type", "business")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase wallet: {str(e)}")

    if not wallet_res.data:
        raise HTTPException(status_code=404, detail=f"Wallet introuvable pour user_id={req.user_id}")

    wallet_id = wallet_res.data[0]["id"]

    # Normalize date - use current time for created_at (for sorting)
    # Store invoice date in the note
    invoice_date_str = ""
    try:
        if req.date and "T" in req.date:
            invoice_date_str = req.date.split("T")[0]  # Extract date part
        elif req.date:
            invoice_date_str = req.date
        else:
            invoice_date_str = datetime.utcnow().strftime("%Y-%m-%d")
    except Exception:
        invoice_date_str = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Use current timestamp for created_at (for proper ordering)
    tx_date = datetime.utcnow().isoformat() + "+00:00"

    # Build comprehensive note with ALL invoice details
    note_parts = []
    
    # Invoice date (not created_at)
    if invoice_date_str:
        note_parts.append(f"Date facture: {invoice_date_str}")
    
    # Basic info
    if req.facture_numero:
        note_parts.append(f"Facture: {req.facture_numero}")
    if req.mf:
        note_parts.append(f"MF: {req.mf}")
    if req.adresse:
        note_parts.append(f"Adresse: {req.adresse}")
    if req.devise:
        note_parts.append(f"Devise: {req.devise}")
    
    # Articles details
    if req.articles:
        note_parts.append(f"\n--- Articles ({len(req.articles)}) ---")
        for i, art in enumerate(req.articles, 1):
            art_line = f"{i}. {art.designation}"
            if art.quantite:
                art_line += f" | Qté: {art.quantite}"
            if art.prix_unitaire:
                art_line += f" | PU: {art.prix_unitaire} {req.devise}"
            if art.tva:
                art_line += f" | TVA: {art.tva}%"
            if art.remise:
                art_line += f" | Remise: {art.remise}%"
            if art.prix_total:
                art_line += f" | Total: {art.prix_total} {req.devise}"
            note_parts.append(art_line)
    
    note = "\n".join(note_parts) if note_parts else None

    # Insert transaction (without metadata - use note for all details)
    try:
        result = (
            supabase.table("transactions")
            .insert({
                "wallet_id": wallet_id,
                "user_id": req.user_id,
                "amount": abs(req.total_ttc),
                "direction": "out",
                "category": req.category,
                "merchant": req.entreprise,
                "note": note,
                "created_at": tx_date,
            })
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur insertion: {str(e)}")

    tx_id = result.data[0]["id"] if result.data else None
    
    return {
        "success": True,
        "transaction_id": tx_id,
        "message": f"Transaction enregistrée — {req.entreprise} ({abs(req.total_ttc):.3f} {req.devise})",
        "articles_saved": len(req.articles or []),
    }
