"""Parser for the risks-map XML file that maps kupa IDs to equity-exposure percentages."""

import xml.etree.ElementTree as ET
from pathlib import Path

from src.parsers.xml_utils import extract_data_from_xml


def parse_risk_map(path: Path) -> dict[int, float]:
    """Parse the risks-map XML and return a kupa-ID to equity-exposure mapping.

    Only rows whose ``SHM_SUG_NECHES`` field equals ``", חשיפה למניות"``
    (equity exposure) are included.

    Args:
        path: Filesystem path to the risks-map XML file.

    Returns:
        A dict mapping kupa ID integers to their equity-exposure percentage
        floats.
    """
    result = {}
    root = ET.parse(path).getroot()
    for row in root.findall("Row"):
        if extract_data_from_xml("SHM_SUG_NECHES", row) == ", חשיפה למניות":
            kupa_id = extract_data_from_xml("ID_KUPA", row, int)
            percentage = extract_data_from_xml("ACHUZ_SUG_NECHES", row, float)
            result[kupa_id] = percentage
    return result
