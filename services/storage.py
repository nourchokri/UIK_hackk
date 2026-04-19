import json
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
import logging

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)


class ReceiptStorage:
    def __init__(self, storage_file: str):
        self.storage_file = Path(storage_file)
        self.store: dict = {}
        self._lock = threading.Lock()
        self._initialize()

    def _initialize(self):
        self.storage_file.parent.mkdir(parents=True, exist_ok=True)
        if self.storage_file.exists():
            try:
                with open(self.storage_file, encoding="utf-8") as f:
                    records = json.load(f)
                for r in records:
                    self.store[r["id"]] = r
                logger.info(f"[Storage] Loaded {len(self.store)} receipts from disk")
            except Exception as e:
                logger.warning(f"[Storage] Could not parse storage file: {e}")

    def _persist(self):
        try:
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(list(self.store.values()), f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"[Storage] Failed to persist: {e}")

    def save_receipt(self, record: dict) -> dict:
        with self._lock:
            self.store[record["id"]] = record
            self._persist()
        return record

    def update_field(self, id: str, field: str, value) -> dict:
        with self._lock:
            record = self.store.get(id)
            if not record:
                raise ValueError(f"Receipt {id} not found")
            record[field] = value
            record["updatedAt"] = datetime.utcnow().isoformat()
            self._persist()
        return record

    def update_status(self, id: str, status: str) -> dict:
        return self.update_field(id, "status", status)

    def get_by_id(self, id: str):
        return self.store.get(id)

    def get_receipts(self, merchant_id=None, status=None, page=1, limit=20):
        records = list(self.store.values())
        if merchant_id:
            records = [r for r in records if r.get("merchantId") == merchant_id]
        if status:
            records = [r for r in records if r.get("status") == status]
        records.sort(key=lambda r: r.get("uploadedAt", ""), reverse=True)
        total = len(records)
        start = (page - 1) * limit
        return {"records": records[start : start + limit], "total": total, "page": page, "limit": limit}

    def get_merchant_receipts(self, merchant_id: str, limit=20):
        return [
            r
            for r in sorted(self.store.values(), key=lambda r: r.get("uploadedAt", ""), reverse=True)
            if r.get("merchantId") == merchant_id and r.get("status") == "complete"
        ][:limit]

    def get_all_insights(self, merchant_id: str):
        receipts = self.get_merchant_receipts(merchant_id, limit=1000)
        insights = []
        sev_order = {"high": 0, "medium": 1, "low": 2}
        for r in receipts:
            ai = r.get("aiInsights") or {}
            for i in ai.get("missedUpsells", []):
                insights.append({**i, "type": "upsell", "receiptId": r["id"], "date": r["uploadedAt"]})
            for i in ai.get("bundleOpportunities", []):
                insights.append({**i, "type": "bundle", "receiptId": r["id"], "date": r["uploadedAt"]})
            for i in ai.get("pricingIssues", []):
                insights.append({**i, "type": "pricing", "receiptId": r["id"], "date": r["uploadedAt"]})
            for i in ai.get("customerBehaviorInsights", []):
                insights.append({**i, "type": "behavior", "receiptId": r["id"], "date": r["uploadedAt"]})
        return sorted(insights, key=lambda i: sev_order.get(i.get("severity", ""), 3))

    def get_trends(self, merchant_id: str, days=30):
        receipts = self.get_merchant_receipts(merchant_id, limit=1000)
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        by_date = {}
        for r in receipts:
            if r.get("uploadedAt", "") < cutoff:
                continue
            d = r["uploadedAt"][:10]
            if d not in by_date:
                by_date[d] = {"date": d, "count": 0, "revenue": 0}
            by_date[d]["count"] += 1
            pd = r.get("parsedData") or {}
            by_date[d]["revenue"] += pd.get("totaux", {}).get("total_ttc") or pd.get("total") or 0
        return sorted(by_date.values(), key=lambda x: x["date"])

    def get_merchant_stats(self, merchant_id: str):
        receipts = self.get_merchant_receipts(merchant_id, limit=1000)
        total_revenue = sum(
            (r.get("parsedData") or {}).get("totaux", {}).get("total_ttc")
            or (r.get("parsedData") or {}).get("total")
            or 0
            for r in receipts
        )
        item_counts = {}
        for r in receipts:
            pd = r.get("parsedData") or {}
            for item in pd.get("articles", pd.get("items", [])):
                name = item.get("designation") or item.get("name", "")
                item_counts[name] = item_counts.get(name, 0) + (item.get("quantite") or item.get("quantity") or 1)
        top_items = sorted(item_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        return {
            "totalReceipts": len(receipts),
            "totalRevenue": round(total_revenue, 2),
            "avgBasketSize": round(total_revenue / len(receipts), 2) if receipts else 0,
            "topItems": [{"name": n, "count": c} for n, c in top_items],
        }


storage = ReceiptStorage(os.getenv("STORAGE_FILE", "./data/receipts.json"))
