"""Parser for Mislaka (pension clearinghouse) XML files."""

# ----- Imports ----- #

import re

import lxml.etree as ET

from src.parsers.xml_utils import extract_data_from_xml

# ----- Functions ----- #


def _map_dmey_nihul(root: ET._Element, sug: int) -> dict[str, float]:
    """Build a lookup of management-fee rates by investment-track code.

    Iterates over all ``PerutMivneDmeiNihul`` elements in the XML tree and
    collects fee rates for the requested expense type (``SUG-HOTZAA``).

    Args:
        root: Root lxml element of the parsed Mislaka XML document.
        sug: Expense-type code to filter on (``1`` = accumulation fee,
            ``2`` = deposit fee).

    Returns:
        A dict mapping investment-track code strings to their fee rate floats.
    """
    result = {}
    for row in root.iter("PerutMivneDmeiNihul"):
        if extract_data_from_xml(".//SUG-HOTZAA", row, int) == sug:
            kod2 = extract_data_from_xml(".//KOD-MASLUL-DMEI-NIHUL", row)
            kod = extract_data_from_xml(".//KOD-MASLUL-HASHKAA-BAAL-DMEI-NIHUL-YECHUDIIM", row)
            dmey = extract_data_from_xml(".//SHEUR-DMEI-NIHUL", row, float)
            result[kod] = dmey
            result[kod2] = dmey
    return result


def parse_multible_mislaka_files(files: list[str]) -> list[dict]:
    """Parse multiple Mislaka file strings and combine the results.

    Args:
        files: A list of decoded Mislaka XML file strings.

    Returns:
        A flat list of investment-track dicts from all provided files.
    """
    result = []
    for file in files:
        result.extend(parse_mislaka_file(file))
    return result


def parse_mislaka_file(content: str | bytes) -> list[dict]:
    """Parse a single Mislaka XML document and extract per-track holding data.

    Strips any XML declaration before parsing (lxml requirement for
    ``fromstring``).  Management fees are resolved by taking the maximum of the
    structure-level fee and the track-level fee to ensure the most conservative
    (highest-cost) assumption is used.

    Args:
        content: The Mislaka XML document as a UTF-8 string or bytes object.

    Returns:
        A list of dicts, each representing one investment track with the
        following keys: ``GEMELNET_ID``, ``SHEM-TOCHNIT``,
        ``TAARICH-HITZTARFUT-MUTZAR``, ``TOTAL-CHISACHON-MTZBR``,
        ``SHEUR-DMEI-NIHUL-TZVIRA``, ``SHEUR-DMEI-NIHUL-HAFKADA``, and
        ``KOD-MEZAHE-YATZRAN``.
    """
    if isinstance(content, str):
        content = re.sub(r"<\?xml[^?]*\?>", "", content).strip()
        content = content.encode("utf-8")

    root = ET.fromstring(content)
    dmey_nihul_tsvira_map = _map_dmey_nihul(root, 1)
    dmey_nihul_hafkada_map = _map_dmey_nihul(root, 2)

    # Extract client ID at file level (same for all records in this file)
    mispar_zihuy_file = "unknown"
    for lakoach in root.iter("YeshutLakoach"):
        val = extract_data_from_xml(".//MISPAR-ZIHUY-LAKOACH", lakoach)
        if val and val != "N/A":
            mispar_zihuy_file = val
        break

    list_of_kupot = []
    for row in root.iter("Mutzar"):
        KOD_MEZAHE_YATZRAN = extract_data_from_xml(".//KOD-MEZAHE-YATZRAN", row)
        # Try per-Mutzar YeshutLakoach first, fall back to file-level
        mispar_zihuy = mispar_zihuy_file
        for lakoach in row.iter("YeshutLakoach"):
            val = extract_data_from_xml(".//MISPAR-ZIHUY-LAKOACH", lakoach)
            if val and val != "N/A":
                mispar_zihuy = val
            break
        for polisa in row.iter("HeshbonOPolisa"):
            SHEM_TOCHNIT = extract_data_from_xml(".//SHEM-TOCHNIT", polisa)
            TAARICH_HITZTARFUT_MUTZAR = extract_data_from_xml(
                ".//TAARICH-HITZTARFUT-MUTZAR", polisa
            )

            maslulim = polisa.findall(".//PirteiTaktziv/PerutMasluleiHashkaa")
            if not maslulim:
                maslulim = [polisa]

            for maslul in maslulim:
                SCHUM_TZVIRA_BAMASLUL = extract_data_from_xml(
                    ".//SCHUM-TZVIRA-BAMASLUL", maslul, float
                )
                KOD_MASLUL_HASHKAA = extract_data_from_xml(".//KOD-MASLUL-HASHKAA", maslul)

                FINAL_DMEI_NIHUL_TZVIRA = max(
                    dmey_nihul_tsvira_map.get(KOD_MASLUL_HASHKAA, 0.0),
                    extract_data_from_xml(".//SHEUR-DMEI-NIHUL-HISACHON-MIVNE", maslul, float),
                    extract_data_from_xml(".//SHEUR-DMEI-NIHUL-HISACHON", maslul, float),
                )
                if FINAL_DMEI_NIHUL_TZVIRA == 0.0:
                    FINAL_DMEI_NIHUL_TZVIRA = extract_data_from_xml(".//SHIUR-ALUT-SHNATIT-ZPUIA-LMSLUL-HASHKAH", maslul, float)
                FINAL_DMEI_NIHUL_HAFKADA = max(
                    dmey_nihul_hafkada_map.get(KOD_MASLUL_HASHKAA, 0.0),
                    extract_data_from_xml(".//SHEUR-DMEI-NIHUL-HAFKADA-MIVNE", polisa, float),
                    extract_data_from_xml(".//SHEUR-DMEI-NIHUL-HAFKADA", polisa, float),
                )

                kod_maslul = "fr"
                if KOD_MASLUL_HASHKAA[-6:] != "N/A":
                    kod_maslul = str(int(KOD_MASLUL_HASHKAA[-6:])).strip()

                list_of_kupot.append(
                    {
                        "GEMELNET_ID": kod_maslul,
                        "SHEM-TOCHNIT": SHEM_TOCHNIT.strip(),
                        "TAARICH-HITZTARFUT-MUTZAR": TAARICH_HITZTARFUT_MUTZAR.strip(),
                        "TOTAL-CHISACHON-MTZBR": SCHUM_TZVIRA_BAMASLUL,
                        "SHEUR-DMEI-NIHUL-TZVIRA": FINAL_DMEI_NIHUL_TZVIRA,
                        "SHEUR-DMEI-NIHUL-HAFKADA": FINAL_DMEI_NIHUL_HAFKADA,
                        "KOD-MEZAHE-YATZRAN": KOD_MEZAHE_YATZRAN.strip(),
                        "MISPAR-ZIHUY-LAKOACH": mispar_zihuy,
                    }
                )
    return list_of_kupot
