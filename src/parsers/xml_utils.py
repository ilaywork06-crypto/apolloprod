"""Shared XML utility helpers used across all parsers."""

from typing import Any, Type, Union
import xml.etree.ElementTree as ET


def extract_data_from_xml(
    field_name: str,
    row: Any,  # xml.etree.ElementTree.Element or lxml._Element — both accepted
    field_type: Type = str,
) -> Any:
    """Extract and cast a single field value from an XML element.

    Searches *row* for a child element (or XPath expression) matching
    *field_name*.  Returns a sensible default when the element is absent or
    has no text content.

    Args:
        field_name: Tag name or XPath expression to locate inside *row*.
        row: An ``xml.etree.ElementTree.Element`` or ``lxml._Element``
            instance to search within.
        field_type: The callable used to cast the raw text value.  Defaults
            to ``str``.  Pass ``int`` or ``float`` for numeric fields.

    Returns:
        The cast value when the element exists and has text, otherwise
        ``"N/A"`` for string fields or ``0.0`` for numeric fields.
    """
    data = row.find(field_name)
    if data is not None and data.text is not None:
        return field_type(data.text)
    return "N/A" if field_type is str else 0.0
