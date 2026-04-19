# Marbou7a — Backend

FastAPI backend powering the Enda Wallet demo. It connects to a Supabase database and uses a Llama 3.1 70B LLM to deliver personalized financial advice and lessons to micro-entrepreneurs in Tunisia.

---

## Project Structure

```
enda/
├── seed.py                     # Seeds the database with Fatma's demo data (90 days)
└── backend/
    ├── main.py                 # FastAPI app entry point
    ├── .env                    # Environment variables (not committed)
    ├── requirements.txt
    ├── routers/
    │   ├── advisor.py          # POST /advisor/chat
    │   └── learn.py            # GET /learn/generate, POST /learn/quiz/complete, GET /learn/progress
    └── services/
        ├── supabase_client.py  # Supabase singleton
        └── llm.py              # OpenAI-compatible LLM client + system prompt
```

---

## Setup

### 1. Supabase — Create Tables

Run this SQL in your Supabase **SQL Editor**:

```sql
create table profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  phone text,
  business_type text,
  city text,
  demo_persona text
);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  type text check (type in ('business', 'personal')),
  balance numeric(12,3) default 0
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references wallets(id),
  user_id uuid references profiles(id),
  amount numeric(12,3),
  direction text check (direction in ('in', 'out')),
  category text,
  merchant text,
  note text,
  created_at timestamptz
);

create table learn_progress (
  user_id uuid references profiles(id) primary key,
  xp int default 0,
  level int default 1,
  quizzes_completed int default 0,
  last_lesson_topic text,
  updated_at timestamptz default now()
);
```

### 2. Environment Variables

Create `backend/.env`:

```
LLM_API_KEY=your_esprit_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
```

### 3. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 4. Seed the Database

```bash
cd ..
python seed.py
```

Copy the **Profile UUID** printed at the end — you'll need it for API calls.

### 5. Start the Server

```bash
cd backend
uvicorn main:app --reload
```

API is live at `http://localhost:8000`.
Interactive docs at `http://localhost:8000/docs`.

---

## API Reference

### `GET /`
Health check.
```json
{ "status": "ok", "model": "Llama-3.1-70B" }
```

---

### `POST /advisor/chat`
Chat with Nour, the AI financial advisor. She reads the user's real transactions before every reply.

**Request:**
```json
{
  "user_id": "uuid",
  "message": "Suis-je rentable ce mois?",
  "conversation_history": []
}
```

**Response:**
```json
{
  "reply": "Mazel Fatma! Tu as gagné 1840 TND ce mois..."
}
```

> `conversation_history` is managed by the frontend. Append each exchange as `{"role": "user", "content": "..."}` and `{"role": "assistant", "content": "..."}` and send the full array with every request.

---

### `GET /learn/generate?user_id=`
Generates a personalized financial lesson and 3-question quiz based on the user's real transaction data. The lesson topic is automatically detected from their spending patterns.

**Topics:**
| Topic | Triggered when |
|---|---|
| `marge_beneficiaire` | expenses > 70% of revenue |
| `epargne` | no savings transactions found |
| `negociation_fournisseurs` | supplies > 40% of revenue |
| `tresorerie` | default |

**Response:**
```json
{
  "topic": "epargne",
  "lesson": {
    "title": "...",
    "hook": "...",
    "content": "...",
    "tip": "..."
  },
  "quiz": [
    {
      "question": "...",
      "options": ["A", "B", "C"],
      "correct": 0,
      "explanation": "..."
    }
  ],
  "user_stats": {
    "revenue": 1840.5,
    "expenses": 920.0,
    "net_profit": 920.5,
    "top_category": "supplies"
  }
}
```

---

### `POST /learn/quiz/complete`
Records a completed quiz and awards XP.

**Request:**
```json
{
  "user_id": "uuid",
  "topic": "epargne",
  "score": 2,
  "total": 3
}
```

**Response:**
```json
{
  "xp_earned": 20,
  "total_xp": 80,
  "level": 1,
  "level_label": "Entrepreneur Débutant",
  "leveled_up": false,
  "message": "Barcha bien Fatma! +20 XP 🎉"
}
```

**XP & Levels:**
| Level | Label | XP Required |
|---|---|---|
| 1 | Entrepreneur Débutant | 0 |
| 2 | Entrepreneur Averti | 100 |
| 3 | Entrepreneur Confirmé | 250 |
| 4 | Entrepreneur Expert | 500 |

---

### `GET /learn/progress?user_id=`
Returns the user's current learning progress.

**Response:**
```json
{
  "xp": 80,
  "level": 1,
  "level_label": "Entrepreneur Débutant",
  "xp_to_next_level": 20,
  "quizzes_completed": 4,
  "progress_percent": 80
}
```

---

## Demo Persona

**Fatma Ben Ali** — Couturière, Tunis (`demo_persona = "fatma"`)

- 90 days of realistic transaction history
- Business wallet: client payments, fabric supplies, electricity, transport
- Personal wallet: rent, groceries, school fees, pharmacy
- Higher revenue in the last 30 days (wedding season)
