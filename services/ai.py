import json
import logging
import os
import re

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

DEMO_INSIGHTS = {
    "missedUpsells": [
        {
            "item": "Café Americano",
            "suggestion": "Propose un Latte ou Cappuccino à +8 MAD — 40% des clients café commandent une boisson lactée",
            "estimatedRevenue": 8,
            "confidence": 0.85,
            "severity": "high",
        }
    ],
    "bundleOpportunities": [
        {
            "items": ["Café Americano", "Croissant Beurre"],
            "bundleName": "Formule Petit-Déjeuner",
            "suggestedPrice": 62,
            "currentSeparatePrice": 70,
            "rationale": "Bundle à -11% déclenche 35% de conversions supplémentaires.",
            "severity": "high",
        }
    ],
    "pricingIssues": [],
    "customerBehaviorInsights": [],
    "overallScore": 72,
    "summary": "3 opportunités haute valeur détectées.",
}

DEMO_STRUCTURED_DATA = {
    "entreprise": "CAFE ARTISAN MARRAKECH",
    "adresse": "123 Avenue Mohammed V, Marrakech, Maroc",
    "facture_numero": "REC-2026-04789",
    "mf": None,
    "date": "2026-04-11T14:32:00.000Z",
    "articles": [
        {"designation": "Café Americano", "tva": 10.0, "quantite": 2, "prix_unitaire": 24.0, "remise": 0, "prix_total": 48.0},
        {"designation": "Jus d'Orange Frais", "tva": 10.0, "quantite": 1, "prix_unitaire": 28.0, "remise": 0, "prix_total": 28.0},
    ],
    "totaux": {
        "sous_total_ht": 175.0,
        "remise": 0,
        "total_ht": 175.0,
        "tva": 17.5,
        "timbre_fiscal": 0,
        "total_ttc": 192.5,
    },
    "devise": "MAD",
}


def _is_demo():
    return os.getenv("DEMO_MODE", "false").lower() == "true" or not os.getenv("LLM_API_KEY", "").strip()


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        pass
    block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if block:
        try:
            return json.loads(block.group(1))
        except Exception:
            pass
    obj = re.search(r"\{[\s\S]*\}", text)
    if obj:
        try:
            return json.loads(obj.group(0))
        except Exception:
            pass
    raise ValueError("Could not parse JSON from LLM response")


def extract_structured_fields(raw_ocr_text: str) -> dict:
    if _is_demo():
        logger.info("[AI] Demo mode: returning mock structured data")
        return DEMO_STRUCTURED_DATA

    from services.llm import client, MODEL

    system_prompt = """Tu es un expert en extraction de données de factures tunisiennes B2B.
Tu dois extraire EXACTEMENT les champs demandés du texte OCR fourni.

RÈGLES STRICTES:
- Réponds UNIQUEMENT avec du JSON valide, sans texte avant ni après
- Si un champ n'est pas trouvé, mets null
- Respecte exactement la structure JSON demandée
- Les prix doivent être des nombres (pas de strings)
- Les pourcentages doivent être des nombres (7.0 pour 7%)

RÈGLES SPÉCIALES POUR L'EXTRACTION:
- IMPORTANT: Les 2 PREMIÈRES lignes non-vides du texte OCR sont TOUJOURS:
  * Ligne 1 = entreprise (nom de l'entreprise)
  * Ligne 2 = adresse (adresse complète de l'entreprise)
- Extrait ces deux lignes EXACTEMENT comme elles apparaissent dans le texte OCR
- Si tu vois "Facture N°" ou "Facture No" ou "N°", le nombre qui suit est le numéro de facture
- Si tu vois "M.F" ou "MF" ou "Matricule Fiscal", le code qui suit est le matricule fiscal
- Pour les articles, cherche les lignes avec: désignation (nom), TVA%, quantité, prix unitaire, remise%, prix total
- Pour les totaux, fais TRÈS ATTENTION à la différence:
  * sous_total_ht = somme des prix_total de tous les articles AVANT remise globale
  * remise = remise globale appliquée sur le sous-total (peut être 0)
  * total_ht = sous_total_ht - remise (montant HT après remise)
  * tva = montant de la TVA calculée sur total_ht
  * timbre_fiscal = timbre fiscal (généralement 1.000 TND)
  * total_ttc = total_ht + tva + timbre_fiscal
- Fais attention à bien différencier les champs de la facture (en-tête) des articles (lignes de produits)

STRUCTURE JSON REQUISE:
{
  "entreprise": "EXACTEMENT la première ligne non-vide du texte OCR",
  "adresse": "EXACTEMENT la deuxième ligne non-vide du texte OCR",
  "facture_numero": "numéro de facture (cherche après 'Facture N°' ou 'N°')",
  "mf": "matricule fiscal (cherche après 'M.F' ou 'MF')",
  "date": "date au format ISO (cherche 'Date:' ou format JJ/MM/AAAA)",
  "articles": [
    {
      "designation": "nom complet de l'article/produit 1",
      "tva": 7.0,
      "quantite": 33,
      "prix_unitaire": 100.0,
      "remise": 10.0,
      "prix_total": 2970.0
    },
    {
      "designation": "nom complet de l'article/produit 2",
      "tva": 7.0,
      "quantite": 5,
      "prix_unitaire": 50.0,
      "remise": 0,
      "prix_total": 250.0
    }
  ],
  "totaux": {
    "sous_total_ht": 3300.0,
    "remise": 330.0,
    "total_ht": 2970.0,
    "tva": 207.9,
    "timbre_fiscal": 1.0,
    "total_ttc": 3178.9
  },
  "devise": "TND"
}

IMPORTANT POUR LES ARTICLES:
- Extrait TOUS les articles de la facture, pas seulement le premier
- Chaque ligne de produit/service doit être un objet séparé dans le tableau "articles"
- Si la facture a 5 articles, le tableau doit contenir 5 objets
- Ne limite JAMAIS le nombre d'articles extraits

CALCUL DES TOTAUX (IMPORTANT):
- sous_total_ht = somme de tous les prix_total des articles (avant remise globale)
- Si remise globale existe: total_ht = sous_total_ht - remise
- Si pas de remise globale: total_ht = sous_total_ht (et remise = 0)
- tva = montant TVA sur le total_ht
- total_ttc = total_ht + tva + timbre_fiscal

EXEMPLE D'EXTRACTION:
Si le texte OCR commence par:
"SOCIETE EXEMPLE SARL
123 Avenue Habib Bourguiba, Tunis
Facture N° 123456..."

Alors:
- entreprise = "SOCIETE EXEMPLE SARL"
- adresse = "123 Avenue Habib Bourguiba, Tunis"
- facture_numero = "123456"
"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extrait les champs structurés de cette facture:\n\n{raw_ocr_text}"},
        ],
        max_tokens=2000,
        temperature=0.1,
    )
    content = response.choices[0].message.content or ""
    logger.info(f"[AI] Structured extraction OK ({len(content)} chars)")
    return _parse_json(content)


def analyze_receipt(parsed_data: dict, merchant_history: list = None) -> dict:
    if _is_demo():
        logger.info("[AI] Demo mode: returning mock insights")
        return DEMO_INSIGHTS

    from services.llm import client, MODEL

    history_context = ""
    if merchant_history:
        history_context = f"\n\nHistorique des {len(merchant_history)} dernières transactions:\n"
        history_context += json.dumps(
            [
                {
                    "date": r.get("parsedData", {}).get("date"),
                    "total": (r.get("parsedData") or {}).get("totaux", {}).get("total_ttc")
                    or (r.get("parsedData") or {}).get("total"),
                    "items": [i.get("designation") or i.get("name") for i in (r.get("parsedData") or {}).get("articles", (r.get("parsedData") or {}).get("items", []))],
                }
                for r in merchant_history
            ],
            indent=2,
        )

    system_prompt = """Tu es un analyste en intelligence commerciale retail.
