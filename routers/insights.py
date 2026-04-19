from fastapi import APIRouter
from services.storage import storage
from services import ai as ai_service

router = APIRouter()


@router.get("/")
def get_insights(merchantId: str = "demo-merchant-001", type: str = None):
    insights = storage.get_all_insights(merchantId)
    if type:
        insights = [i for i in insights if i.get("type") == type]
    return {"insights": insights, "total": len(insights)}


@router.get("/summary")
def get_summary(merchantId: str = "demo-merchant-001"):
    receipts = storage.get_merchant_receipts(merchantId, limit=50)
    return ai_service.generate_weekly_summary(receipts)


@router.get("/trends")
def get_trends(merchantId: str = "demo-merchant-001", days: int = 30):
    return {"trends": storage.get_trends(merchantId, days)}
