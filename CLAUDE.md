# CLAUDE.md — Stock Portfolio Tracker

Briefing for every new session. Read this before touching any code.

---

## Project purpose

Personal investment portfolio dashboard. Tracks stock positions with multiple purchase lots per position, calculates unrealized gain/loss, logs dividends, shows price history charts, and maintains a watchlist. All portfolio data persists in localStorage. Live prices and history come from a local Python backend that wraps yfinance. AI portfolio analysis, scenario modeling, conversational chat, and news feeds are all available via backend endpoints and rendered in the Analysis and News tabs.

This is **not** a no-backend app. It has two servers that must both be running.

---

## Architecture: two servers

| Server | Technology | Port | Location |
|---|---|---|---|
| React frontend | Vite 5 + React 18 | 5173 | `Stock-Watchlist-V2/` (this repo) |
| Python backend | FastAPI + uvicorn | 8000 | `../portfolio-backend/` (sibling directory) |

`localBackend.js` is the only file that calls the backend for **price and history data** — it handles caching. All other backend calls (AI analysis, scenario, chat, news) are made directly from their respective page components.

CORS is configured in the backend to allow only `http://localhost:5173`.

---

## Tech stack

| Tool | Role |
|---|---|
| React 18 | UI framework |
| Vite 5 | Dev server and build tool |
| React Router v6 | Tab navigation (`/`, `/stocks`, `/stocks/:ticker`, `/positions`, `/watchlist`, `/analysis`, `/news`) |
| Recharts 2 | All charts — line charts, donut pie chart, sparklines |
| FastAPI | Python backend HTTP framework |
| uvicorn | ASGI server that runs FastAPI |
| yfinance | Source of all stock price and history data (including `^GSPC` for benchmark) |
| Anthropic Python SDK | AI analysis, scenario modeling, chat (`claude-sonnet-4-6`) |
| Finnhub REST API | News headlines per ticker (last 7 days) |
| localStorage | Full persistence of portfolio data and price/history cache |

No TypeScript. No CSS framework. Styles are in `src/index.css` using CSS custom properties (dark theme, design tokens).

---

## How to start both servers

**Frontend** (run from `Stock-Watchlist-V2/`):
```bash
npm install          # only needed once or after package.json changes
npm run dev          # → http://localhost:5173
```

**Backend** (run from `../portfolio-backend/`):
```bash
source venv/bin/activate
pip install -r requirements.txt    # only needed once
uvicorn main:app --reload          # → http://localhost:8000
```

The backend requires both `ANTHROPIC_API_KEY` and `FINNHUB_API_KEY` in a `.env` file inside `portfolio-backend/`. Without `ANTHROPIC_API_KEY`, `/analyze`, `/scenario`, and `/chat` will fail. Without `FINNHUB_API_KEY`, `/news/{ticker}` will fail. Prices and history work without either key.

The frontend `.env` still contains `VITE_ALPHA_VANTAGE_KEY` — this key is no longer used by any active code. It is safe to ignore.

---

## File structure

