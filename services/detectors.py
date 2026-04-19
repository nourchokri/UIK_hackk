"""
Anomaly detection & health score logic adapted from ranim_backend/detectors.py.
Field mapping: our transactions use direction='in'/'out' and created_at,
while ranim's models used type='income'/'expense' and transaction_date.
"""
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import statistics


def _adapt_transactions(transactions: List[Dict]) -> List[Dict]:
    """Convert our Supabase transaction format to the detector format."""
    adapted = []
    for t in transactions:
        adapted.append({
            **t,
            "type": "income" if t.get("direction") == "in" else "expense",
            "transaction_date": t.get("created_at"),
            "amount": float(t.get("amount", 0)),
        })
    return adapted


class AnomalyDetector:
    """Core anomaly detection logic for micro-entrepreneur transactions."""

    @staticmethod
    def calculate_cash_runway(transactions: List[Dict], current_balance: float) -> Optional[float]:
        """
        Calculate days until money runs out based on recent spending patterns.
        Returns: days remaining (float) or None if income exceeds expenses.
        """
        if not transactions:
            return None

        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        recent = [
            t for t in transactions
            if datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) > thirty_days_ago
        ]

        if not recent:
            return None

        total_expenses = sum(t["amount"] for t in recent if t.get("type") == "expense")
        total_income = sum(t["amount"] for t in recent if t.get("type") == "income")

        dates = set(str(t["transaction_date"])[:10] for t in recent)
        days_in_period = max(1, min(30, len(dates)))
        daily_burn = (total_expenses - total_income) / days_in_period

        if daily_burn <= 0:
            return None  # Making money

        return round(current_balance / daily_burn, 1)

    @staticmethod
    def detect_income_drop(transactions: List[Dict]) -> Optional[Dict]:
        """Detect significant income decline vs. 3-week historical average."""
        if len(transactions) < 14:
            return None

        now = datetime.now(timezone.utc)
        one_week_ago = now - timedelta(days=7)
        four_weeks_ago = now - timedelta(days=28)

        recent_income = sum(
            t["amount"] for t in transactions
            if t.get("type") == "income"
            and datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) > one_week_ago
        )
        historical_income = sum(
            t["amount"] for t in transactions
            if t.get("type") == "income"
            and four_weeks_ago < datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) <= one_week_ago
        )

        if historical_income == 0:
            return None

        historical_weekly_avg = historical_income / 3
        drop_pct = ((historical_weekly_avg - recent_income) / historical_weekly_avg) * 100

        if drop_pct > 40:
            severity = "critical" if drop_pct > 70 else "high" if drop_pct > 55 else "medium"
            return {
                "anomaly_type": "income_drop",
                "severity": severity,
                "description": f"Les revenus ont baissé de {drop_pct:.1f}% cette semaine vs. moyenne 3 semaines",
                "metadata": {
                    "recent_income": recent_income,
                    "historical_avg": historical_weekly_avg,
                    "drop_percentage": drop_pct,
                },
            }
        return None

    @staticmethod
    def detect_unusual_spending(transactions: List[Dict]) -> List[Dict]:
        """Detect individual transactions that are unusually large (>2.5x average)."""
        if len(transactions) < 10:
            return []

        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)
        expenses = [
            t for t in transactions
            if t.get("type") == "expense"
            and datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) > thirty_days_ago
        ]

        if len(expenses) < 5:
            return []

        amounts = [e["amount"] for e in expenses]
        avg_expense = statistics.mean(amounts)

        anomalies = []
        for expense in expenses[-10:]:
            if expense["amount"] > avg_expense * 2.5:
                severity = "critical" if expense["amount"] > avg_expense * 5 else "high"
                anomalies.append({
                    "anomaly_type": "unusual_spending",
                    "severity": severity,
                    "description": f"Dépense élevée de {expense['amount']:.2f} TND ({expense['amount']/avg_expense:.1f}x la moyenne)",
                    "metadata": {
                        "amount": expense["amount"],
                        "average_expense": avg_expense,
                        "multiplier": round(expense["amount"] / avg_expense, 2),
                        "category": expense.get("category", "autre"),
                        "date": str(expense["transaction_date"]),
                    },
                })
        return anomalies

    @staticmethod
    def calculate_health_score(
        cash_runway: Optional[float],
        has_income_drop: bool,
        unusual_spending_count: int,
        active_anomalies: int,
    ) -> int:
        """Calculate overall financial health score (0–100)."""
        score = 100

        if cash_runway is not None:
            if cash_runway < 7:
                score -= 40
            elif cash_runway < 14:
                score -= 25
            elif cash_runway < 30:
                score -= 10

        if has_income_drop:
            score -= 25

        score -= min(unusual_spending_count * 5, 20)
        score -= min(active_anomalies * 3, 15)

        return max(0, min(100, score))

    @staticmethod
    def calculate_breakdown(
        transactions: List[Dict],
        monthly_income: float,
        monthly_expenses: float,
        cash_runway: Optional[float],
        has_income_drop: bool,
    ) -> Dict:
        """
        Calculate 3 KPI sub-scores:
          - regularite (income regularity)
          - epargne    (savings rate)
          - remboursement (repayment capacity based on runway)
        """
        # Régularité : based on income drop severity
        if has_income_drop:
            regularite = 45
        else:
            regularite = 100
            # Slight penalty if very few income transactions
            income_txs = [t for t in transactions if t.get("type") == "income"]
            if len(income_txs) < 3:
                regularite = 70

        # Épargne : based on net profit / revenue ratio
        net_profit = monthly_income - monthly_expenses
        if monthly_income > 0:
            savings_rate = net_profit / monthly_income
            if savings_rate >= 0.30:
                epargne = 90
            elif savings_rate >= 0.20:
                epargne = 75
            elif savings_rate >= 0.10:
                epargne = 60
            elif savings_rate >= 0:
                epargne = 45
            else:
                epargne = max(0, int(30 + savings_rate * 100))
        else:
            epargne = 0

        # Remboursement : based on cash runway
        if cash_runway is None:
            # No burn rate → income >= expenses → good
            remboursement = 90
        elif cash_runway >= 60:
            remboursement = 100
        elif cash_runway >= 30:
            remboursement = 85
        elif cash_runway >= 14:
            remboursement = 65
        elif cash_runway >= 7:
            remboursement = 45
        else:
            remboursement = 25

        return {
            "regularite": regularite,
            "epargne": epargne,
            "remboursement": remboursement,
        }

    @staticmethod
    def get_income_trend(transactions: List[Dict]) -> str:
        """Compare this month's income to last month's."""
        now = datetime.now(timezone.utc)
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if first_of_month.month == 1:
            last_month_start = first_of_month.replace(year=first_of_month.year - 1, month=12)
        else:
            last_month_start = first_of_month.replace(month=first_of_month.month - 1)

        this_month_income = sum(
            t["amount"] for t in transactions
            if t.get("type") == "income"
            and datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) >= first_of_month
        )
        last_month_income = sum(
            t["amount"] for t in transactions
            if t.get("type") == "income"
            and last_month_start <= datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) < first_of_month
        )

        if last_month_income == 0:
            return "stable"
        ratio = this_month_income / last_month_income
        if ratio >= 1.10:
            return "increasing"
        elif ratio <= 0.90:
            return "declining"
        return "stable"

    @staticmethod
    def get_risk_level(health_score: int) -> str:
        if health_score >= 80:
            return "low"
        elif health_score >= 60:
            return "medium"
        elif health_score >= 40:
            return "high"
        return "critical"


