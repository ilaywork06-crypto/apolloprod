"""Comparison engine that ranks pension/provident funds for a given client portfolio."""

# ----- Imports ----- #

import copy
from pathlib import Path
from typing import Optional

from src.core import risk_classifier
from src.parsers.fund_parser import parse_xml_file
from src.parsers.mislaka_parser import parse_multible_mislaka_files

# ----- Constants ----- #

_DATA_DIR = Path(__file__).parent.parent.parent / "data"
GEMEL_NET_PATH = _DATA_DIR / "kupot_gemel_net.xml"
RISKS_MAP_PATH = _DATA_DIR / "risks_map.xml"

# Fixed default weights used for community comparisons (fair, user-independent)
DEFAULT_WEIGHT_1 = 10
DEFAULT_WEIGHT_3 = 20
DEFAULT_WEIGHT_5 = 25
DEFAULT_WEIGHT_SHARP = 45

# Parse static data once at startup
risk_classifier.load(RISKS_MAP_PATH)

# ----- Functions ----- #


def find_matching_kupot(
    mislaka_list: list[dict], kupot_list: list[dict]
) -> list[tuple[dict, dict]]:
    """Match each Mislaka entry to its corresponding kupa in the GemeNet list.

    Args:
        mislaka_list: Parsed records from one or more Mislaka XML files.
        kupot_list: Full list of kupa records from the GemeNet XML file.

    Returns:
        A list of ``(mislaka_record, kupa_record)`` pairs where the GemeNet ID
        found in the Mislaka record exists in the kupa lookup table.
    """
    kupot_by_id = {kupa["ID"]: kupa for kupa in kupot_list}
    return [
        (mislaka, kupot_by_id[mislaka["GEMELNET_ID"]])
        for mislaka in mislaka_list
        if mislaka["GEMELNET_ID"] in kupot_by_id
    ]


def get_kupot_by_risk_level(kupot_list: list[dict], risk_level: str) -> list[dict]:
    """Filter a list of kupot to only those matching the given risk level.

    Args:
        kupot_list: List of kupa dicts, each containing a ``risk_level`` key.
        risk_level: The target risk level string (e.g. ``"low"``, ``"medium"``,
            ``"high"``).

    Returns:
        A filtered list of kupa dicts whose ``risk_level`` equals *risk_level*.
    """
    return [kupa for kupa in kupot_list if kupa["risk_level"] == risk_level]


def apply_dmey_nihul(kupot_list: list[dict], dmey_nihul: float) -> list[dict]:
    """Subtract management fees from the return fields of each kupa in-place.

    Only subtracts when the return value is positive, to avoid distorting kupot
    with missing or zero data.

    Args:
        kupot_list: List of kupa dicts to adjust (modified in-place).
        dmey_nihul: Annual management-fee percentage to deduct.

    Returns:
        The same list with adjusted return values.
    """
    for kupa in kupot_list:
        if kupa["tsua_5"] > 0.0:
            kupa["tsua_5"] -= dmey_nihul
        if kupa["tsua_3"] > 0.0:
            kupa["tsua_3"] -= dmey_nihul
        if kupa["tsua_mitztaberet_letkufa"] > 0.0:
            kupa["tsua_mitztaberet_letkufa"] -= dmey_nihul
    return kupot_list


def normalize_data(kupot_list: list[dict]) -> None:
    """Add min-max normalised variants (0–100) of the key performance fields.

    For each of the four performance fields, a new ``<field>_normalized`` key
    is added to every kupa dict.  Kupot with a raw value of ``0.0`` receive a
    normalised score of ``0.0`` without affecting the normalisation range.

    Args:
        kupot_list: List of kupa dicts to enrich with normalised fields
            (modified in-place).
    """
    fields = [
        "sharp_ribit_hasarot_sikun",
        "tsua_5",
        "tsua_3",
        "tsua_mitztaberet_letkufa",
    ]
    for field in fields:
        values = [kupa[field] for kupa in kupot_list if kupa[field] != 0.0]
        min_value = min(values)
        max_value = max(values)
        for kupa in kupot_list:
            if kupa[field] != 0.0:
                kupa[field + "_normalized"] = (
                    (kupa[field] - min_value) / (max_value - min_value) * 100
                    if max_value > min_value
                    else 0.0
                )
            else:
                kupa[field + "_normalized"] = 0.0


