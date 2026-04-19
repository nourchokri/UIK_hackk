import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = "https://wqkvxfagjapcycoygpdv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxa3Z4ZmFnamFwY3ljb3lncGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTk4MjgsImV4cCI6MjA5MTQ5NTgyOH0.9646Qtz48jbvvSvvs5ctL8Hc9wd4Xfczga7_uqLArnw"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TODAY = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
START = TODAY - timedelta(days=89)  # 90 days inclusive

rng = random.Random(42)  # reproducible but varied


def rand_amount(lo: float, hi: float, used: set) -> float:
    """Return a unique amount (3 decimals) in [lo, hi] not seen before."""
    for _ in range(1000):
        val = round(rng.uniform(lo, hi), 3)
        if val not in used:
            used.add(val)
            return val
    # fallback: tiny nudge
    val = round(rng.uniform(lo, hi) + rng.uniform(0.001, 0.009), 3)
    used.add(val)
    return val


def rand_time(date: datetime) -> datetime:
    """Random timestamp between 08:00 and 19:00 on a given date."""
    hour = rng.randint(8, 18)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    return date.replace(hour=hour, minute=minute, second=second)


def day_iter():
    """Yield each date in the 90-day window."""
    for i in range(90):
        yield START + timedelta(days=i)


# ---------------------------------------------------------------------------
# Build transaction list (not yet inserted — we need wallet IDs first)
# ---------------------------------------------------------------------------

used_amounts: set = set()

business_txs = []
personal_txs = []

# ── Business wallet ─────────────────────────────────────────────────────────

revenue_merchants = [
    "Mme Leila Mansour",
    "Mme Sonia Belhadj",
    "Mme Rania Touati",
    "Boutique Nour",
    "Mme Hela Jrad",
]

# We want 3-4 client payments per week.
# Last 30 days = "wedding season" → higher amounts (250-350 TND vs 180-260 TND).
all_days = list(day_iter())

week_buckets: dict[int, list[datetime]] = {}
for d in all_days:
    w = (d - START).days // 7
    week_buckets.setdefault(w, []).append(d)

for week_idx, days_in_week in week_buckets.items():
    n_payments = rng.randint(3, 4)
    chosen_days = rng.sample(days_in_week, min(n_payments, len(days_in_week)))
    for d in chosen_days:
        days_from_start = (d - START).days
        if days_from_start >= 60:  # last 30 days
            lo, hi = 250.0, 350.0
        else:
            lo, hi = 180.0, 260.0
        business_txs.append({
            "amount": rand_amount(lo, hi, used_amounts),
            "direction": "in",
            "category": "revenue",
            "merchant": rng.choice(revenue_merchants),
            "note": "Paiement prestation couture",
            "created_at": rand_time(d),
        })

# Supplies: 2× per month from each supplier
supply_schedule = []
for month_offset in range(3):  # months 0, 1, 2 within the 90-day window
    base = START + timedelta(days=month_offset * 30)
    for _ in range(2):
        day_offset = rng.randint(0, 14)
        supply_schedule.append((base + timedelta(days=day_offset), "Tissus Moderne", 65.0, 120.0))
        day_offset2 = rng.randint(1, 14)
        supply_schedule.append((base + timedelta(days=day_offset2 + 15), "Al Nour Textiles", 40.0, 90.0))

for d, merchant, lo, hi in supply_schedule:
    if d > TODAY:
        d = TODAY
    business_txs.append({
        "amount": rand_amount(lo, hi, used_amounts),
        "direction": "out",
        "category": "supplies",
        "merchant": merchant,
        "note": "Achat tissus/matières",
        "created_at": rand_time(d),
    })

# Utilities: once a month
for month_offset in range(3):
    d = START + timedelta(days=month_offset * 30 + rng.randint(5, 10))
    if d > TODAY:
        d = TODAY
    business_txs.append({
        "amount": rand_amount(55.0, 80.0, used_amounts),
        "direction": "out",
        "category": "utilities",
        "merchant": "STEG électricité atelier",
        "note": "Facture électricité",
        "created_at": rand_time(d),
    })

# Transport: weekly
for d in all_days:
    if d.weekday() == 1:  # every Tuesday
        business_txs.append({
            "amount": rand_amount(8.0, 15.0, used_amounts),
            "direction": "out",
            "category": "transport",
            "merchant": "Taxi/Louage",
            "note": "Déplacement atelier",
            "created_at": rand_time(d),
        })

# ── Personal wallet ──────────────────────────────────────────────────────────

grocery_merchants = ["Monoprix Tunis", "Magasin général"]

