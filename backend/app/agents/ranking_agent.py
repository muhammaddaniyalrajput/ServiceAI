"""
Ranking Agent — Agent #3
Scores each provider using a weighted multi-factor algorithm.
Uses Gemini to add human-readable reasoning for the top pick.
"""
import json
from typing import List
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_fixed
from app.core.config import settings
from app.core.logger import log_agent
from app.models.schemas import IntentOutput, Provider, RankedProvider, Urgency

client = genai.Client(api_key=settings.GEMINI_API_KEY)

# ── Scoring weights ───────────────────────────────────────────────────────────
WEIGHTS = {
    "rating":       0.35,
    "distance":     0.30,
    "price":        0.20,
    "experience":   0.10,
    "verified":     0.05,
}

MAX_DISTANCE_KM = 30.0
MAX_PRICE       = 3000


def _score_provider(provider: Provider, urgency: Urgency) -> float:
    """Compute a normalized 0–100 composite score."""
    dist = provider.distance_km or MAX_DISTANCE_KM

    # If urgent, heavily penalise far providers
    dist_multiplier = 1.5 if urgency == Urgency.high else 1.0
    norm_dist  = max(0, 1 - (dist * dist_multiplier) / MAX_DISTANCE_KM)
    norm_rate  = provider.rating / 5.0
    norm_price = max(0, 1 - provider.hourly_rate / MAX_PRICE)
    norm_exp   = min(provider.experience_yrs / 15.0, 1.0)
    norm_ver   = 1.0 if provider.is_verified else 0.0

    score = (
        WEIGHTS["rating"]     * norm_rate  +
        WEIGHTS["distance"]   * norm_dist  +
        WEIGHTS["price"]      * norm_price +
        WEIGHTS["experience"] * norm_exp   +
        WEIGHTS["verified"]   * norm_ver
    ) * 100

    return round(score, 2)


def _reason_text(provider: Provider, score: float, urgency: Urgency) -> str:
    reasons = []
    if provider.rating >= 4.7:
        reasons.append(f"outstanding rating of {provider.rating}")
    if (provider.distance_km or 99) <= 2:
        reasons.append(f"very close at {provider.distance_km} km")
    if provider.hourly_rate <= 1200:
        reasons.append(f"budget-friendly at PKR {provider.hourly_rate}/hr")
    if provider.is_verified:
        reasons.append("platform-verified")
    if provider.experience_yrs >= 8:
        reasons.append(f"{provider.experience_yrs} years of experience")
    if urgency == Urgency.high and (provider.distance_km or 99) <= 3:
        reasons.append("ideal for urgent request")

    reason_str = ", ".join(reasons) if reasons else "balanced score across all factors"
    return f"Score {score:.1f}/100 — Selected because: {reason_str}."


@retry(stop=stop_after_attempt(2), wait=wait_fixed(1))
def _gemini_ranking_summary(top_provider: Provider, others: List[Provider], intent: IntentOutput) -> str:
    """Ask Gemini to produce a short reasoning summary for the selection."""
    prompt = f"""
You are a service ranking assistant.
The user wants: {intent.service_type} at {intent.location} (urgency: {intent.urgency}).

The selected provider is: {top_provider.name} (rating={top_provider.rating}, distance={top_provider.distance_km}km, rate=PKR{top_provider.hourly_rate}/hr, verified={top_provider.is_verified}).

Other candidates were: {[p.name for p in others[:3]]}.

Write ONE short paragraph (2-3 sentences) explaining why this provider was the best choice.
Be specific, use numbers, and sound confident. Write in English.
"""
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=types.GenerateContentConfig(temperature=0.4, max_output_tokens=150),
    )
    return response.text.strip()


def run_ranking_agent(
    booking_id: str,
    providers: List[Provider],
    intent: IntentOutput,
) -> tuple[List[RankedProvider], list]:
    """
    Returns (list[RankedProvider] sorted best→worst, list[AgentLog])
    """
    logs = []

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Ranking Agent",
        action="Scoring providers",
        status="processing",
        reasoning=f"Evaluating {len(providers)} providers using weighted algorithm (rating, distance, price, experience, verification).",
    ))

    scored: List[RankedProvider] = []
    for p in providers:
        score = _score_provider(p, intent.urgency)
        reason = _reason_text(p, score, intent.urgency)
        scored.append(RankedProvider(provider=p, score=score, score_reason=reason))

    scored.sort(key=lambda x: x.score, reverse=True)
    top = scored[0]

    # Enhance top-pick reasoning via Gemini
    try:
        ai_reasoning = _gemini_ranking_summary(
            top_provider=top.provider,
            others=[r.provider for r in scored[1:]],
            intent=intent,
        )
        top = RankedProvider(
            provider=top.provider,
            score=top.score,
            score_reason=ai_reasoning,
        )
        scored[0] = top
    except Exception:
        pass  # Fallback to algorithmic reason already set

    logs.append(log_agent(
        booking_id=booking_id,
        agent="Ranking Agent",
        action="Ranking complete",
        status="success",
        reasoning=top.score_reason,
        data={
            "top_provider": top.provider.name,
            "score": top.score,
            "all_scores": {r.provider.name: r.score for r in scored},
        },
    ))

    return scored, logs