def calculate_grade(
    kupa: dict,
    weight_1: int,
    weight_3: int,
    weight_5: int,
    weight_sharp: int,
) -> float:
    """Compute a weighted composite score for a single kupa.

    All four normalised metrics must be non-zero for a grade to be calculated;
    otherwise ``0`` is returned to indicate insufficient data.

    Args:
        kupa: Kupa dict that already contains normalised performance fields.
        weight_1: Weight for the 1-year cumulative return (normalised).
        weight_3: Weight for the 3-year average annual return (normalised).
        weight_5: Weight for the 5-year average annual return (normalised).
        weight_sharp: Weight for the Sharpe ratio (normalised).

    Returns:
        A weighted composite score rounded to two decimal places, or ``0`` if
        any of the required normalised fields are zero.
    """
    weights = {}

    if kupa.get("tsua_mitztaberet_letkufa_normalized") != 0.0:
        weights["tsua_mitztaberet_letkufa_normalized"] = weight_1
    if kupa.get("tsua_3_normalized") != 0.0:
        weights["tsua_3_normalized"] = weight_3
    if kupa.get("tsua_5_normalized") != 0.0:
        weights["tsua_5_normalized"] = weight_5
    if kupa.get("sharp_ribit_hasarot_sikun_normalized") != 0.0:
        weights["sharp_ribit_hasarot_sikun_normalized"] = weight_sharp

    if not weights:
        return 0
    total_weight = sum(weights.values())
    if total_weight != 100:
        return 0
    grade = 0
    for field, weight in weights.items():
        grade += kupa[field] * (weight / total_weight)
    return round(grade, 2)


def add_grade_and_sort(
    kupot_list: list[dict],
    weight_1: int,
    weight_3: int,
    weight_5: int,
    weight_sharp: int,
) -> list[dict]:
    """Assign a composite grade to each kupa and return them sorted descending.

    Args:
        kupot_list: List of kupa dicts with normalised performance fields.
        weight_1: Weight for the 1-year cumulative return metric.
        weight_3: Weight for the 3-year average annual return metric.
        weight_5: Weight for the 5-year average annual return metric.
        weight_sharp: Weight for the Sharpe ratio metric.

    Returns:
        The same list sorted from highest grade to lowest, with a ``grade``
        key added to every kupa dict.
    """
    for kupa in kupot_list:
        kupa["grade"] = calculate_grade(kupa, weight_1, weight_3, weight_5, weight_sharp)

    return sorted(kupot_list, key=lambda x: x["grade"], reverse=True)


def get_top_3(sorted_kupot: list[dict]) -> list[dict]:
    """Return the top three kupot from an already-sorted list.

    Args:
        sorted_kupot: Kupot list sorted from best to worst grade.

    Returns:
        The first three elements of *sorted_kupot* (fewer if the list is
        shorter than three).
    """
    return sorted_kupot[:3]


def get_client_ranking(
    sorted_kupot: list[dict], client_kupa_id: str
) -> tuple[Optional[int], int]:
    """Find the 1-based rank of the client's kupa within a sorted list.

    Args:
        sorted_kupot: Kupot list sorted from best to worst grade.
        client_kupa_id: The ``ID`` string of the client's current kupa.

    Returns:
        A tuple of ``(rank, total)`` where *rank* is the 1-based position of
        the client's kupa (or ``None`` if not found) and *total* is the length
        of *sorted_kupot*.
    """
    for i, kupa in enumerate(sorted_kupot):
        if kupa["ID"] == client_kupa_id:
            return i + 1, len(sorted_kupot)
    return None, len(sorted_kupot)


def calculate_potential_amount(
    current_amount: float, current_kupa: dict, better_kupa: dict
) -> float:
    """Estimate the portfolio value if the client switched to a better kupa.

    The projection applies the difference in 1-year cumulative returns between
    the two kupot to the client's current savings balance.

    Args:
        current_amount: The client's current accumulated savings balance.
        current_kupa: Dict for the client's current kupa (must contain
            ``tsua_mitztaberet_letkufa``).
        better_kupa: Dict for the comparison kupa (must contain
            ``tsua_mitztaberet_letkufa``).

    Returns:
        The projected balance rounded to two decimal places.
    """
    diff = better_kupa["tsua_mitztaberet_letkufa"] - current_kupa["tsua_mitztaberet_letkufa"]
    potential = current_amount * (1 + diff / 100)
    return round(potential, 2)