# Loyer: once a month (around day 1-3 of the month cycle)
for month_offset in range(3):
    d = START + timedelta(days=month_offset * 30 + rng.randint(1, 3))
    if d > TODAY:
        d = TODAY
    personal_txs.append({
        "amount": 400.0,
        "direction": "out",
        "category": "loyer",
        "merchant": "Propriétaire",
        "note": "Loyer mensuel",
        "created_at": rand_time(d),
    })

# Frais scolaires: once a month
for month_offset in range(3):
    d = START + timedelta(days=month_offset * 30 + rng.randint(4, 8))
    if d > TODAY:
        d = TODAY
    personal_txs.append({
        "amount": 85.0,
        "direction": "out",
        "category": "education",
        "merchant": "École",
        "note": "Frais scolaires",
        "created_at": rand_time(d),
    })

# Grocery: weekly (Saturday)
for d in all_days:
    if d.weekday() == 5:  # Saturday
        personal_txs.append({
            "amount": rand_amount(35.0, 75.0, used_amounts),
            "direction": "out",
            "category": "groceries",
            "merchant": rng.choice(grocery_merchants),
            "note": "Courses alimentaires",
            "created_at": rand_time(d),
        })

# Pharmacie: ~once every 3 weeks, random
pharmacy_days = rng.sample(all_days, 4)
for d in pharmacy_days:
    personal_txs.append({
        "amount": rand_amount(20.0, 45.0, used_amounts),
        "direction": "out",
        "category": "health",
        "merchant": "Pharmacie Centrale",
        "note": "Médicaments",
        "created_at": rand_time(d),
    })

# ---------------------------------------------------------------------------
# Insert profile
# ---------------------------------------------------------------------------

print("Inserting profile …")
profile_id = str(uuid.uuid4())
supabase.table("profiles").insert({
    "id": profile_id,
    "full_name": "Fatma Ben Ali",
    "phone": "+216 98 123 456",
    "business_type": "couturière",
    "city": "Tunis",
    "demo_persona": "fatma",
}).execute()

# ---------------------------------------------------------------------------
# Insert wallets
# ---------------------------------------------------------------------------

print("Inserting wallets …")
business_wallet_id = str(uuid.uuid4())
personal_wallet_id = str(uuid.uuid4())

supabase.table("wallets").insert([
    {"id": business_wallet_id, "user_id": profile_id, "type": "business", "balance": 0},
    {"id": personal_wallet_id, "user_id": profile_id, "type": "personal", "balance": 0},
]).execute()

# ---------------------------------------------------------------------------
# Build final transaction rows and insert in batches
# ---------------------------------------------------------------------------

def build_rows(txs: list[dict], wallet_id: str) -> list[dict]:
    rows = []
    for tx in txs:
        rows.append({
            "id": str(uuid.uuid4()),
            "wallet_id": wallet_id,
            "user_id": profile_id,
            "amount": tx["amount"],
            "direction": tx["direction"],
            "category": tx["category"],
            "merchant": tx["merchant"],
            "note": tx["note"],
            "created_at": tx["created_at"].isoformat(),
        })
    return rows


def insert_in_batches(rows: list[dict], batch_size: int = 50):
    for i in range(0, len(rows), batch_size):
        supabase.table("transactions").insert(rows[i:i + batch_size]).execute()


print(f"Inserting {len(business_txs)} business transactions …")
insert_in_batches(build_rows(business_txs, business_wallet_id))

print(f"Inserting {len(personal_txs)} personal transactions …")
insert_in_batches(build_rows(personal_txs, personal_wallet_id))

# ---------------------------------------------------------------------------
# Compute real balances and update wallets
# ---------------------------------------------------------------------------

def compute_balance(txs: list[dict]) -> float:
    total = 0.0
    for tx in txs:
        if tx["direction"] == "in":
            total += tx["amount"]
        else:
            total -= tx["amount"]
    return round(total, 3)


business_balance = compute_balance(business_txs)
personal_balance = compute_balance(personal_txs)

print(f"Updating balances — business: {business_balance} TND | personal: {personal_balance} TND")

supabase.table("wallets").update({"balance": business_balance}).eq("id", business_wallet_id).execute()
supabase.table("wallets").update({"balance": personal_balance}).eq("id", personal_wallet_id).execute()

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print()
print("=" * 55)
print(f"  Profile UUID : {profile_id}")
print(f"  Business wallet : {business_wallet_id}  ({business_balance} TND)")
print(f"  Personal wallet : {personal_wallet_id}  ({personal_balance} TND)")
print(f"  Transactions inserted : {len(business_txs) + len(personal_txs)}")
print("=" * 55)
