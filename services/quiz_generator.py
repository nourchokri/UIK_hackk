"""
Quiz Generation Logic - Analyzes transactions and builds LLM prompts
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from collections import Counter

def analyze_user_transactions(transactions: List[Dict]) -> Dict:
    """
    Analyze user's transactions to generate quiz context
    
    Args:
        transactions: List of transaction records
        
    Returns:
        Dict with transaction analysis summary
    """
    if not transactions:
        return {
            'has_data': False,
            'total_income': 0,
            'total_expenses': 0,
            'top_categories': [],
            'digital_ratio': 0,
            'cash_ratio': 100,
            'transaction_count': 0
        }
    
    # Filter last 30 days
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    
    recent_transactions = [
        t for t in transactions
        if datetime.fromisoformat(str(t.get('created_at', t.get('transaction_date'))).replace('Z', '+00:00')) > thirty_days_ago
    ]
    
    if not recent_transactions:
        recent_transactions = transactions[:30]  # Use last 30 transactions
    
    # Calculate totals
    total_income = sum(
        t['amount'] for t in recent_transactions
        if t.get('type') == 'income' or t.get('direction') == 'in'
    )
    
    total_expenses = sum(
        t['amount'] for t in recent_transactions
        if t.get('type') == 'expense' or t.get('direction') == 'out'
    )
    
    # Analyze categories
    categories = [
        t.get('category', 'other') for t in recent_transactions
        if t.get('type') == 'expense' or t.get('direction') == 'out'
    ]
    category_counts = Counter(categories)
    top_categories = [cat for cat, count in category_counts.most_common(3)]
    
    # Analyze payment methods (if available)
    # Assuming digital payments have certain indicators
    digital_count = sum(
        1 for t in recent_transactions
        if t.get('merchant') or 'digital' in str(t.get('note', '')).lower()
    )
    cash_count = len(recent_transactions) - digital_count
    
    digital_ratio = int((digital_count / len(recent_transactions)) * 100) if recent_transactions else 0
    cash_ratio = 100 - digital_ratio
    
    return {
        'has_data': True,
        'total_income': round(total_income, 2),
        'total_expenses': round(total_expenses, 2),
        'top_categories': top_categories if top_categories else ['general'],
        'digital_ratio': digital_ratio,
        'cash_ratio': cash_ratio,
        'transaction_count': len(recent_transactions),
        'avg_transaction': round(total_expenses / len([t for t in recent_transactions if t.get('type') == 'expense']), 2) if any(t.get('type') == 'expense' for t in recent_transactions) else 0
    }


def determine_difficulty(level: int) -> str:
    """
    Determine quiz difficulty based on user level
    
    Args:
        level: User's current level
        
    Returns:
        Difficulty string: beginner, intermediate, or advanced
    """
    if level <= 3:
        return 'beginner'
    elif level <= 7:
        return 'intermediate'
    else:
        return 'advanced'


def build_quiz_prompt(
    user_data: Dict,
    transaction_analysis: Dict,
    difficulty: str,
    focus_area: str = 'spending_habits',
    num_questions: int = 4
) -> str:
    """
    Build structured prompt for LLM quiz generation
    
    Args:
        user_data: User profile data
        transaction_analysis: Analysis of user's transactions
        difficulty: beginner, intermediate, or advanced
        focus_area: Topic focus for the quiz
        num_questions: Number of questions to generate
        
    Returns:
        Formatted prompt string
    """
    
    # Map focus areas to French
    focus_area_fr = {
        'spending_habits': 'habitudes de dépenses',
        'payment_methods': 'méthodes de paiement',
        'budgeting': 'gestion budgétaire',
        'savings': 'épargne',
        'expense_tracking': 'suivi des dépenses',
        'income_management': 'gestion des revenus'
    }.get(focus_area, focus_area)
    
    difficulty_fr = {
        'beginner': 'débutant',
        'intermediate': 'intermédiaire',
        'advanced': 'avancé'
    }.get(difficulty, difficulty)
    
    prompt = f"""Vous êtes un coach financier bienveillant et pédagogue, spécialisé dans l'accompagnement des micro-entrepreneurs en Tunisie. Votre mission est de créer des questions éducatives qui aident l'entrepreneur à développer de bonnes habitudes financières et à prendre de meilleures décisions pour son entreprise.

🎯 OBJECTIF: Éduquer et accompagner, pas tester ou calculer!

CONTEXTE: Vous créez un quiz pour un micro-entrepreneur qui souhaite améliorer sa gestion financière. Les questions doivent être encourageantes, pratiques et faciles à comprendre.

IMPORTANT: Toutes les questions, options, explications et conseils doivent être rédigés EN FRANÇAIS.

═══════════════════════════════════════════════════════════════════════════════
PROFIL DE L'ENTREPRENEUR
═══════════════════════════════════════════════════════════════════════════════
• Niveau: {user_data.get('level', 1)} ({difficulty_fr})
• Type d'Entreprise: {user_data.get('business_type', 'petite entreprise')}
• Localisation: {user_data.get('city', 'Tunisie')}

