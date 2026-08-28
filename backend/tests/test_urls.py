"""URL validation + dedup tests (PRD §6.2 FR-JOB-01, FR-JOB-07)."""

from app.services.urls import UrlError, parse


def test_empty_input_returns_no_urls() -> None:
    result = parse([])
    assert result.urls == []
    assert result.duplicates == []
    assert result.errors == []


def test_blank_lines_are_errors_with_line_numbers() -> None:
    result = parse(["", "  ", "https://example.com"])
    assert result.accepted == 1
    assert [e.line for e in result.errors] == [1, 2]
    assert all(e.reason == "empty" for e in result.errors)


def test_missing_scheme_rejected() -> None:
    result = parse(["example.com"])
    assert result.urls == []
    assert len(result.errors) == 1
    assert result.errors[0].reason == "missing scheme"
    assert result.errors[0].line == 1


def test_non_http_scheme_rejected() -> None:
    result = parse(["ftp://example.com", "javascript:alert(1)"])
    assert result.urls == []
    reasons = [e.reason for e in result.errors]
    assert reasons == ["scheme not http(s)", "scheme not http(s)"]
    # javascript: is parsed as scheme=javascript, path=alert(1) — no host → "no host"
    # but we get "scheme not http(s)" because scheme check runs first.


def test_no_host_rejected() -> None:
    result = parse(["https://"])
    assert result.urls == []
    assert result.errors[0].reason == "no host"


def test_internal_ip_is_accepted_at_submit() -> None:
    """Internal IPs are allowed at submit; the engine's SSRF guard enforces
    at fetch time so admins can disable for intranet use (FR-SET-03)."""
    result = parse(["http://127.0.0.1/page", "http://10.0.0.1/x"])
    assert result.urls == ["http://127.0.0.1/page", "http://10.0.0.1/x"]
    assert result.errors == []


def test_dedup_is_case_insensitive_on_host_and_normalizes_path() -> None:
    result = parse(
        [
            "https://Example.com/page",
            "https://example.com/page",  # exact dup
            "HTTPS://EXAMPLE.COM/page",  # different case
            "https://example.com/other",  # different path, kept
        ]
    )
    assert result.urls == ["https://Example.com/page", "https://example.com/other"]
    assert result.duplicates == [(2, "https://example.com/page"), (3, "HTTPS://EXAMPLE.COM/page")]


def test_error_and_dup_lines_are_1_indexed() -> None:
    result = parse(
        [
            "https://example.com/a",
            "",
            "ftp://example.com",
            "https://example.com/a",  # dup
        ]
    )
    assert result.accepted == 1
    assert [e.line for e in result.errors] == [2, 3]
    assert [d[0] for d in result.duplicates] == [4]


def test_mixed_https_and_http_normalize_correctly() -> None:
    """Different schemes on the same host+path are NOT considered duplicates
    (http vs https is a real distinction for the fetch)."""
    result = parse(["http://example.com/", "https://example.com/"])
    assert result.accepted == 2


def test_errors_carry_original_text() -> None:
    result = parse(["   "])
    err: UrlError = result.errors[0]
    assert err.text == "   "  # un-stripped input preserved
    assert err.line == 1
