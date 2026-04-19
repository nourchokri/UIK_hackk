import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

DEMO_TEXT = """CAFE ARTISAN MARRAKECH
123 Avenue Mohammed V, Marrakech, Maroc
Tel: +212 524 123 456
Date: 11/04/2026  Time: 14:32
Receipt No: REC-2026-04789
Café Americano (x2)       48.00 MAD
Jus d'Orange Frais (x1)   28.00 MAD
Croissant Beurre (x1)     22.00 MAD
Salade César (x1)         65.00 MAD
Eau Minérale 50cl (x1)    12.00 MAD
Sous-total:               175.00 MAD
TVA (10%):                 17.50 MAD
TOTAL:                    192.50 MAD"""

_ocr_instance = None


def _get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        from paddleocr import PaddleOCR
        # Configuration optimisée pour factures tunisiennes
        _ocr_instance = PaddleOCR(
            use_angle_cls=True,  # Détection de l'angle
            lang="fr",  # Langue française
            show_log=False,
            use_gpu=False,
            det_db_thresh=0.3,  # Seuil de détection plus bas pour mieux détecter le texte
            det_db_box_thresh=0.5,  # Seuil de boîte
            rec_batch_num=6,  # Batch size pour reconnaissance
            use_space_char=True,  # Reconnaître les espaces
        )
    return _ocr_instance


def is_demo():
    return os.getenv("DEMO_MODE", "false").lower() == "true" or not os.getenv("LLM_API_KEY", "").strip()


def extract_text(image_path: str) -> dict:
    if is_demo():
        logger.info("[OCR] Demo mode")
        return {"rawText": DEMO_TEXT, "confidence": 0.97}

    # PDF: try direct text extraction first
    if image_path.lower().endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(image_path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            if len(text.strip()) > 50:
                logger.info("[OCR] PDF text extracted directly")
                return {"rawText": text.strip(), "confidence": 0.98}
        except Exception as e:
            logger.warning(f"[OCR] PDF direct extraction failed: {e}")

    # PaddleOCR for images (and PDFs without embedded text)
    try:
        # Prétraitement de l'image pour améliorer l'OCR
        preprocessed_path = _preprocess_image(image_path)
        
        ocr = _get_ocr()
        result = ocr.ocr(preprocessed_path, cls=True)
        lines = [item[1][0] for page in result if page for item in page]
        text = "\n".join(lines)
        
        # Nettoyer le fichier prétraité
        if preprocessed_path != image_path and os.path.exists(preprocessed_path):
            os.remove(preprocessed_path)
        
        logger.info(f"[OCR] Extracted {len(lines)} lines")
        return {"rawText": text, "confidence": 0.95}
    except Exception as e:
        logger.error(f"[OCR] PaddleOCR failed: {e}")
        raise RuntimeError(f"OCR failed: {e}")


def _preprocess_image(image_path: str) -> str:
    """Prétraite l'image pour améliorer la qualité OCR"""
    try:
        from PIL import Image, ImageEnhance, ImageFilter
        import tempfile
        
        img = Image.open(image_path)
        
        # Convertir en niveaux de gris
        img = img.convert('L')
        
        # Augmenter le contraste
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
        
        # Augmenter la netteté
        img = img.filter(ImageFilter.SHARPEN)
        
        # Sauvegarder dans un fichier temporaire
        temp_path = tempfile.mktemp(suffix='.png')
        img.save(temp_path, 'PNG', quality=95)
        
        logger.info(f"[OCR] Image preprocessed: {temp_path}")
        return temp_path
    except Exception as e:
        logger.warning(f"[OCR] Preprocessing failed, using original: {e}")
        return image_path