def run_comparison(
    mislaka_file: list[str],
    weight_1: int,
    weight_3: int,
    weight_5: int,
    weight_sharp: int,
    low_exposure_threshold: float,
    medium_exposure_threshold: float,
    bad_hevrot: list[str],
) -> dict:
    """Orchestrate the full fund comparison for all holdings in the Mislaka files.

    For each matched holding the function:
    * filters peer kupot by fund type and risk level,
    * applies the client's management fee,
    * normalises and grades every peer,
    * builds a response payload with the client's kupa details, ranked
      alternatives at the same risk level, and (if applicable) the best
      available high-risk kupa as a ``golden`` option.

    Args:
        mislaka_file: List of decoded Mislaka XML file strings.
        weight_1: Weight for the 1-year cumulative return metric.
        weight_3: Weight for the 3-year average annual return metric.
        weight_5: Weight for the 5-year average annual return metric.
        weight_sharp: Weight for the Sharpe ratio metric.

    Returns:
        A dict with a ``funds`` key containing a list of per-holding result
        dicts, each with ``client``, ``alternatives``, and ``golden`` keys.
    """
    koput_list = parse_xml_file(GEMEL_NET_PATH, low_exposure_threshold, medium_exposure_threshold, bad_hevrot)
    mislaka_list = parse_multible_mislaka_files(mislaka_file)
    matches = find_matching_kupot(mislaka_list, koput_list)
    funds_list = []

    for mislaka, kupa in matches:
        sug = kupa["SUG"]
        our_koput = [k for k in koput_list if k["SUG"] == sug]
        risk_level = kupa["risk_level"]
        dmey_nihul = mislaka["SHEUR-DMEI-NIHUL-TZVIRA"]

        all_kopot_in_risk_level = get_kupot_by_risk_level(our_koput, risk_level)
        adjusted_kupot = apply_dmey_nihul(copy.deepcopy(all_kopot_in_risk_level), dmey_nihul)
        normalize_data(adjusted_kupot)
        sorted_kupot = add_grade_and_sort(adjusted_kupot, weight_1, weight_3, weight_5, weight_sharp)
        top_3 = get_top_3(sorted_kupot)
        client_ranking, total_kupot = get_client_ranking(sorted_kupot, kupa["ID"])
        client_kupa = next(k for k in sorted_kupot if k["ID"] == kupa["ID"])

        # Calculate default_grade using fixed community weights (for fair cross-user comparison)
        default_sorted = add_grade_and_sort(
            copy.deepcopy(adjusted_kupot),
            DEFAULT_WEIGHT_1, DEFAULT_WEIGHT_3, DEFAULT_WEIGHT_5, DEFAULT_WEIGHT_SHARP,
        )
        default_client_kupa = next(k for k in default_sorted if k["ID"] == kupa["ID"])
        money = mislaka["TOTAL-CHISACHON-MTZBR"]
        if money == 0:
            continue

        client = {
            "name": client_kupa["shem_kupa"],
            "id": client_kupa["ID"],
            "client_id": mislaka.get("MISPAR-ZIHUY-LAKOACH", "unknown"),
            "grade": client_kupa["grade"],
            "default_grade": default_client_kupa["grade"],
            "rank": client_ranking,
            "total_in_risk": total_kupot,
            "risk_level": risk_level,
            "amount": money,
            "dmei_nihul": dmey_nihul,
            "tsua_1": round(client_kupa["tsua_mitztaberet_letkufa"], 2),
            "tsua_3": round(client_kupa["tsua_3"], 2),
            "tsua_5": round(client_kupa["tsua_5"], 2),
            "hevra": client_kupa["hevra"],
            "seniority_date": mislaka["TAARICH-HITZTARFUT-MUTZAR"],
            "percentile": round((total_kupot - client_ranking) / total_kupot * 100),
            "equity_exposure": client_kupa.get("equity_exposure"),
        }

        golden = {}
        if risk_level != "high":
            all_koput_in_high_risk_level = get_kupot_by_risk_level(our_koput, "high")
            golden_adjusted_koput = apply_dmey_nihul(copy.deepcopy(all_koput_in_high_risk_level), dmey_nihul)
            normalize_data(golden_adjusted_koput)
            golden_sorted_kupot = add_grade_and_sort(
                golden_adjusted_koput, weight_1, weight_3, weight_5, weight_sharp
            )
            better_gold = get_top_3(golden_sorted_kupot)[0]
            potential_amount_gold = calculate_potential_amount(money, client_kupa, better_gold)
            golden = {
                "name": better_gold["shem_kupa"],
                "id": better_gold["ID"],
                "grade": better_gold["grade"],
                "rank": 1,
                "hevra": better_gold["hevra"],
                "tsua_1": round(better_gold["tsua_mitztaberet_letkufa"], 2),
                "tsua_3": round(better_gold["tsua_3"], 2),
                "tsua_5": round(better_gold["tsua_5"], 2),
                "potential_amount": potential_amount_gold,
                "diff": round(potential_amount_gold - money, 2),
                "diff_percent": round((potential_amount_gold - money) / money * 100, 1),
            }

        alternatives = []
        kupa_rank = 1
        for better_kupa in top_3:
            if better_kupa["ID"] != client_kupa["ID"]:
                potential_amount = calculate_potential_amount(money, client_kupa, better_kupa)
                alt = {
                    "name": better_kupa["shem_kupa"],
                    "id": better_kupa["ID"],
                    "grade": better_kupa["grade"],
                    "rank": kupa_rank,
                    "hevra": better_kupa["hevra"],
                    "tsua_1": round(better_kupa["tsua_mitztaberet_letkufa"], 2),
                    "tsua_3": round(better_kupa["tsua_3"], 2),
                    "tsua_5": round(better_kupa["tsua_5"], 2),
                    "potential_amount": potential_amount,
                    "diff": round(potential_amount - money, 2),
                    "diff_percent": round((potential_amount - money) / money * 100, 1),
                }
                alternatives.append(alt)
            kupa_rank += 1

        funds_list.append({"client": client, "alternatives": alternatives, "golden": golden})

    return {"funds": funds_list}
