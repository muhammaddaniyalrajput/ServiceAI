"""
Intent Agent — Agent #1
Parses natural language (English / Urdu / Roman Urdu) into a structured IntentOutput.
Uses Gemini with JSON structured output to guarantee a parseable response.

Includes:
  - Exponential backoff retry with 429-specific handling
  - Regex fallback parser when Gemini is completely unavailable
  - Request deduplication (same text within 10s returns cached result)
"""
import re
import json
import time
import hashlib
import logging
from google import genai
from google.genai import types
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from app.core.config import settings
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Urgency

logger = logging.getLogger("serviceflow")

client = genai.Client(api_key=settings.GEMINI_API_KEY)

# ── Request deduplication cache ───────────────────────────────────────────────
_dedup_cache: dict = {}  # hash -> (result_dict, timestamp)
DEDUP_TTL_SECONDS = 10


def _get_cached(text: str) -> dict | None:
    h = hashlib.md5(text.strip().lower().encode()).hexdigest()
    entry = _dedup_cache.get(h)
    if entry and (time.time() - entry[1]) < DEDUP_TTL_SECONDS:
        logger.debug("Intent dedup cache hit for hash=%s", h[:8])
        return entry[0]
    return None


def _set_cached(text: str, result: dict):
    h = hashlib.md5(text.strip().lower().encode()).hexdigest()
    _dedup_cache[h] = (result, time.time())
    # Evict old entries
    now = time.time()
    stale = [k for k, v in _dedup_cache.items() if now - v[1] > 60]
    for k in stale:
        del _dedup_cache[k]


# ── System Prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """
You are an expert intent-extraction agent for a local service booking platform in Pakistan.
Users write in English, Urdu, or Roman Urdu (Urdu written in English alphabet).

Your job is to extract the following fields from the user's request:
  - service_type : the requested service (e.g. "AC Technician", "Plumber", "Electrician", "Painter", "Carpenter", "House Cleaner")
  - location     : location mentioned (e.g. "G-13, Islamabad", "F-8, Islamabad", "DHA Phase 2, Islamabad")
  - datetime_hint: timing hint if any (e.g. "kal subah" = tomorrow morning, "aaj sham" = today evening, "abhi" = right now)
  - urgency      : "high" | "medium" | "low"  based on context
  - language     : detected language "en" | "ur" | "roman_ur"
  - confidence   : float 0.0-1.0 for extraction confidence

IMPORTANT SERVICE MAPPING RULES:
  - "AC", "AC wala", "AC repair", "AC service", "air conditioner" → "AC Technician"
  - "plumber", "pani wala", "naali", "plumbing" → "Plumber"
  - "bijli", "electrician", "wiring", "light" → "Electrician"
  - "rang", "paint", "painter", "rangsaz", "paint wala" → "Painter"
  - "carpenter", "barhai", "mistri", "mistry", "lakri" → "Carpenter"
  - "safai", "cleaning", "cleaner", "safai wala" → "House Cleaner"

LOCATION RULES:
  - If a sector is mentioned (G-13, F-8, I-10, etc.), append ", Islamabad" if not already present
  - If "Bahria Town", "DHA", "Blue Area" is mentioned, include the full name
  - If no location is mentioned, set location to "Not specified"

URGENCY RULES:
  - "urgent", "jaldi", "abhi", "foran", "emergency" → "high"
  - "kal", "tomorrow", "parso" → "medium"
  - Default → "medium"
  - "koi jaldi nahi", "jab bhi ho" → "low"

EXAMPLES:
Input: "Mujhe kal subah G-13 mein AC technician chahiye"
Output: {"service_type":"AC Technician","location":"G-13, Islamabad","datetime_hint":"kal subah (tomorrow morning)","urgency":"medium","language":"roman_ur","confidence":0.97}

Input: "I need a plumber in F-8 urgently"
Output: {"service_type":"Plumber","location":"F-8, Islamabad","datetime_hint":null,"urgency":"high","language":"en","confidence":0.99}

