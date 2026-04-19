import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import advisor, learn, receipts, insights, merchants, transactions, quiz, speech, score

app = FastAPI(title="Enda Wallet API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploaded receipts
Path("./uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(advisor.router, prefix="/advisor", tags=["Advisor"])
app.include_router(learn.router, prefix="/learn", tags=["Learn"])
app.include_router(receipts.router, prefix="/api/receipts", tags=["Receipts"])
app.include_router(insights.router, prefix="/api/insights", tags=["Insights"])
app.include_router(merchants.router, prefix="/api/merchants", tags=["Merchants"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["Quiz"])
app.include_router(speech.router, prefix="/api/speech", tags=["Speech"])
app.include_router(score.router, prefix="/api/score", tags=["Score"])


@app.get("/api/health")
def health():
    demo_mode = os.getenv("DEMO_MODE", "false").lower() == "true" or not os.getenv("LLM_API_KEY", "").strip()
    return {"status": "ok", "demoMode": demo_mode, "model": os.getenv("LLM_MODEL", "unknown")}