```
Stock-Watchlist-V2/           ← React frontend (this repo)
  .env                        ← VITE_ALPHA_VANTAGE_KEY (legacy, unused)
  vite.config.js              ← Vite config — just enables React plugin
  package.json                ← React 18, react-router-dom, recharts, vite

  src/
    config.js                 ← SECTORS list, SECTOR_COLORS map, CACHE_TTL_MS.
                                 Also exports API_KEY and API_BASE_URL (Alpha Vantage
                                 leftovers — not imported anywhere active, safe to remove)
    main.jsx                  ← React entry point — mounts App into #root
    App.jsx                   ← BrowserRouter + PortfolioProvider + all route definitions
    index.css                 ← All styles — dark theme tokens, layout, component classes

    services/
      localBackend.js         ← Price + history only — all calls to http://localhost:8000
                                 for /prices and /history; localStorage cache; period
                                 coverage logic. Does NOT handle /analyze, /news, etc.
      alphaVantage.js         ← Dead file — was the old API service; not imported anywhere

    store/
      PortfolioContext.jsx    ← Global state via useReducer; exposes state + actions via
                                 usePortfolio(). Also holds analysis-tab state (6 fields)
                                 and exports 3 benchmark helper functions.
      placeholderData.js      ← Seed data injected on first load (AAPL, GOOGL, MSFT)

    utils/
      calculations.js         ← Pure math: calcPosition, calcPortfolioSummary,
                                 buildPortfolioHistory, calcBenchmarkComparison (unused), etc.
      formatters.js           ← Currency, percent, gain, date, formatDateTime + gainClass
      timeWindows.js          ← TIME_WINDOWS array + getWindowStartDate(key) → YYYY-MM-DD

    components/
      NavBar.jsx              ← Sticky top nav — Dashboard, My Stocks, All Positions,
                                 Watchlist, Analysis, News tabs; active state via useLocation
      Footer.jsx              ← Disclaimer footer — "Stock prices provided by Yahoo Finance."
      Modal.jsx               ← Reusable modal (Escape + backdrop click to close)
      ConfirmDialog.jsx       ← Delete confirmation built on Modal
      LoadingSpinner.jsx      ← Inline spinner; size='sm' (default) or 'lg'
      Sparkline.jsx           ← 30-point miniature line chart, no axes; green/red/neutral
      TimeWindowSelector.jsx  ← Button group for 1D/1W/MTD/1M/3M/6M/YTD/1Y/5Y/MAX
      AddPositionModal.jsx    ← Add new position or add a lot to an existing one
      AddWatchlistModal.jsx   ← Add or edit a watchlist entry
      NewsList.jsx            ← Pure presentational component — renders a list of
                                 {headline, source, url} items. Used by Analysis,
                                 MyStockDetail, and GeneralNews.

    pages/
      Dashboard.jsx           ← Portfolio overview: summary metrics, value-over-time chart
                                 (with time window), sector donut, portfolio weights.
                                 Benchmark Comparison card shows dual-line normalized chart
                                 (portfolio vs S&P 500) — data from ^GSPC history in cache.
                                 Silently auto-refreshes prices every 60 seconds.
      MyStocks.jsx            ← Card grid of all positions with sparklines
      MyStockDetail.jsx       ← /stocks/:ticker — price chart, lots table, dividends, notes,
                                 news headlines. Re-fetches history on ticker/window change.
      AllPositions.jsx        ← Sortable list + grid toggle; Add Position; delete positions
      Watchlist.jsx           ← Table with target price gap; Buy (convert), Edit, Delete
      Analysis.jsx            ← AI analysis (POST /analyze), scenario tool (POST /scenario),
                                 conversational chat (POST /chat), and news per position.
                                 Shows 3 bullet conclusions + toggle to reveal full analysis.
      GeneralNews.jsx         ← /news — fetches headlines for all positions in parallel
                                 via GET /news/{ticker}; renders one card per position.

../portfolio-backend/         ← Python backend (sibling directory, NOT inside this repo)
  .env                        ← ANTHROPIC_API_KEY, FINNHUB_API_KEY
  requirements.txt            ← fastapi, uvicorn, yfinance, anthropic, python-dotenv,
                                 requests (for Finnhub), etc.
  main.py                     ← FastAPI app with CORS; 6 endpoints: GET /prices/{ticker},
                                 GET /history/{ticker}, GET /news/{ticker},
                                 POST /analyze, POST /scenario, POST /chat
  data_fetcher.py             ← get_portfolio_data() — fetches price + fundamental data per ticker
  analyzer.py                 ← analyze_portfolio() — builds structured prompt, calls claude-sonnet-4-6
  news_fetcher.py             ← get_news_for_ticker() — calls Finnhub /company-news for last 7 days;
                                 returns up to 5 {headline, source, url} dicts
  chat_engine.py              ← run_chat() — portfolio-aware conversational assistant;
                                 passes conversation_history to claude-sonnet-4-6
  scenario_engine.py          ← run_scenario() — extracts market move %, applies sector betas,
                                 calls claude-sonnet-4-6 for narrative; returns impact per position
```

---

## Backend endpoints

**`GET /prices/{ticker}`**
- Calls `yf.Ticker(ticker).info`
- Returns: `{ ticker, current_price, company_name, sector, market_cap, pe_ratio }`