Input: "G-13 mein bijli ki problem hai"
Output: {"service_type":"Electrician","location":"G-13, Islamabad","datetime_hint":null,"urgency":"high","language":"roman_ur","confidence":0.95}

Input: "AC wala chahiye abhi I-8 mein"
Output: {"service_type":"AC Technician","location":"I-8, Islamabad","datetime_hint":"abhi (right now)","urgency":"high","language":"roman_ur","confidence":0.96}

Input: "Kal sham ko painter chahiye G-11 mein ghar paint karna hai"
Output: {"service_type":"Painter","location":"G-11, Islamabad","datetime_hint":"kal sham (tomorrow evening)","urgency":"medium","language":"roman_ur","confidence":0.95}

Input: "mujhy safai wala chahiye F-10 mein"
Output: {"service_type":"House Cleaner","location":"F-10, Islamabad","datetime_hint":null,"urgency":"medium","language":"roman_ur","confidence":0.92}

Return ONLY valid JSON. No markdown, no extra text.
"""


# ── Regex Fallback Parser ─────────────────────────────────────────────────────

# Service patterns (order matters — more specific first)
_SERVICE_PATTERNS = [
    (r'\b(?:ac\s*(?:technician|repair|service|wala)?|air\s*condition(?:er|ing)?)\b', "AC Technician"),
    (r'\b(?:plumb(?:er|ing)|pani\s*wala|naali)\b', "Plumber"),
    (r'\b(?:electric(?:ian|al)?|bijli|wiring|light\s*(?:problem|issue)?)\b', "Electrician"),
    (r'\b(?:paint(?:er|ing)?|rang(?:saz)?|paint\s*wala)\b', "Painter"),
    (r'\b(?:carpenter|carpentry|barhai|mistr[iy]|lakri)\b', "Carpenter"),
    (r'\b(?:clean(?:er|ing)?|safai(?:\s*wala)?|house\s*clean)\b', "House Cleaner"),
]

# Location patterns for Islamabad sectors
_LOCATION_PATTERN = re.compile(
    r'\b([A-Za-z]-\d{1,2})\b'  # Matches G-13, F-8, I-10, etc.
    r'|(?:bahria\s*town)'
    r'|(?:dha(?:\s*phase\s*\d)?)'
    r'|(?:blue\s*area)',
    re.IGNORECASE,
)

# Time patterns
_TIME_PATTERNS = [
    (r'\b(?:abhi|foran|right\s*now|immediately)\b', "abhi (right now)", "high"),
    (r'\b(?:kal\s*subah|tomorrow\s*morning)\b', "kal subah (tomorrow morning)", "medium"),
    (r'\b(?:kal\s*sham|tomorrow\s*evening)\b', "kal sham (tomorrow evening)", "medium"),
    (r'\b(?:kal|tomorrow)\b', "kal (tomorrow)", "medium"),
    (r'\b(?:aaj\s*sham|today\s*evening|this\s*evening)\b', "aaj sham (today evening)", "medium"),
    (r'\b(?:aaj|today)\b', "aaj (today)", "medium"),
    (r'\b(?:parso|day\s*after\s*tomorrow)\b', "parso (day after tomorrow)", "low"),
]

# Urgency patterns
_URGENCY_PATTERNS = [
    (r'\b(?:urgent(?:ly)?|jaldi|abhi|foran|emergency|asap)\b', "high"),
    (r'\b(?:koi\s*jaldi\s*nahi|jab\s*bhi|no\s*rush|whenever)\b', "low"),
]


def _regex_fallback_parser(text: str) -> dict:
    """
    Extract intent from text using regex patterns.
    Used when Gemini API is completely unavailable.
    """
    text_lower = text.lower().strip()

    # Extract service
    service_type = "General Service"
    for pattern, service_name in _SERVICE_PATTERNS:
        if re.search(pattern, text_lower):
            service_type = service_name
            break

    # Extract location
    location = "Not specified"
    loc_match = _LOCATION_PATTERN.search(text)
    if loc_match:
        matched = loc_match.group(0).strip()
        # Normalize sector format: g-13 → G-13
        if re.match(r'^[a-zA-Z]-\d+$', matched):
            matched = matched.upper()
        location = f"{matched}, Islamabad"

    # Extract time hint and urgency from time
    datetime_hint = None
    time_urgency = None
    for pattern, hint, urg in _TIME_PATTERNS:
        if re.search(pattern, text_lower):
            datetime_hint = hint
            time_urgency = urg
            break

    # Extract urgency (explicit urgency overrides time-based)
    urgency = "medium"
    for pattern, urg in _URGENCY_PATTERNS:
        if re.search(pattern, text_lower):
            urgency = urg
            break
    if time_urgency and urgency == "medium":
        urgency = time_urgency

    # Detect language
    urdu_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    roman_urdu_words = len(re.findall(
        r'\b(?:mujh[ey]|chahiye|karna|wala|hai|mein|subah|sham|kal|aaj|bijli|safai|naali|jaldi|abhi)\b',
        text_lower
    ))
    if urdu_chars > 3:
        language = "ur"
    elif roman_urdu_words >= 2:
        language = "roman_ur"
    else:
        language = "en"

    confidence = 0.5
    if service_type != "General Service":
        confidence += 0.2
    if location != "Not specified":
        confidence += 0.15
    if datetime_hint:
        confidence += 0.05

    return {
        "service_type": service_type,
        "location": location,
        "datetime_hint": datetime_hint,
        "urgency": urgency,
        "language": language,
        "confidence": round(min(confidence, 0.85), 2),  # Cap at 0.85 for fallback
    }


# ── Gemini API Call with Exponential Backoff ──────────────────────────────────

@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _call_gemini(text: str) -> dict:
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=f"User request: {text}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.1,
            http_options=types.HttpOptions(timeout=20_000),
        ),
    )
    return json.loads(response.text)


# ── Main Agent Entry Point ────────────────────────────────────────────────────

def run_intent_agent(booking_id: str, user_text: str) -> tuple[IntentOutput, list]:
    """
    Returns (IntentOutput, list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Intent Agent",
        action="Analyzing user request",
        status="processing",
        reasoning=f"Received text: '{user_text}'. Calling Gemini for intent extraction.",
    ))

    # Check dedup cache first
    cached = _get_cached(user_text)
    if cached:
        logger.info("Intent Agent: returning deduplicated cached result")
        raw = cached
        used_fallback = False
    else:
        # Try Gemini first, fall back to regex
        used_fallback = False
        try:
            raw = _call_gemini(user_text)
            _set_cached(user_text, raw)
        except Exception as gemini_exc:
            logger.warning(
                "Intent Agent: Gemini failed after retries (%s). Using regex fallback.",
                gemini_exc,
            )
            logs.append(log_agent(
                booking_id=booking_id,
                agent="Intent Agent",
                action="Gemini unavailable — using regex parser",
                status="processing",
                reasoning=f"Gemini error: {gemini_exc}. Falling back to rule-based extraction.",
            ))
            raw = _regex_fallback_parser(user_text)
            used_fallback = True

    # Build IntentOutput
    urgency_val = raw.get("urgency", "medium")
    try:
        urgency = Urgency(urgency_val)
    except ValueError:
        urgency = Urgency.medium

    intent = IntentOutput(
        service_type=raw.get("service_type", "General Service"),
        location=raw.get("location", "Not specified"),
        datetime_hint=raw.get("datetime_hint"),
        urgency=urgency,
        language=raw.get("language", "en"),
        confidence=float(raw.get("confidence", 0.9)),
    )

    extraction_method = "regex fallback parser" if used_fallback else "Gemini AI"
    logs.append(log_agent(
        booking_id=booking_id,
        agent="Intent Agent",
        action="Intent extracted successfully",
        status="success",
        reasoning=(
            f"[{extraction_method}] "
            f"Identified service='{intent.service_type}', "
            f"location='{intent.location}', "
            f"urgency='{intent.urgency}', "
            f"language='{intent.language}', "
            f"confidence={intent.confidence:.0%}."
        ),
        data=intent.model_dump(),
    ))

    return intent, logs
