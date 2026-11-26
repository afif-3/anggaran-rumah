# anggaran-rumah

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/best-household-budget-site-20261126-1457)
[![Rank](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fcompetitions%2Fbest-household-budget-site-20261126-1457%2Fleaderboard&query=%24[0].rank&label=rank)](https://make.fun/bounty/best-household-budget-site-20261126-1457)
[![Reward](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmake.fun%2Fapi%2Fcompetitions%2Fbest-household-budget-site-20261126-1457%2Fleaderboard&query=%24[0].reward&label=reward)](https://make.fun/bounty/best-household-budget-site-20261126-1457)

Anggaran Rumah ("Household Budget") is a simple, honest budget planner for an Indonesian family of four. It shows the month at a glance — income vs spending vs what's left, the savings rate — then breaks spending down by category with monthly budget limits, a hand-drawn spending donut, a six-month income-vs-spending trend, and savings goals with progress. Transactions can be added, edited, deleted, searched and filtered. Everything is stored in the browser's localStorage, so the data is private and survives reloads; a JSON export/import and a reset-to-sample button are built in. It ships with realistic sample data for June–November 2026 (Jakarta: rent, Pasar Minggu groceries, school fees, PLN bills, Gojek rides) so it feels like a real household from the first open.

No accounts, no server, no trackers, no external requests — the whole site is one self-contained page built from the sources in this repo.

## Run it

```sh
node main.ts
```

This writes the static site to `out/`. Open `out/index.html` in any browser — no server, build step or network needed. Requires Node.js 22.18+.

## Layout

- `main.ts` — the builder: validates `data/sample.json`, inlines the stylesheet and client app into the template, writes `out/index.html`. Fails loudly on bad data.
- `src/template.html` — the page skeleton (header, summary cards, budgets, charts, transactions, goals, data tools).
- `src/styles.css` — the whole design system (warm, homey, responsive; system fonts only).
- `src/app.js` — the client app: month navigation, budget bars, hand-rolled SVG donut + trend bars, transaction CRUD with search/filter, savings goals, localStorage persistence, JSON export/import.
- `data/sample.json` — the seeded sample household: 11 categories with monthly budgets, income rows, 70 transactions across June–November 2026, and 4 savings goals.

## Data & privacy

Your edits never leave your browser. Export a JSON backup from the "Your data" section; import it on another device to carry your budget over.

---

Entered on [make.fun](https://make.fun/bounty/best-household-budget-site-20261126-1457) — referral: https://make.fun/r/ged860yr
