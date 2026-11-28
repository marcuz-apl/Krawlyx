"""Render template bodies into plain text and a styled HTML email.

Supports a safe subset of Markdown: **bold**, *italic*, `code`,
[links](https://…), "- " bullet lists, and #/## headings. Input is
HTML-escaped before formatting.
"""

from __future__ import annotations

import html as html_lib
import re

SIGNATURE_NAME = "Krawlyx Team"
SIGNATURE_EMAIL = "info@alfazen.org"
SIGNATURE_WEB = "www.alfazen.org"

_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_CODE_RE = re.compile(r"`([^`]+)`")


def _inline(text: str) -> str:
    out = html_lib.escape(text)
    out = _LINK_RE.sub(r'<a href="\2" style="color:#4f46e5;text-decoration:underline;">\1</a>', out)
    out = _BOLD_RE.sub(r"<strong>\1</strong>", out)
    out = _ITALIC_RE.sub(r"<em>\1</em>", out)
    out = _CODE_RE.sub(
        r'<code style="background:#f1f5f9;padding:1px 4px;border-radius:4px;">\1</code>', out
    )
    return out


def markdown_to_html(text: str) -> str:
    blocks: list[str] = []
    paragraph: list[str] = []
    bullets: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            inner = "<br>".join(_inline(line) for line in paragraph)
            blocks.append(f'<p style="margin:0 0 14px;">{inner}</p>')
            paragraph.clear()

    def flush_bullets() -> None:
        if bullets:
            items = "".join(f'<li style="margin:0 0 6px;">{_inline(item)}</li>' for item in bullets)
            blocks.append(f'<ul style="margin:0 0 14px;padding-left:20px;">{items}</ul>')
            bullets.clear()

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush_paragraph()
            flush_bullets()
            continue
        if line.startswith("## "):
            flush_paragraph()
            flush_bullets()
            blocks.append(f'<h3 style="margin:0 0 12px;font-size:15px;">{_inline(line[3:])}</h3>')
            continue
        if line.startswith("# "):
            flush_paragraph()
            flush_bullets()
            blocks.append(f'<h2 style="margin:0 0 12px;font-size:17px;">{_inline(line[2:])}</h2>')
            continue
        if line.startswith("- "):
            flush_paragraph()
            bullets.append(line[2:])
            continue
        flush_bullets()
        paragraph.append(line)
    flush_paragraph()
    flush_bullets()
    return "\n".join(blocks)


def plain_with_signature(body: str) -> str:
    return f"{body.rstrip()}\n\n{SIGNATURE_NAME}\nEmail: {SIGNATURE_EMAIL}\nWeb: {SIGNATURE_WEB}\n"


def html_email(body: str) -> str:
    content = markdown_to_html(body)
    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:18px 24px;">
                <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">Krawlyx</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:14px;line-height:1.6;">
                {content}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 22px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
                <strong style="color:#334155;">{SIGNATURE_NAME}</strong><br>
                Email: <a href="mailto:{SIGNATURE_EMAIL}" style="color:#4f46e5;">{SIGNATURE_EMAIL}</a><br>
                Web: <a href="https://{SIGNATURE_WEB}" style="color:#4f46e5;">{SIGNATURE_WEB}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