═══════════════════════════════════════════════════════════════════════════════
SITUATION FINANCIÈRE (30 Derniers Jours)
═══════════════════════════════════════════════════════════════════════════════
• Revenus: {transaction_analysis['total_income']} TND
• Dépenses: {transaction_analysis['total_expenses']} TND
• Principales catégories de dépenses: {', '.join(transaction_analysis['top_categories'])}
• Paiements numériques: {transaction_analysis['digital_ratio']}%
• Paiements en espèces: {transaction_analysis['cash_ratio']}%

═══════════════════════════════════════════════════════════════════════════════
THÈME DU QUIZ: {focus_area_fr.upper()}
═══════════════════════════════════════════════════════════════════════════════

🎓 PRINCIPES PÉDAGOGIQUES:

1. ÉDUCATION AVANT TOUT
   - Enseigner des concepts financiers de base
   - Expliquer le "pourquoi" derrière chaque bonne pratique
   - Utiliser un langage simple et accessible
   - Éviter le jargon technique

2. ACCOMPAGNEMENT BIENVEILLANT
   - Ton encourageant et positif
   - Reconnaître les efforts de l'entrepreneur
   - Proposer des solutions réalistes et progressives
   - Pas de jugement, seulement du soutien

3. PRATIQUE ET ACTIONNABLE
   - Questions basées sur des situations réelles
   - Conseils applicables immédiatement
   - Petites actions concrètes à mettre en place
   - Focus sur les habitudes, pas les calculs complexes

4. PAS DE CALCULS COMPLIQUÉS
   - Éviter les formules mathématiques
   - Pas de pourcentages complexes à calculer
   - Focus sur les concepts et les bonnes pratiques
   - Utiliser les chiffres pour illustrer, pas pour calculer

5. 💳 ENCOURAGER L'UTILISATION DU E-WALLET (PRIORITÉ!)
   - Promouvoir les avantages des paiements numériques
   - Expliquer comment un e-wallet facilite la gestion financière
   - Montrer que c'est simple, sûr et moderne
   - Encourager la transition progressive vers le digital
   - Mettre en avant: traçabilité, sécurité, facilité de suivi

═══════════════════════════════════════════════════════════════════════════════
TYPES DE QUESTIONS À PRIVILÉGIER:
═══════════════════════════════════════════════════════════════════════════════

✅ BONNES QUESTIONS:
• "Pourquoi utiliser un e-wallet pourrait faciliter la gestion de votre entreprise?"
• "Quels avantages offre un portefeuille électronique par rapport aux espèces?"
• "Comment un e-wallet peut vous aider à mieux suivre vos transactions?"
• "Quelle habitude vous aiderait à mieux gérer votre trésorerie?"
• "Pourquoi est-il important de séparer vos finances personnelles et professionnelles?"
• "Quelle action simple pourrait améliorer votre suivi des dépenses?"
• "Comment pourriez-vous mieux anticiper les périodes de baisse d'activité?"
• "Quelle est la première étape pour créer un fonds d'urgence?"

❌ QUESTIONS À ÉVITER:
• "Calculez votre marge bénéficiaire exacte..."
• "Quel pourcentage de vos revenus devriez-vous..."
• "Si vous augmentez vos prix de X%, combien..."
• Questions avec trop de chiffres ou de calculs

═══════════════════════════════════════════════════════════════════════════════
FORMAT DE SORTIE (JSON VALIDE):
═══════════════════════════════════════════════════════════════════════════════

{{
  "questions": [
    {{
      "question_text": "Question claire et simple en français",
      "options": [
        {{"id": "A", "text": "Option A"}},
        {{"id": "B", "text": "Option B"}},
        {{"id": "C", "text": "Option C"}},
        {{"id": "D", "text": "Option D"}}
      ],
      "correct_answer": "B",
      "explanation": "Explication pédagogique qui enseigne le concept de manière simple et encourageante",
      "topic": "{focus_area}",
      "learning_tip": "Conseil pratique et encourageant que l'entrepreneur peut appliquer cette semaine"
    }}
  ]
}}

═══════════════════════════════════════════════════════════════════════════════
EXEMPLES DE BONNES QUESTIONS:
═══════════════════════════════════════════════════════════════════════════════

EXEMPLE 1 - Habitudes financières:
{{
  "question_text": "Vous remarquez que vos dépenses en {transaction_analysis['top_categories'][0] if transaction_analysis['top_categories'] else 'fournitures'} sont importantes. Quelle habitude vous aiderait à mieux les contrôler?",
  "options": [
    {{"id": "A", "text": "Arrêter complètement ces dépenses"}},
    {{"id": "B", "text": "Noter chaque dépense dans un carnet ou une application simple"}},
    {{"id": "C", "text": "Attendre la fin du mois pour faire le point"}},
    {{"id": "D", "text": "Ne rien changer, c'est normal pour une entreprise"}}
  ],
  "correct_answer": "B",
  "explanation": "Noter vos dépenses régulièrement est la première étape pour mieux les comprendre et les maîtriser. Cela vous permet de voir où va votre argent et d'identifier les dépenses inutiles. Pas besoin d'un système compliqué - un simple carnet ou une application sur votre téléphone suffit!",
  "topic": "expense_tracking",
  "learning_tip": "Cette semaine, essayez de noter toutes vos dépenses professionnelles pendant 3 jours. Vous serez surpris de ce que vous découvrirez!"
}}

