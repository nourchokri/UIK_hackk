import os
import uuid
import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from services.storage import storage
from services import ocr as ocr_service
from services import ai as ai_service

router = APIRouter()
logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", "./uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))


@router.post("/upload")
async def upload_receipt(
    background_tasks: BackgroundTasks,
    receipt: UploadFile = File(...),
    merchantId: str = Form("demo-merchant-001"),
):
    suffix = Path(receipt.filename or "file").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Type de fichier non supporté")

    content = await receipt.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Fichier trop grand (max {MAX_FILE_MB}MB)")

    receipt_id = str(uuid.uuid4())
    filename = f"{receipt_id}{suffix}"
    file_path = UPLOADS_DIR / filename

    with open(file_path, "wb") as f:
        f.write(content)

    record = storage.save_receipt({
        "id": receipt_id,
        "merchantId": merchantId,
        "uploadedAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "status": "pending",
        "imagePath": str(file_path),
        "imageFilename": filename,
        "rawOcrText": None,
        "parsedData": None,
        "aiInsights": None,
        "error": None,
    })

    background_tasks.add_task(_run_pipeline, receipt_id, str(file_path), merchantId)

    return {"receiptId": receipt_id, "status": "pending"}


@router.get("/{receipt_id}/status")
def get_status(receipt_id: str):
    record = storage.get_by_id(receipt_id)
    if not record:
        raise HTTPException(status_code=404, detail="Reçu introuvable")
    return {
        "receiptId": record["id"],
        "status": record["status"],
        "updatedAt": record["updatedAt"],
        "error": record.get("error"),
    }


@router.get("/")
def list_receipts(merchantId: str = None, status: str = None, page: int = 1, limit: int = 20):
    return storage.get_receipts(merchant_id=merchantId, status=status, page=page, limit=limit)


@router.get("/{receipt_id}")
def get_receipt(receipt_id: str):
    record = storage.get_by_id(receipt_id)
    if not record:
        raise HTTPException(status_code=404, detail="Reçu introuvable")
    return record


@router.post("/{receipt_id}/reanalyze")
def reanalyze(receipt_id: str, background_tasks: BackgroundTasks):
    record = storage.get_by_id(receipt_id)
    if not record:
        raise HTTPException(status_code=404, detail="Reçu introuvable")
    if not record.get("parsedData"):
        raise HTTPException(status_code=400, detail="Reçu pas encore parsé")
    storage.update_status(receipt_id, "analyzing")
    background_tasks.add_task(_run_ai_stage, receipt_id, record["parsedData"], record["merchantId"])
    return {"receiptId": receipt_id, "status": "analyzing"}


# ── Pipeline ─────────────────────────────────────────────────────────────────

def _run_pipeline(receipt_id: str, file_path: str, merchant_id: str):
    try:
        # Stage 1: OCR
        storage.update_status(receipt_id, "ocr")
        logger.info(f"[Pipeline] Stage 1: OCR — {receipt_id}")
        result = ocr_service.extract_text(file_path)
        storage.update_field(receipt_id, "rawOcrText", result["rawText"])

        # Stage 2: Structured extraction via AI
        storage.update_status(receipt_id, "parsing")
        logger.info(f"[Pipeline] Stage 2: AI extraction — {receipt_id}")
        parsed = ai_service.extract_structured_fields(result["rawText"])
        storage.update_field(receipt_id, "parsedData", parsed)

        # Stage 3: Business insights
        _run_ai_stage(receipt_id, parsed, merchant_id)

        logger.info(f"[Pipeline] Complete — {receipt_id}")
    except Exception as e:
        logger.error(f"[Pipeline] Failed — {receipt_id}: {e}")
        storage.update_field(receipt_id, "error", str(e))
        storage.update_status(receipt_id, "failed")


def _run_ai_stage(receipt_id: str, parsed_data: dict, merchant_id: str):
    storage.update_status(receipt_id, "analyzing")
    logger.info(f"[Pipeline] Stage 3: AI analysis — {receipt_id}")
    history = storage.get_merchant_receipts(merchant_id, limit=20)
    insights = ai_service.analyze_receipt(parsed_data, history)
    storage.update_field(receipt_id, "aiInsights", insights)
    storage.update_status(receipt_id, "complete")
