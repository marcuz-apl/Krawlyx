"""Structured data extractors for e-commerce, vehicle listings, and JSON-LD schemas."""

from __future__ import annotations

import datetime
import json
import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

logger = logging.getLogger("mykrawl.engines.extractors")


def extract_structured_data(
    html: str, source_url: str, options: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Extract structured records from HTML (Custom Schema, AutoTrader, JSON-LD, Microdata)."""
    if not html:
        return []

    options = options or {}
    items: list[dict[str, Any]] = []

    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception as exc:
        logger.warning("BeautifulSoup parsing failed: %s", exc)
        return []

    # 1. Custom User-Defined Schema (if specified in options)
    custom_schema = options.get("custom_schema")
    if custom_schema and isinstance(custom_schema, dict) and custom_schema.get("fields"):
        custom_items = _extract_custom_schema(soup, source_url, custom_schema)
        if custom_items:
            return custom_items

    # 2. Check for AutoTrader / Car marketplace data
    domain = urlparse(source_url).netloc.lower()
    if "autotrader.ca" in domain or "autotrader" in domain:
        at_items = _extract_nextjs_marketplace(soup, source_url)
        if at_items:
            return at_items

    # 3. Check for __NEXT_DATA__ listings on other Next.js platforms
    next_data_el = soup.find("script", id="__NEXT_DATA__")
    if next_data_el and next_data_el.string:
        try:
            nd = json.loads(next_data_el.string)
            props = nd.get("props", {}).get("pageProps", {})
            raw_listings = props.get("listings") or props.get("products") or props.get("items")
            if isinstance(raw_listings, list) and raw_listings:
                return _normalize_generic_listings(raw_listings, source_url)
        except Exception:
            pass

    # 4. Check for JSON-LD structured schemas
    ld_items = _extract_json_ld(soup, source_url)
    if ld_items:
        return ld_items

    # 5. Semantic DOM fallback: repeated card clusters for hydrated SPAs that
    # ship no machine-readable metadata (their JSON-LD/`__NEXT_DATA__` is
    # empty and products only exist as rendered tiles).
    card_items = _extract_semantic_cards(soup, source_url)
    if card_items:
        return card_items

    return items


def _extract_semantic_cards(soup: BeautifulSoup, source_url: str) -> list[dict[str, Any]]:
    """Conservative fallback for repeated, explicitly marked product cards.

    Do not infer products from arbitrary repeated links or guess missing prices.
    Keep variant query strings: different colours may legitimately be separate rows.
    """
    marker = re.compile(r"(?:^|[-_])product[-_](?:card|tile)(?:$|[-_])", re.I)
    candidates = []
    for tag in soup.find_all(["div", "li", "article"]):
        labels = [str(tag.get("data-testid", "")), *tag.get("class", [])]
        if not any(marker.search(label) for label in labels):
            continue
        if tag.find_parent(["nav", "header", "footer", "aside"]):
            continue
        if any(
            parent.has_attr("hidden")
            or parent.get("aria-hidden") == "true"
            or parent.get("role") in {"navigation", "menu"}
            for parent in [tag, *tag.parents]
        ):
            continue
        candidates.append(tag)

    candidate_ids = {id(tag) for tag in candidates}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    today = datetime.date.today().isoformat()
    for card in candidates:
        # Nested wrappers must not duplicate a tile or merge several inner tiles.
        if any(id(child) in candidate_ids for child in card.find_all(True)):
            continue
        name_el = card.select_one(
            '[data-testid*="product-name"], [itemprop="name"], '
            ".product-name, .product-title, h2, h3"
        )
        if name_el is None:
            continue
        name = name_el.get_text(" ", strip=True)
        if not name:
            continue
        anchor = name_el.find_parent("a", href=True)
        if anchor is None or not any(parent is card for parent in anchor.parents):
            anchor = card.find("a", href=True)
        if anchor is None:
            continue
        href = str(anchor.get("href", "")).strip()
        if not href or href.startswith("#"):
            continue
        url = urljoin(source_url, href)
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or url in seen:
            continue
        price_el = card.select_one(
            '[data-testid*="product-price"], [itemprop="price"], .product-price, .price'
        )
        price = None
        if price_el is not None:
            value = str(price_el.get("content") or price_el.get_text(" ", strip=True))
            loading = price_el.select_one('[class*="skeleton"], [aria-busy="true"]')
            if (
                not loading
                and "skeleton" not in " ".join(price_el.get("class", []))
                and price_el.get("aria-busy") != "true"
                and re.search(r"\d", value)
            ):
                price = value
        rows.append(
            {
                "type": "product",
                "name": name,
                "url": url,
                "product_id": card.get("data-mpid") or card.get("data-product-id"),
                "price": price,
                "date_observed": today,
            }
        )
        seen.add(url)
    return rows


def _clean_numeric(val: Any) -> int | None:
    """Extract clean pure integer from string or numeric value."""
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return int(val)
    import re

    clean = re.sub(r"[^\d]", "", str(val))
    if clean:
        try:
            return int(clean)
        except ValueError:
            return None
    return None


def _extract_custom_schema(
    soup: BeautifulSoup, source_url: str, schema: dict[str, Any]
) -> list[dict[str, Any]]:
    """Extract rows using user-defined custom fields (up to 20 fields)."""
    raw_fields = schema.get("fields") or []
    # Cap at 20 fields max
    fields = [f for f in raw_fields if isinstance(f, dict) and f.get("name")][:20]
    if not fields:
        return []

    item_selector = (schema.get("item_selector") or "").strip()
    today = datetime.date.today().isoformat()
    rows: list[dict[str, Any]] = []

    # Repeating container mode (e.g. each card / product)
    containers = soup.select(item_selector) if item_selector else []

    if containers:
        for card in containers:
            row: dict[str, Any] = {
                "type": "custom_schema",
                "date_observed": today,
                "source_url": source_url,
            }
            for f in fields:
                fname = f["name"].strip()
                selector = (f.get("selector") or "").strip()
                attr = (f.get("attribute") or "text").strip().lower()

                val = None
                if selector:
                    el = card.select_one(selector)
                    if el:
                        if attr == "href":
                            val = el.get("href")
                            if val and not val.startswith("http"):
                                val = urljoin(source_url, val)
                        elif attr == "src":
                            val = el.get("src")
                            if val and not val.startswith("http"):
                                val = urljoin(source_url, val)
                        else:
                            val = " ".join(el.get_text().split())
                else:
                    # Heuristic search by field name within the card
                    el = card.find(
                        lambda e: (
                            fname.lower() in (e.get("class", []) or "")
                            or fname.lower() in (e.get("id", "") or "")
                        )
                    )
                    if el:
                        val = " ".join(el.get_text().split())

                row[fname] = val or ""
            rows.append(row)
    else:
        # Single page mode (1 record for this page)
        row = {"type": "custom_schema", "date_observed": today, "source_url": source_url}
        for f in fields:
            fname = f["name"].strip()
            selector = (f.get("selector") or "").strip()
            attr = (f.get("attribute") or "text").strip().lower()

            val = None
            if selector:
                el = soup.select_one(selector)
                if el:
                    if attr == "href":
                        val = el.get("href")
                        if val and not val.startswith("http"):
                            val = urljoin(source_url, val)
                    elif attr == "src":
                        val = el.get("src")
                        if val and not val.startswith("http"):
                            val = urljoin(source_url, val)
                    else:
                        val = " ".join(el.get_text().split())

            row[fname] = val or ""
        rows.append(row)

    return rows


def _extract_nextjs_marketplace(soup: BeautifulSoup, source_url: str) -> list[dict[str, Any]]:
    """Extract vehicle listing rows from AutoTrader.ca HTML."""
    next_data_el = soup.find("script", id="__NEXT_DATA__")
    if not next_data_el or not next_data_el.string:
        return []

    try:
        nd = json.loads(next_data_el.string)
        page_props = nd.get("props", {}).get("pageProps", {})
        listings = page_props.get("listings", [])
        # Single vehicle detail page support (VDP)
        if not listings and page_props.get("listing"):
            listings = [page_props["listing"]]
    except Exception as exc:
        logger.warning("failed to parse __NEXT_DATA__: %s", exc)
        return []

    today = datetime.date.today().isoformat()
    rows: list[dict[str, Any]] = []

    for listing in listings:
        veh = listing.get("vehicle") or {}
        seller = listing.get("seller") or {}
        loc = listing.get("location") or {}
        pr = listing.get("price") or {}
        desc = str(listing.get("description") or "")
        trim = str(veh.get("modelVersionInput") or listing.get("trim") or "")
        title = str(listing.get("title") or "")
        combined_text = (
            f"{desc} {trim} {title} {json.dumps(listing.get('vehicleDetails') or [])}".upper()
        )

        # Robust drivetrain detection
        drivetrain = veh.get("drivetrain") or "Unknown"
        if drivetrain == "Unknown" or not drivetrain:
            if any(
                k in combined_text for k in ["4WD", "4X4", "FOUR WHEEL DRIVE", "FOUR-WHEEL DRIVE"]
            ):
                drivetrain = "4WD"
            elif any(
                k in combined_text
                for k in [
                    "AWD",
                    "ALL WHEEL DRIVE",
                    "ALL-WHEEL DRIVE",
                    "XDRIVE",
                    "4MATIC",
                    "QUATTRO",
                ]
            ):
                drivetrain = "AWD"
            elif any(k in combined_text for k in ["RWD", "REAR WHEEL DRIVE", "REAR-WHEEL DRIVE"]):
                drivetrain = "RWD"
            elif any(k in combined_text for k in ["FWD", "FRONT WHEEL DRIVE", "FRONT-WHEEL DRIVE"]):
                drivetrain = "FWD"

        # Year detection fallback
        year = veh.get("modelYear")
        if not year:
            import re

            m = re.search(r"\b(19\d\d|20[0-3]\d)\b", f"{title} {source_url}")
            if m:
                year = int(m.group(1))

        # Mileage detection fallback & clean to pure integer
        raw_mileage = veh.get("mileageInKm")
        if not raw_mileage and listing.get("vehicleDetails"):
            for vd in listing.get("vehicleDetails", []):
                if isinstance(vd, dict) and "mileage" in str(vd.get("ariaLabel", "")).lower():
                    raw_mileage = vd.get("data")
                    break
        mileage_km = _clean_numeric(raw_mileage)

        # Images
        images = listing.get("images") or []
        image_url = images[0] if images else None

        # Clean listing URL
        rel_url = listing.get("url")
        listing_url = None
        if rel_url:
            if rel_url.startswith("http"):
                listing_url = rel_url
            else:
                listing_url = urljoin(source_url, rel_url)

        # Clean seller type
        seller_type = (
            "Dealer" if seller.get("dealer") or seller.get("type") == "Dealer" else "Private"
        )

        rows.append(
            {
                "type": "vehicle_listing",
                "year": year,
                "make": veh.get("make"),
                "model": veh.get("modelGroup") or veh.get("model"),
                "trim": trim or None,
                "drivetrain": drivetrain,
                "mileage": mileage_km,
                "mileage_km": mileage_km,
                "price": (
                    pr.get("priceRaw")
                    or pr.get("priceFormatted")
                    or pr.get("price")
                    or pr.get("amount")
                    or pr.get("value")
                )
                if isinstance(pr, dict)
                else (pr or listing.get("price")),
                "seller_type": seller_type,
                "city": loc.get("city"),
                "province": loc.get("provinceCode"),
                "dealer_name": seller.get("companyName"),
                "date_observed": today,
                "listing_url": listing_url or source_url,
                "image_url": image_url,
                "transmission": veh.get("transmission"),
                "fuel": veh.get("fuel"),
            }
        )

    return rows


def _extract_json_ld(soup: BeautifulSoup, source_url: str) -> list[dict[str, Any]]:
    """Extract schema.org items from application/ld+json tags."""
    rows: list[dict[str, Any]] = []
    today = datetime.date.today().isoformat()

    for script in soup.find_all("script", type="application/ld+json"):
        if not script.string:
            continue
        try:
            data = json.loads(script.string)
        except Exception:
            continue

        entries = data if isinstance(data, list) else [data]
        for item in entries:
            if not isinstance(item, dict):
                continue
            item_type = item.get("@type")
            if item_type in {"Vehicle", "Car", "Product"}:
                rows.append(
                    {
                        "type": str(item_type).lower(),
                        "name": item.get("name"),
                        "brand": item.get("brand", {}).get("name")
                        if isinstance(item.get("brand"), dict)
                        else item.get("brand"),
                        "model": item.get("model"),
                        "price": item.get("offers", {}).get("price")
                        if isinstance(item.get("offers"), dict)
                        else None,
                        "currency": item.get("offers", {}).get("priceCurrency")
                        if isinstance(item.get("offers"), dict)
                        else None,
                        "date_observed": today,
                        "url": item.get("url") or source_url,
                    }
                )
            elif item_type == "ItemList":
                for sub in item.get("itemListElement", []):
                    if isinstance(sub, dict) and "item" in sub and isinstance(sub["item"], dict):
                        sub_item = sub["item"]
                        rows.append(
                            {
                                "name": sub_item.get("name"),
                                "url": sub_item.get("url") or source_url,
                                "date_observed": today,
                            }
                        )

    return rows


def _normalize_generic_listings(raw_listings: list[Any], source_url: str) -> list[dict[str, Any]]:
    today = datetime.date.today().isoformat()
    rows = []
    for item in raw_listings:
        if isinstance(item, dict):
            clean_item = dict(item)
            clean_item["date_observed"] = today
            clean_item["source_url"] = source_url
            rows.append(clean_item)
    return rows
