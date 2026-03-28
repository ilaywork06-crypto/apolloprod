"""Community feature: anonymous investor profiles and leaderboard."""

import hashlib
import json
import random
from datetime import date
from pathlib import Path

COMMUNITY_FILE = Path(__file__).parent.parent / "community.json"

ANIMALS = [
    "נשר", "דולפין", "אריה", "פנתר", "זאב", "נמר", "עיט", "ינשוף",
    "שועל", "דרקון", "נץ", "פלמינגו", "דוב", "טיגריס", "חתול",
]


def _load() -> dict:
    if COMMUNITY_FILE.exists():
        with COMMUNITY_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {"profiles": {}}


def _save(data: dict) -> None:
    with COMMUNITY_FILE.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _hash_client_id(client_id: str) -> str:
    return hashlib.sha256(client_id.encode()).hexdigest()


def _generate_fake_name(existing_names: set) -> str:
    for _ in range(200):
        name = f"{random.choice(ANIMALS)} {random.randint(10, 99)}"
        if name not in existing_names:
            return name
    return f"{random.choice(ANIMALS)} {random.randint(10, 99)}"


def join_community(client_id: str, funds: list[dict]) -> dict:
    """Create or update a community profile."""
    data = _load()
    profiles = data["profiles"]
    client_hash = _hash_client_id(client_id)

    total_amount = sum(f.get("amount", 0) for f in funds)
    if total_amount == 0:
        total_amount = 1

    funds_with_pct = []
    for f in funds:
        pct = round(f.get("amount", 0) / total_amount * 100, 1)
        funds_with_pct.append({**f, "pct_of_total": pct})

    # Weighted annual return
    weighted_tsua = sum(
        f["tsua_1"] * f["pct_of_total"] / 100 for f in funds_with_pct
    )

    # Weighted AmoScore — only funds with grade > 0
    weighted_score = sum(
        f.get("grade", 0) * f["pct_of_total"] / 100
        for f in funds_with_pct
        if f.get("grade", 0) > 0
    )

    # Weighted equity exposure (% stocks) — None if data unavailable for any fund
    funds_with_exposure = [f for f in funds_with_pct if f.get("equity_exposure") is not None]
    if funds_with_exposure:
        exposure_weight_total = sum(f["pct_of_total"] for f in funds_with_exposure)
        weighted_equity_exposure = (
            sum(f["equity_exposure"] * f["pct_of_total"] for f in funds_with_exposure)
            / exposure_weight_total
            if exposure_weight_total > 0 else None
        )
    else:
        weighted_equity_exposure = None

    # Dominant risk = risk level with highest cumulative pct_of_total (kept for filtering)
    risk_pct: dict[str, float] = {}
    for f in funds_with_pct:
        risk = f.get("risk_level", "high")
        risk_pct[risk] = risk_pct.get(risk, 0.0) + f["pct_of_total"]
    dominant_risk = max(risk_pct, key=risk_pct.get) if risk_pct else "high"

    today = date.today().strftime("%d/%m/%Y")

    existing = profiles.get(client_hash)
    if existing:
        fake_name = existing["fake_name"]
    else:
        existing_names = {p["fake_name"] for p in profiles.values()}
        fake_name = _generate_fake_name(existing_names)

    profile = {
        "fake_name": fake_name,
        "client_id_hash": client_hash,
        "weighted_tsua": round(weighted_tsua, 2),
        "weighted_score": round(weighted_score, 2),
        "dominant_risk": dominant_risk,
        "weighted_equity_exposure": round(weighted_equity_exposure, 1) if weighted_equity_exposure is not None else None,
        "joined": today,
        "funds": [
            {"name": f["name"], "id": f["id"], "pct": f["pct_of_total"]}
            for f in funds_with_pct
        ],
    }

    profiles[client_hash] = profile
    _save(data)

    return {
        "success": True,
        "profile": {
            "fake_name": profile["fake_name"],
            "weighted_tsua": profile["weighted_tsua"],
            "weighted_score": profile["weighted_score"],
            "dominant_risk": profile["dominant_risk"],
            "weighted_equity_exposure": profile["weighted_equity_exposure"],
            "funds": profile["funds"],
            "joined": profile["joined"],
        },
    }


def get_leaderboard() -> dict:
    """Return all profiles sorted by weighted_score descending."""
    data = _load()
    sorted_profiles = sorted(
        data["profiles"].values(),
        key=lambda p: p["weighted_score"],
        reverse=True,
    )
    result = []
    for p in sorted_profiles:
        joined_full = p.get("joined", "")
        try:
            parts = joined_full.split("/")
            joined_short = f"{parts[1]}/{parts[2]}" if len(parts) == 3 else joined_full
        except Exception:
            joined_short = joined_full
        result.append({
            "fake_name": p["fake_name"],
            "weighted_tsua": p["weighted_tsua"],
            "weighted_score": p["weighted_score"],
            "dominant_risk": p["dominant_risk"],
            "weighted_equity_exposure": p.get("weighted_equity_exposure"),
            "num_funds": len(p.get("funds", [])),
            "joined": joined_short,
        })
    return {"profiles": result}


def get_profile(fake_name: str) -> dict | None:
    """Return full profile details for a given fake_name, or None if not found."""
    data = _load()
    for profile in data["profiles"].values():
        if profile["fake_name"] == fake_name:
            return {
                "fake_name": profile["fake_name"],
                "weighted_tsua": profile["weighted_tsua"],
                "weighted_score": profile["weighted_score"],
                "dominant_risk": profile["dominant_risk"],
                "weighted_equity_exposure": profile.get("weighted_equity_exposure"),
                "joined": profile["joined"],
                "funds": profile.get("funds", []),
            }
    return None