**`GET /history/{ticker}?period={period}`**
- Valid periods: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `5y`, `max`
- Calls `stock.history(period=period, interval="1d")`
- Returns: `{ ticker, period, history: [{date: "YYYY-MM-DD", close: float}] }`
- Frontend converts to `{ "YYYY-MM-DD": number }` dict in `localBackend.js`
- Also used for `^GSPC` (sent as `%5EGSPC`) to power the benchmark chart

**`GET /news/{ticker}`**
- Calls Finnhub `/company-news` for the last 7 days; requires `FINNHUB_API_KEY`
- Returns: `{ ticker, news: [{headline, source, url}] }` (up to 5 items)
- Called directly from `Analysis.jsx` and `GeneralNews.jsx` (not through `localBackend.js`)

**`POST /analyze`**
- Body: `{ tickers: string[], holdings: { [ticker]: { quantity, cost_basis } } }`
- Calls `data_fetcher.get_portfolio_data()` then `analyzer.analyze_portfolio()`
- Response format contract: 3 `•` bullet conclusions, then `---FULL ANALYSIS---` divider on its own line, then full analysis body
- Returns: `{ analysis: string, status: "success" | "error" }`

**`POST /scenario`**
- Body: `{ scenario: string, holdings: {...}, market_data: {...} }`
- Extracts market move % from scenario string, applies sector-weighted betas, calls claude-sonnet-4-6
- Returns: `{ scenario, market_move_pct, total_impact_usd, positions[], analysis, status }`

**`POST /chat`**
- Body: `{ message: string, conversation_history: [{role, content}], holdings: {...}, market_data: {...} }`
- Passes full conversation history + portfolio context to claude-sonnet-4-6; max_tokens=1024
- Returns: `{ response: string, status: "success" | "error" }`

---

## Service layer — localBackend.js

This file handles **price and history fetching only**. It is the only place the backend URL (`http://localhost:8000`) appears for price/history calls. AI, scenario, chat, and news calls are made directly from page components.

**Cache:** Uses `av_price_cache` localStorage key. TTL is 24 hours (`CACHE_TTL_MS` from `config.js`). Quote and history have separate timestamps (`timestamp` and `historyTimestamp`) so a quote refresh doesn't invalidate history.

**Period coverage logic:**
```
PERIOD_ORDER = ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max']

periodCovers(cachedPeriod, requestedPeriod):
  → true if PERIOD_ORDER.indexOf(cachedPeriod) >= PERIOD_ORDER.indexOf(requestedPeriod)
```
If `5y` is cached, any shorter period request returns from cache without a network call.

**Exports:**
- `fetchQuote(ticker, forceRefresh)` — GET /prices/{ticker}, caches quote
- `fetchHistory(ticker, forceRefresh, period)` — GET /history/{ticker}?period=..., caches history; uses `encodeURIComponent(ticker)` so `^GSPC` is sent correctly
- `fetchTickerData(ticker, forceRefresh, period)` — both quote + history
- `getCachedEntry(ticker)` — reads current cache entry without fetching
- `seedCacheEntry(ticker, quote, history)` — injects placeholder data at timestamp=0
- `getLastUpdatedTimestamp()` — max quote timestamp across all cached tickers
- `getOldestHistoryTimestamp(tickers)` — min historyTimestamp across given tickers
- `WINDOW_TO_PERIOD` — maps UI window keys (1D, 1W, etc.) to yfinance period strings
- `getQueueDepth()` — stub that returns 0 (kept for interface compatibility)

**No request queue.** The local backend has no rate limits, so all fetches are made directly without delays.

---

## Data flow

1. **App mounts** → `PortfolioProvider` calls `buildInitialState()`:
   - Reads `pf_positions`, `pf_watchlist` from localStorage
   - If `pf_positions` is null (first ever load), seeds placeholder data (AAPL, GOOGL, MSFT)
   - Reads `av_price_cache` into `state.priceCache`

2. **On mount**, `refreshPrices(false)` fires:
   - Loops all position + watchlist tickers
   - Calls `fetchQuote(ticker)` for each (no queue gap — backend is local)
   - Dispatches `SET_TICKER_DATA` to update `state.priceCache` as each quote arrives

