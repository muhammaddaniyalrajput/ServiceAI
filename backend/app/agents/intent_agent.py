"""
Intent Agent — Agent #1
Parses natural language (English / Urdu / Roman Urdu) into a structured IntentOutput.
Uses Gemini with JSON structured output to guarantee a parseable response.
"""
import json
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_fixed
from app.core.config import settings
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Urgency

client = genai.Client(api_key=settings.GEMINI_API_KEY)

SYSTEM_PROMPT = """
You are an expert intent-extraction agent for a local service booking platform in Pakistan.
Users write in English, Urdu, or Roman Urdu (Urdu written in English alphabet).

Your job is to extract the following fields from the user's request:
  - service_type : the requested service (e.g. "AC Technician", "Plumber", "Electrician")
  - location     : location mentioned (e.g. "G-13", "F-8, Islamabad")
  - datetime_hint: timing hint if any (e.g. "kal subah" = tomorrow morning, "aaj sham" = today evening)
  - urgency      : "high" | "medium" | "low"  based on context
  - language     : detected language "en" | "ur" | "roman_ur"
  - confidence   : float 0.0-1.0 for extraction confidence

EXAMPLES:
Input: "Mujhe kal subah G-13 mein AC technician chahiye"
Output: {"service_type":"AC Technician","location":"G-13, Islamabad","datetime_hint":"kal subah (tomorrow morning)","urgency":"medium","language":"roman_ur","confidence":0.97}

Input: "I need a plumber in F-8 urgently"
Output: {"service_type":"Plumber","location":"F-8, Islamabad","datetime_hint":null,"urgency":"high","language":"en","confidence":0.99}

Input: "G-13 mein bijli ki problem hai"
Output: {"service_type":"Electrician","location":"G-13, Islamabad","datetime_hint":null,"urgency":"high","language":"roman_ur","confidence":0.95}

Return ONLY valid JSON. No markdown, no extra text.
"""


@retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
def _call_gemini(text: str) -> dict:
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=f"User request: {text}",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.1,
        ),
    )
    return json.loads(response.text)


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

    try:
        raw = _call_gemini(user_text)

        urgency_val = raw.get("urgency", "medium")
        try:
            urgency = Urgency(urgency_val)
        except ValueError:
            urgency = Urgency.medium

        intent = IntentOutput(
            service_type=raw.get("service_type", "General Service"),
            location=raw.get("location", "Unknown"),
            datetime_hint=raw.get("datetime_hint"),
            urgency=urgency,
            language=raw.get("language", "en"),
            confidence=float(raw.get("confidence", 0.9)),
        )

        logs.append(log_agent(
            booking_id=booking_id,
            agent="Intent Agent",
            action="Intent extracted successfully",
            status="success",
            reasoning=(
                f"Identified service='{intent.service_type}', "
                f"location='{intent.location}', "
                f"urgency='{intent.urgency}', "
                f"language='{intent.language}', "
                f"confidence={intent.confidence:.0%}."
            ),
            data=intent.model_dump(),
        ))

        return intent, logs

    except Exception as exc:
        logs.append(log_agent(
            booking_id=booking_id,
            agent="Intent Agent",
            action="Extraction failed — using fallback",
            status="error",
            reasoning=str(exc),
        ))
        # Graceful fallback
        fallback = IntentOutput(
            service_type="General Service",
            location="Unknown",
            urgency=Urgency.medium,
            confidence=0.3,
        )
        return fallback, logs