EXEMPLE 2 - Planification:
{{
  "question_text": "Pourquoi est-il important de garder une réserve d'argent (fonds d'urgence) pour votre entreprise?",
  "options": [
    {{"id": "A", "text": "Pour pouvoir dépenser plus librement"}},
    {{"id": "B", "text": "Pour faire face aux imprévus sans stress (panne, baisse d'activité, etc.)"}},
    {{"id": "C", "text": "Ce n'est pas vraiment nécessaire pour une petite entreprise"}},
    {{"id": "D", "text": "Pour impressionner les clients"}}
  ],
  "correct_answer": "B",
  "explanation": "Un fonds d'urgence vous protège contre les imprévus qui peuvent arriver à tout moment: une panne d'équipement, un mois de ventes plus faibles, un client qui paie en retard... Avec cette réserve, vous pouvez gérer ces situations calmement, sans paniquer ou emprunter en urgence. C'est comme une assurance pour votre tranquillité d'esprit!",
  "topic": "savings",
  "learning_tip": "Commencez petit: essayez de mettre de côté 5% de vos revenus chaque semaine. Même 50 TND par semaine, c'est un bon début!"
}}

EXEMPLE 3 - E-Wallet et Paiements Numériques (IMPORTANT!):
{{
  "question_text": "Vous utilisez principalement des paiements en espèces ({transaction_analysis['cash_ratio']}%). Pourquoi serait-il avantageux d'utiliser un e-wallet (portefeuille électronique) pour votre entreprise?",
  "options": [
    {{"id": "A", "text": "Aucun avantage, les espèces sont toujours mieux"}},
    {{"id": "B", "text": "Suivi automatique de toutes vos transactions, plus de sécurité, et accès à des outils de gestion"}},
    {{"id": "C", "text": "C'est trop compliqué pour une petite entreprise"}},
    {{"id": "D", "text": "Seulement utile si vous avez beaucoup de clients"}}
  ],
  "correct_answer": "B",
  "explanation": "Un e-wallet vous offre plusieurs avantages importants: 1) Toutes vos transactions sont automatiquement enregistrées - fini les carnets et les oublis! 2) C'est plus sûr que de garder beaucoup d'espèces sur vous. 3) Vous pouvez voir en temps réel où va votre argent. 4) Vos clients peuvent vous payer facilement, même sans espèces. 5) Vous avez accès à des statistiques et des outils pour mieux gérer votre argent. C'est simple à utiliser et ça vous fait gagner du temps!",
  "topic": "payment_methods",
  "learning_tip": "Cette semaine, renseignez-vous sur les e-wallets disponibles et essayez d'en utiliser un pour au moins 3 transactions. Vous verrez comme c'est pratique et rassurant d'avoir tout enregistré automatiquement!"
}}

═══════════════════════════════════════════════════════════════════════════════
GÉNÉREZ MAINTENANT {num_questions} QUESTIONS ÉDUCATIVES
═══════════════════════════════════════════════════════════════════════════════

RAPPEL IMPORTANT:
✓ Ton bienveillant et encourageant
✓ Questions simples, sans calculs complexes
✓ Focus sur l'éducation et les bonnes habitudes
✓ Conseils pratiques et réalistes
✓ Langage accessible et clair
✓ TOUT EN FRANÇAIS

Créez des questions qui aident vraiment l'entrepreneur à progresser!"""
    
    return prompt


FOCUS_AREAS = {
    "spending_habits": "Questions about expense patterns and spending decisions",
    "payment_methods": "Questions about digital vs cash payments and transaction tracking",
    "budgeting": "Questions about budget planning and cash flow management",
    "savings": "Questions about saving strategies and emergency funds",
    "expense_tracking": "Questions about categorizing and monitoring expenses",
    "income_management": "Questions about revenue optimization and income sources"
}


def select_focus_area(transaction_analysis: Dict, anomalies: List[Dict] = None) -> str:
    """
    Select most relevant focus area based on user data
    
    Args:
        transaction_analysis: User's transaction analysis
        anomalies: List of detected anomalies (optional)
        
    Returns:
        Focus area string
    """
    # Priority 1: Address detected anomalies
    if anomalies:
        anomaly_types = [a.get('anomaly_type') for a in anomalies]
        if 'low_cash_runway' in anomaly_types:
            return 'budgeting'
        if 'income_drop' in anomaly_types:
            return 'income_management'
        if 'unusual_spending' in anomaly_types:
            return 'spending_habits'
    
    # Priority 2: Based on transaction patterns
    if not transaction_analysis.get('has_data'):
        return 'budgeting'  # Default for users with no data
    
    if transaction_analysis['digital_ratio'] < 30:
        return 'payment_methods'
    
    if transaction_analysis['total_expenses'] > transaction_analysis['total_income'] * 0.9:
        return 'budgeting'
    
    # Default: Rotate through topics
    return 'spending_habits'