3. **Dashboard fetches history lazily**:
   - On mount: calls `actions.fetchHistoryForPositions(false)` with default `period='1y'`
   - `fetchHistoryForPositions` also fetches `^GSPC` history with `period='max'` after all position fetches complete (non-fatal try/catch)
   - On window change: checks cache coverage via local `periodCoversLocal()` mirror; only re-fetches if the new period isn't covered
   - Dashboard auto-refreshes quotes every 60 seconds via `setInterval`

4. **Benchmark chart** in Dashboard:
   - `computeBenchmarkData(state)` aligns `buildPortfolioHistory` output with `^GSPC` history, normalizes both to 100 at the earliest purchase date
   - Two-pointer merge produces `{date, portfolio, benchmark}[]` for the dual-line chart

5. **MyStockDetail fetches history on load**:
   - Re-fetches on `[ticker, window]` changes using `WINDOW_TO_PERIOD[window]`
   - Does not apply the coverage check — always asks for the selected period

6. **News flow**:
   - `GeneralNews.jsx`: on mount, fires one `GET /news/{ticker}` per position via `Promise.allSettled`; fulfilled results stored in local state; rejected silently skipped
   - `Analysis.jsx`: fetches news per position as part of the analysis display; results stored in `analysisNewsData` context field

7. **Analysis, scenario, chat**:
   - All three POST directly to their backend endpoints from `Analysis.jsx`
   - Results stored in context (`analysisResult`, `scenarioResult`, `chatMessages`) so they survive tab navigation

8. **UI reads derived data**:
   - Pure functions in `calculations.js` take `state.positions` and `state.priceCache` as inputs
   - `buildPortfolioHistory` constructs portfolio value-over-time; `findPriceBefore` fills non-trading days

9. **User mutations** dispatch actions → `useEffect` hooks persist to localStorage immediately

---

## localStorage

| Key | Content | Lifetime |
|---|---|---|
| `pf_positions` | Array of position objects (ticker, companyName, sector, lots[], dividends[], notes) | Permanent until user clears browser data |
| `pf_watchlist` | Array of watchlist entries (ticker, companyName, sector, targetBuyPrice, reason) | Permanent |
| `pf_benchmark` | `{ initialSP, currentSP }` — **legacy**, no longer written or read by active UI | Survives reloads but ignored |
| `av_price_cache` | `{ [ticker]: { quote, history, historyPeriod, timestamp, historyTimestamp } }` — includes `^GSPC` | Survives reloads; entries expire after 24h TTL |

**Critical:** `localStorage.clear()` destroys the entire portfolio. The only persistent source of truth for holdings is `pf_positions` in localStorage.

`av_api_usage` (old Alpha Vantage call counter) is no longer read or written.

---

## State management

All global state lives in `PortfolioContext` via `useReducer`. Access it anywhere with:

```js
const { state, actions } = usePortfolio()
```

**Reducer state shape:**
```js
{
  positions: [],               // array of position objects
  watchlist: [],               // array of watchlist entries
  benchmark: {},               // legacy { initialSP, currentSP } — no longer used by UI
  priceCache: {},              // { [ticker]: { quote, history, historyPeriod, timestamp, historyTimestamp } }
  loadingTickers: Set,         // tickers currently fetching a quote
  historyLoadingTickers: Set,  // tickers currently fetching history
  historyFailed: false,        // true if any history fetch failed this session (in-memory only)
  apiWarning: null,            // string | null — shown as banner on Dashboard
  isRefreshing: false,         // true while refreshPrices is running
  lastUpdated: null,           // timestamp of most recent quote fetch
}
```

**Analysis-tab context state** (held as `useState` inside `PortfolioProvider`, not in the reducer — survives tab navigation, resets on hard refresh, not persisted to localStorage):
- `analysisResult` / `setAnalysisResult` — raw string from `/analyze`
- `analysisNewsData` / `setAnalysisNewsData` — `{ [ticker]: [{headline, source, url}] }`
- `scenarioResult` / `setScenarioResult` — object from `/scenario`
- `scenarioInput` / `setScenarioInput` — current scenario text input
- `chatMessages` / `setChatMessages` — `[{role, content}]` conversation history
- `showFullAnalysis` / `setShowFullAnalysis` — toggle for full analysis body vs bullets-only view