Tu analyses des données de tickets de caisse pour identifier des opportunités d'optimisation du CA.

RÈGLES STRICTES:
- Réponds UNIQUEMENT avec du JSON valide
- Référence les vrais noms de produits et prix
- Sois spécifique et actionnable

SCHÉMA JSON REQUIS:
{
  "missedUpsells": [{"item":"","suggestion":"","estimatedRevenue":0,"confidence":0.0,"severity":""}],
  "bundleOpportunities": [{"items":[],"bundleName":"","suggestedPrice":0,"currentSeparatePrice":0,"rationale":"","severity":""}],
  "pricingIssues": [{"item":"","issue":"","severity":"","recommendation":""}],
  "customerBehaviorInsights": [{"pattern":"","frequency":"","actionableAdvice":"","severity":""}],
  "overallScore": 0,
  "summary": ""
}"""

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyse ce ticket:\n\n{json.dumps(parsed_data, indent=2)}{history_context}"},
        ],
        max_tokens=2000,
        temperature=0.1,
    )
    content = response.choices[0].message.content or ""
    logger.info("[AI] Analysis OK")
    return _parse_json(content)


def generate_weekly_summary(receipts: list) -> dict:
    if _is_demo() or not receipts:
        return {
            "topActions": [
                {"priority": 1, "action": "Lancer le bundle Petit-Déjeuner", "impact": "+850 MAD/semaine"},
                {"priority": 2, "action": "Augmenter le prix de l'eau à 15 MAD", "impact": "+180 MAD/semaine"},
            ],
            "totalPotentialRevenue": 1450,
            "period": "Cette semaine",
        }

    from services.llm import client, MODEL

    aggregated = [
        {
            "date": r.get("parsedData", {}).get("date"),
            "total": (r.get("parsedData") or {}).get("totaux", {}).get("total_ttc") or (r.get("parsedData") or {}).get("total"),
            "items": [i.get("designation") or i.get("name") for i in (r.get("parsedData") or {}).get("articles", (r.get("parsedData") or {}).get("items", []))],
        }
        for r in receipts[:50]
    ]

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "user",
                "content": f"Basé sur ces {len(receipts)} transactions, donne le TOP 3 des actions prioritaires.\nRéponds en JSON: {{\"topActions\":[{{\"priority\":1,\"action\":\"\",\"impact\":\"\"}}],\"totalPotentialRevenue\":0,\"period\":\"Cette semaine\"}}\n\nDonnées: {json.dumps(aggregated)}",
            }
        ],
        max_tokens=600,
        temperature=0.1,
    )
    return _parse_json(response.choices[0].message.content or "")
