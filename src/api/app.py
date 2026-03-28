"""FastAPI application entry point for the Apollo fund comparison service."""

# ----- License check ----- #

import datetime

_EXPIRY = datetime.date(2026, 4, 30)
if datetime.date.today() > _EXPIRY:
    print("\n" + "=" * 60)
    print("  גרסת הניסיון פגה ב-30/04/2026")
    print("  Trial version expired on 30/04/2026")
    print("  לחידוש הרישיון, צור קשר עם ספק התוכנה.")
    print("  To renew, contact the software provider.")
    print("=" * 60 + "\n")
    raise SystemExit(1)

# ----- Imports ----- #

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel

from src.community import get_leaderboard, get_profile, join_community
from src.core.engine import run_comparison


# ----- Community request models ----- #


class FundInput(BaseModel):
    name: str
    id: str
    risk_level: str
    tsua_1: float
    grade: float
    amount: float
    pct_of_total: float = 0.0
    equity_exposure: float | None = None


class JoinRequest(BaseModel):
    client_id: str
    funds: list[FundInput]


APP = FastAPI()

APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Static frontend (React build) ----- #

_FRONTEND_BUILD = Path(__file__).parent.parent.parent / "frontend" / "web" / "build"
if _FRONTEND_BUILD.exists():
    APP.mount("/static", StaticFiles(directory=str(_FRONTEND_BUILD / "static")), name="static")


# ----- API routes ----- #


@APP.post("/compare")
async def compare(
    weight_1: int = Form(),
    weight_3: int = Form(),
    weight_5: int = Form(),
    low_exposure_threshold: int = Form(),
    medium_exposure_threshold: int = Form(),
    weight_sharp: int = Form(),
    mislaka_file: list[UploadFile] = File(...),
    bad_hevrot: list[str] = Form([]),
) -> dict:
    """Run a fund comparison based on uploaded Mislaka files and user-supplied weights."""
    l_con = []
    for file in mislaka_file:
        mislaka_content = (await file.read()).decode("utf-8-sig")
        l_con.append(mislaka_content)
    content = run_comparison(
        mislaka_file=l_con,
        weight_1=weight_1,
        weight_3=weight_3,
        weight_5=weight_5,
        weight_sharp=weight_sharp,
        low_exposure_threshold=low_exposure_threshold,
        medium_exposure_threshold=medium_exposure_threshold,
        bad_hevrot=bad_hevrot,
    )
    return content


@APP.post("/community/join")
async def community_join(body: JoinRequest) -> dict:
    """Create or update an anonymous community profile for the given client."""
    funds = [f.model_dump() for f in body.funds]
    return join_community(body.client_id, funds)


@APP.get("/community/leaderboard")
async def community_leaderboard() -> dict:
    """Return all community profiles sorted by score."""
    return get_leaderboard()


@APP.get("/community/profile/{fake_name}")
async def community_profile(fake_name: str) -> dict:
    """Return full profile details for the given fake_name."""
    profile = get_profile(fake_name)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@APP.get("/health")
async def health() -> dict:
    """Return a simple health-check response."""
    return {"status": "ok"}


@APP.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    """Serve the React frontend for all non-API routes."""
    index = _FRONTEND_BUILD / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return {"error": "Frontend not built"}


if __name__ == "__main__":
    uvicorn.run(
        "src.api.app:APP",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