**Benchmark helper exports** (module-scope functions exported from `PortfolioContext.jsx`):
- `getEarliestPurchaseDate(positions)` → `"YYYY-MM-DD"` | `null`
- `normalizeSeries(series, anchorDate)` → `[{date, value}]` indexed to 100 at anchor
- `computeBenchmarkData(state)` → `{ anchorDate, portfolioNormalized, benchmarkNormalized }` | `null`

**Key actions:** `addPosition`, `addLot`, `removeLot`, `addDividend`, `removeDividend`, `updateNotes`, `addWatchlistEntry`, `updateWatchlistEntry`, `removeWatchlistEntry`, `convertWatchlistToPosition`, `updateBenchmark`, `refreshPrices(force)`, `fetchHistoryForPositions(force, period)`, `fetchHistoryForTicker(ticker, force, period)`.

---

## Placeholder data

Seeded on first load only (when `pf_positions` is absent from localStorage). Defined in `src/store/placeholderData.js`.

Current seed holdings:
- **AAPL** — 2 lots: 20 shares @ $135.87 on 2021-04-18; 15 shares @ $182.41 on 2023-11-10. 2 dividends ($14.60 each). Has notes.
- **GOOGL** — 1 lot: 100 shares @ $37.50 on 2016-03-16. No dividends.
- **MSFT** — 1 lot: 10 shares @ $270.50 on 2023-03-16. No dividends.

**Real JP Morgan portfolio data has not yet been entered.** These are placeholder positions only.

---

## Known issues and deferred work

**1D time range returns no data.** `getWindowStartDate('1D')` returns today minus 1 day, but the backend returns only trading-day close prices. On weekends and after market close, there are no intraday data points from yfinance's daily history endpoint, so the chart shows nothing. Needs either a different yfinance interval for 1D or a fallback display.

**X-axis label readability on long-range charts.** On 5Y and MAX views, the x-axis tick labels overlap and become unreadable. Recharts' `interval="preserveStartEnd"` is not sufficient at this scale. Needs a custom tick formatter that reduces label density based on date range.

**`apiWarning` message in PortfolioContext still says "Alpha Vantage rate limit."** The local backend never returns `rateLimited: true`, so this code path never fires — but the string should be updated if the warning logic is ever activated.

---

## Known constraints and gotchas

**Removing the last lot removes the position.** `REMOVE_LOT` filters out positions where `lots.length === 0`. Intentional.

**Watchlist "Buy" flow is asymmetric.** `handleConvertComplete` in `Watchlist.jsx` calls `removeWatchlistEntry` directly. The position is created by `AddPositionModal` via `addPosition`. The watchlist entry is removed in `onClose`, not in the reducer.

**`historyFailed` is in-memory only.** Resets to `false` on every page load. If the chart shows an error, refreshing the page clears it and retries.

**Sparklines use last 30 data points** from cached history. Show a flat neutral line if history is not yet loaded.

**Dashboard time window buttons do not cover all yfinance periods.** `DASH_PERIOD_MAP` maps YTD → `'1y'` (not `'ytd'`) because the backend's valid period list does not include `'ytd'`. This means the YTD chart may show slightly more data than strictly year-to-date.

**History fetch guard (`historyFetchingRef`).** Only one `fetchHistoryForPositions` call can run at a time. A second call while the first is in progress is dropped silently.

**`---FULL ANALYSIS---` is a model contract.** `Analysis.jsx` splits the `/analyze` response on this exact literal string to separate the 3-bullet summary from the full analysis body. If `analyzer.py`'s prompt is changed in a way that causes the model to omit or alter this divider, the toggle UI will break (it falls back to showing the full text unsplit).

**`calcBenchmarkComparison` in `calculations.js` is now unused.** The benchmark chart was migrated to `computeBenchmarkData` in `PortfolioContext.jsx`. The function remains in `calculations.js` but is not imported anywhere active.

**Analysis-tab state is not persisted to localStorage.** `analysisResult`, `chatMessages`, and all other analysis-tab context fields reset on hard refresh. This is intentional — stale AI responses are not useful across sessions.
