"""Offline semantic product-card extraction regressions (PRD §7.1)."""

import csv
import json
from pathlib import Path

import pytest

from app.engines.extractors import extract_structured_data
from app.engines.normalize import normalize_record
from app.exporters.csv_writer import CsvWriter

SOURCE = "https://shop.example/en/clothing/coats"


def _card(number: int, price: str = "$120.00", href: str | None = None) -> str:
    url = href if href is not None else f"/en/product/jacket/{number}.html?color=black"
    return (
        f'<div data-testid="plp-product-tile-{number}" data-mpid="{number}">'
        f'<a href="{url}"><p data-testid="plp-product-name">Jacket {number}</p></a>'
        f'<span data-testid="plp-product-price">{price}</span></div>'
    )


def test_semantic_cards_with_empty_json_ld() -> None:
    html = (
        '<script type="application/ld+json">'
        '{"@type":"ItemList","itemListElement":[]}</script>'
        + _card(1)
        + _card(2, '<span class="skeleton-loader">000</span>')
    )
    rows = extract_structured_data(html, SOURCE)
    assert len(rows) == 2
    assert rows[0]["name"] == "Jacket 1"
    assert rows[0]["product_id"] == "1"
    assert rows[0]["url"] == "https://shop.example/en/product/jacket/1.html?color=black"
    assert rows[0]["price"] == "$120.00"
    assert rows[1]["price"] is None
    json.dumps(rows)


@pytest.mark.parametrize(
    "wrapper",
    [
        "<nav>{}</nav>",
        "<header>{}</header>",
        "<div hidden>{}</div>",
        '<div aria-hidden="true">{}</div>',
        '<div role="navigation">{}</div>',
    ],
)
def test_semantic_cards_reject_navigation_and_hidden_content(wrapper: str) -> None:
    assert extract_structured_data(wrapper.format(_card(1) + _card(2)), SOURCE) == []


def test_single_semantic_card_becomes_dataset_row() -> None:
    rows = extract_structured_data(_card(1), SOURCE)
    assert len(rows) == 1
    assert rows[0]["type"] == "product"
    assert rows[0]["name"] == "Jacket 1"
    assert rows[0]["product_id"] == "1"
    assert rows[0]["price"] == "$120.00"
    assert rows[0]["url"] == "https://shop.example/en/product/jacket/1.html?color=black"


def test_semantic_cards_require_explicit_markers() -> None:
    assert (
        extract_structured_data(
            '<div><h2>Clothing</h2><a href="/coats">Coats</a></div>'
            '<div><h2>Accessories</h2><a href="/hats">Hats</a></div>',
            SOURCE,
        )
        == []
    )


def test_semantic_cards_deduplicate_nested_cards_but_keep_variants() -> None:
    html = '<div class="product-card">' + _card(1) + _card(2) + "</div>"
    html += _card(1) + _card(1, href="/en/product/jacket/1.html?color=blue")
    rows = extract_structured_data(html, SOURCE)
    assert len(rows) == 3
    assert rows[-1]["url"].endswith("?color=blue")


@pytest.mark.parametrize("href", ["javascript:void(0)", "#", "", "mailto:test@example.com"])
def test_semantic_cards_reject_non_web_links(href: str) -> None:
    rows = extract_structured_data(_card(1) + _card(2) + _card(3, href=href), SOURCE)
    assert len(rows) == 2


def test_semantic_cards_preserve_json_ld_priority() -> None:
    html = (
        '<script type="application/ld+json">'
        '{"@type":"Product","name":"Structured product"}</script>' + _card(1) + _card(2)
    )
    rows = extract_structured_data(html, SOURCE)
    assert len(rows) == 1
    assert rows[0]["name"] == "Structured product"


def test_semantic_cards_normalize_to_exportable_rows(tmp_path: Path) -> None:
    record = normalize_record("target", SOURCE, html=_card(1) + _card(2, ""))
    assert record.metadata["item_count"] == 2
    assert record.metadata["schema"] == "product"
    rows = record.metadata["items"]
    path = tmp_path / "products.csv"
    writer = CsvWriter()
    writer.open(path, list(rows[0]))
    try:
        for row in rows:
            writer.write_row(row)
    finally:
        writer.close()
    assert path.read_bytes().startswith(b"\xef\xbb\xbf")
    with path.open(encoding="utf-8-sig", newline="") as stream:
        exported = list(csv.DictReader(stream))
    assert [row["name"] for row in exported] == ["Jacket 1", "Jacket 2"]
    assert exported[1]["price"] == ""
