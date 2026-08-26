# Side doc: NiceGUI vs Flet — pure-Python UI frameworks

| | |
| --- | --- |
| **Status** | Reference / ADR companion to PRD §4.4 |
| **Date** | 2026-08-26 |
| **Decision on record** | zenCrawl ships a React + TypeScript SPA (PRD §4.4). This doc evaluates the pure-Python alternatives for completeness. |

## TL;DR

Both let you build a UI without writing JavaScript. For a web-only admin tool
like zenCrawl, **NiceGUI is the stronger fit**; Flet's differentiator (one codebase
→ desktop + mobile binaries) solves a problem zenCrawl doesn't have. Neither was
chosen: the typed-client maintainability of the React path won.

## The two contenders

### NiceGUI (~v3.x, MIT)

Write the entire UI in Python; it renders through Vue 3 + Quasar and talks to the
browser over WebSocket/socket.io, so state changes push live without you writing
any client code. It runs *on FastAPI* — same server, same process model as
zenCrawl's backend.

- 100+ built-in components (Quasar-based Material Design), plus Tailwind support.
- `ui.refreshable` and `ui.timer` make live job progress nearly free.
- Real AG Grid integration — excellent for the results browser.
- Optional native desktop windows (pywebview); auto-reload dev mode.
- Renders real DOM → Playwright/E2E testing works normally.

### Flet (0.8x, Apache-2.0, pre-1.0)

Python wrapper around **Flutter** (Google's UI toolkit). Same Python code can be
packaged as a web app, Windows/macOS/Linux desktop app, or iOS/Android app via
`flet build`. Web output runs Flutter's canvas renderer (now WASM-first).

- True multi-platform distribution from one codebase — its killer feature.
- Material + Cupertino widget sets, built-in routing/theming.
- Currently mid-way through a ground-up rewrite toward 1.0 (0.70 alpha → 0.80
  beta → 0.90 RC → 1.0): API churn risk is real until 1.0 lands.
- Web output is canvas, not DOM → text selection, accessibility, and
  Playwright-selector-based testing are weaker.

## Comparison for zenCrawl's needs

| Dimension | NiceGUI | Flet |
| --- | --- | --- |
| Runtime model | FastAPI server + WebSocket push (same stack as backend) | Flutter client ↔ Python bridge (server or WASM/Pyodide) |
| Targets | Browser, optional desktop window | Web, Windows/macOS/Linux, iOS/Android |
| Look & feel | Material by default; Tailwind/CSS escape hatch | Material/Cupertino theming; deeper custom = Flutter knowledge |
| Live updates (job progress) | Built-in, trivially ergonomic | Built-in, but over the Flutter bridge |
| Data tables (results browser) | AG Grid integration — strong | DataTable — adequate, weaker for large sets |
| Charts | ECharts/Plotly/bokeh integrations | fl_chart and bridges |
| Testing | Playwright against real DOM | Harder (canvas rendering) |
| Maturity/stability | Stable 3.x, active, small issue backlog | Pre-1.0 rewrite in progress; churn risk |
| Packaging story | Web page (or pywebview wrapper) | First-class native binaries incl. mobile |
| License / cost | MIT / free | Apache-2.0 / free |

## Verdict

- **If zenCrawl were pure-Python UI:** choose **NiceGUI** — it shares the FastAPI
  backbone, makes live progress effortless, and stays testable as real DOM.
- **Choose Flet only if** distributing installable desktop/mobile apps ever becomes
  a requirement; wait for 1.0 first.
- **Why neither today:** PRD §4.4 chose the React SPA for end-to-end type safety
  (generated API client catches contract drift at build time), component
  ecosystem, and hiring/future-proofing. Both frameworks above share a weakness
  the stakeholder explicitly flagged: UI logic locked inside one framework's API,
  harder to migrate away from later.

## Revisit triggers

1. Stakeholder decides JavaScript maintenance burden outweighs type-safety benefits → re-evaluate NiceGUI.
2. Desktop/mobile distribution of zenCrawl becomes a goal → evaluate Flet ≥ 1.0.
3. NiceGUI 4.0 breaking release lands → re-check migration cost if it's ever adopted.

## Sources

- [NiceGUI website](https://nicegui.io/) · [NiceGUI GitHub](https://github.com/zauberzeug/nicegui)
- [Flet website](https://flet.dev/) · [Flet GitHub releases](https://github.com/flet-dev/flet/releases) · [Introducing Flet 1.0 Alpha](https://flet.dev/blog/introducing-flet-1-0-alpha)
