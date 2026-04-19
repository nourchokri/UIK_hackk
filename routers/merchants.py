from fastapi import APIRouter
from services.storage import storage

router = APIRouter()


@router.get("/{merchant_id}/stats")
def get_stats(merchant_id: str):
    return storage.get_merchant_stats(merchant_id)