def run_full_analysis(transactions_raw: List[Dict], current_balance: float) -> Dict:
    """
    Entry point: takes raw Supabase transactions, returns full health analysis.
    """
    txs = _adapt_transactions(transactions_raw)

    cash_runway = AnomalyDetector.calculate_cash_runway(txs, current_balance)
    income_drop = AnomalyDetector.detect_income_drop(txs)
    unusual = AnomalyDetector.detect_unusual_spending(txs)

    anomalies = []
    if income_drop:
        anomalies.append(income_drop)
    anomalies.extend(unusual)

    health_score = AnomalyDetector.calculate_health_score(
        cash_runway=cash_runway,
        has_income_drop=income_drop is not None,
        unusual_spending_count=len(unusual),
        active_anomalies=len(anomalies),
    )

    # Monthly aggregates
    now = datetime.now(timezone.utc)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_income = sum(
        t["amount"] for t in txs
        if t.get("type") == "income"
        and datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) >= first_of_month
    )
    monthly_expenses = sum(
        t["amount"] for t in txs
        if t.get("type") == "expense"
        and datetime.fromisoformat(str(t["transaction_date"]).replace("Z", "+00:00")) >= first_of_month
    )

    breakdown = AnomalyDetector.calculate_breakdown(
        transactions=txs,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        cash_runway=cash_runway,
        has_income_drop=income_drop is not None,
    )

    income_trend = AnomalyDetector.get_income_trend(txs)
    risk_level = AnomalyDetector.get_risk_level(health_score)

    return {
        "health_score": health_score,
        "risk_level": risk_level,
        "income_trend": income_trend,
        "cash_runway_days": cash_runway,
        "monthly_income": round(monthly_income, 3),
        "monthly_expenses": round(monthly_expenses, 3),
        "net_profit": round(monthly_income - monthly_expenses, 3),
        "breakdown": breakdown,
        "anomalies": anomalies,
        "active_anomalies": len(anomalies),
    }
