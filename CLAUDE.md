# CLAUDE.md — Stock Portfolio Tracker

Briefing for every new session. Read this before touching any code.

---

## Project purpose

Personal investment portfolio dashboard. Tracks stock positions with multiple purchase lots per position, calculates unrealized gain/loss, logs dividends, shows price history charts, and maintains a watchlist. All portfolio data persists in localStorage. Live prices and history come from a local Python backend that wraps yfinance. AI portfolio analysis is available via an Analysis tab that calls the same backend.

This is **not** a no-backend app. It has two servers that must both be running.

---

## Architecture: two servers

| Server | Technology | Port | Location |
|---|---|---|---|
| React frontend | Vite 5 + React 18 | 5173 | `Stock-Watchlist-V2/` (this repo) |
| Python backend | FastAPI + uvicorn | 8000 | `../portfolio-backend/` (sibling directory) |

The frontend never calls any external API directly. All price data, history, and AI analysis flow through `http://localhost:8000`. The frontend service layer (`src/services/localBackend.js`) is the only file that constructs requests to the backend.

CORS is configured in the backend to allow only `http://localhost:5173`.

---

## Tech stack

| Tool | Role |
|---|---|
| React 18 | UI framework |
| Vite 5 | Dev server and build tool |
| React Router v6 | Tab navigation (`/`, `/stocks`, `/stocks/:ticker`, `/positions`, `/watchlist`, `/analysis`) |
| Recharts 2 | All charts — line charts, donut pie chart, sparklines |
| FastAPI | Python backend HTTP framework |
| uvicorn | ASGI server that runs FastAPI |
| yfinance | Source of all stock price and history data |
| Anthropic Python SDK | AI portfolio analysis (`claude-sonnet-4-6`) |
| localStorage | Full persistence of portfolio data and API response cache |

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

The backend requires an `ANTHROPIC_API_KEY` in a `.env` file inside `portfolio-backend/`. Without it, `/analyze` calls will fail but prices and history will still work.

The frontend `.env` still contains `VITE_ALPHA_VANTAGE_KEY` — this key is no longer used by any active code. It is safe to ignore.

---

## File structure

```
Stock-Watchlist-V2/           ← React frontend (this repo)
  .env                        ← VITE_ALPHA_VANTAGE_KEY (legacy, unused)
  vite.config.js              ← Vite config — just enables React plugin
  package.json                ← React 18, react-router-dom, recharts, vite

  src/
    config.js                 ← SECTORS list, SECTOR_COLORS map; also exports API_KEY
                                 and API_BASE_URL (Alpha Vantage leftovers — not used)
    main.jsx                  ← React entry point — mounts App into #root
    App.jsx                   ← BrowserRouter + PortfolioProvider + all route definitions
    index.css                 ← All styles — dark theme tokens, layout, component classes

    services/
      localBackend.js         ← Active backend service — all calls to http://localhost:8000;
                                 localStorage cache; period coverage logic. See service layer section.
      alphaVantage.js         ← Dead file — was the old API service; kept for reference,
                                 not imported anywhere active

    store/
      PortfolioContext.jsx    ← Global state via useReducer; exposes state + actions via
                                 usePortfolio(). Imports from localBackend.js.
      placeholderData.js      ← Seed data injected on first load (AAPL, GOOGL, MSFT)

    utils/
      calculations.js         ← Pure math: calcPosition, calcPortfolioSummary,
                                 buildPortfolioHistory, calcBenchmarkComparison, etc.
      formatters.js           ← Currency, percent, gain, date, formatDateTime + gainClass
      timeWindows.js          ← TIME_WINDOWS array + getWindowStartDate(key) → YYYY-MM-DD

    components/
      NavBar.jsx              ← Sticky top nav — Dashboard, My Stocks, All Positions,
                                 Watchlist, Analysis tabs; active state via useLocation
      Footer.jsx              ← Disclaimer footer — "Stock prices provided by Yahoo Finance."
      Modal.jsx               ← Reusable modal (Escape + backdrop click to close)
      ConfirmDialog.jsx       ← Delete confirmation built on Modal
      LoadingSpinner.jsx      ← Inline spinner; size='sm' (default) or 'lg'
      Sparkline.jsx           ← 30-point miniature line chart, no axes; green/red/neutral
      TimeWindowSelector.jsx  ← Button group for 1D/1W/MTD/1M/3M/6M/YTD/1Y/5Y/MAX
      AddPositionModal.jsx    ← Add new position or add a lot to an existing one
      AddWatchlistModal.jsx   ← Add or edit a watchlist entry

    pages/
      Dashboard.jsx           ← Portfolio overview: summary metrics, value-over-time chart
                                 (with time window), sector donut, portfolio weights.
                                 Silently auto-refreshes prices every 60 seconds.
                                 Fetches 1y history on mount; fetches longer periods when
                                 user selects a window not covered by cache.
      MyStocks.jsx            ← Card grid of all positions with sparklines
      MyStockDetail.jsx       ← /stocks/:ticker — price chart, lots table, dividends, notes.
                                 Re-fetches history on ticker change or window change.
      AllPositions.jsx        ← Sortable list + grid toggle; Add Position; delete positions
      Watchlist.jsx           ← Table with target price gap; Buy (convert), Edit, Delete
      Analysis.jsx            ← POSTs holdings to /analyze; renders AI analysis response

../portfolio-backend/         ← Python backend (sibling directory, NOT inside this repo)
  .env                        ← ANTHROPIC_API_KEY
  requirements.txt            ← fastapi, uvicorn, yfinance, anthropic, python-dotenv, etc.
  main.py                     ← FastAPI app with CORS, three endpoints: /prices, /history, /analyze
  data_fetcher.py             ← get_portfolio_data() — fetches price + 1y history per ticker
  analyzer.py                 ← analyze_portfolio() — builds prompt, calls Anthropic API
```

---

## Backend endpoints

**`GET /prices/{ticker}`**
- Calls `yf.Ticker(ticker).info`
- Returns: `{ ticker, current_price, company_name, sector, market_cap, pe_ratio }`
- Frontend reads: `current_price` only (rest not currently displayed)

**`GET /history/{ticker}?period={period}`**
- Valid periods: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `5y`, `max`
- Calls `stock.history(period=period, interval="1d")`
- Returns: `{ ticker, period, history: [{date: "YYYY-MM-DD", close: float}] }`
- Frontend converts to `{ "YYYY-MM-DD": number }` dict in `localBackend.js`

**`POST /analyze`**
- Body: `{ tickers: string[], holdings: { [ticker]: { quantity, cost_basis } } }`
- Calls `data_fetcher.get_portfolio_data()` to fetch live prices, then `analyzer.analyze_portfolio()`
- `analyzer.py` builds a prompt with portfolio metrics and calls `claude-sonnet-4-6` via Anthropic SDK
- Returns: `{ analysis: string, status: "success" | "error" }`

---

## Service layer — localBackend.js

This file is the only place the backend URL (`http://localhost:8000`) appears. It replaces the old `alphaVantage.js` entirely and exports the same interface.

**Cache:** Uses `av_price_cache` localStorage key (same key as the old Alpha Vantage service — preserves any existing cached data). TTL is 24 hours (`CACHE_TTL_MS` from `config.js`). Quote and history have separate timestamps (`timestamp` and `historyTimestamp`) so a quote refresh doesn't invalidate history.

**Period coverage logic:**
```
PERIOD_ORDER = ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max']

periodCovers(cachedPeriod, requestedPeriod):
  → true if PERIOD_ORDER.indexOf(cachedPeriod) >= PERIOD_ORDER.indexOf(requestedPeriod)
```
If `5y` is cached, any shorter period request returns from cache without a network call.

**Exports:**
- `fetchQuote(ticker, forceRefresh)` — GET /prices/{ticker}, caches quote
- `fetchHistory(ticker, forceRefresh, period)` — GET /history/{ticker}?period=..., caches history
- `fetchTickerData(ticker, forceRefresh, period)` — both quote + history (used for forced refresh)
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
   - Reads `pf_positions`, `pf_watchlist`, `pf_benchmark` from localStorage
   - If `pf_positions` is null (first ever load), seeds placeholder data (AAPL, GOOGL, MSFT)
   - Reads `av_price_cache` into `state.priceCache`

2. **On mount**, `refreshPrices(false)` fires:
   - Loops all position + watchlist tickers
   - Calls `fetchQuote(ticker)` for each (no queue gap — backend is local)
   - Dispatches `SET_TICKER_DATA` to update `state.priceCache` as each quote arrives

3. **Dashboard fetches history lazily**:
   - On mount: calls `actions.fetchHistoryForPositions(false)` with default `period='1y'`
   - On window change: checks cache coverage via local `periodCoversLocal()` mirror; only
     re-fetches if the new period isn't covered by `state.priceCache[ticker].historyPeriod`
   - Dashboard auto-refreshes quotes every 60 seconds via `setInterval`

4. **MyStockDetail fetches history on load**:
   - Re-fetches on `[ticker, window]` changes using `WINDOW_TO_PERIOD[window]`
   - Does not apply the coverage check — always asks for the selected period

5. **UI reads derived data**:
   - Pure functions in `calculations.js` take `state.positions` and `state.priceCache` as inputs
   - `buildPortfolioHistory` constructs portfolio value-over-time from cached history;
     `findPriceBefore` fills non-trading days by scanning for the nearest prior date

6. **User mutations** dispatch actions → `useEffect` hooks persist to localStorage immediately

---

## localStorage

| Key | Content | Lifetime |
|---|---|---|
| `pf_positions` | Array of position objects (ticker, companyName, sector, lots[], dividends[], notes) | Permanent until user clears browser data |
| `pf_watchlist` | Array of watchlist entries (ticker, companyName, sector, targetBuyPrice, reason) | Permanent |
| `pf_benchmark` | `{ initialSP, currentSP }` for S&P 500 comparison | Permanent |
| `av_price_cache` | `{ [ticker]: { quote, history, historyPeriod, timestamp, historyTimestamp } }` | Survives reloads; entries expire after 24h TTL |

**Critical:** `localStorage.clear()` destroys the entire portfolio. The only persistent source of truth for holdings is `pf_positions` in localStorage. `placeholderData.js` is only used for first-load seeding — it does not restore data after clearing.

`av_api_usage` (old Alpha Vantage call counter) is no longer read or written.

---

## State management

All global state lives in `PortfolioContext` via `useReducer`. Access it anywhere with:

```js
const { state, actions } = usePortfolio()
```

**State shape:**
```js
{
  positions: [],               // array of position objects
  watchlist: [],               // array of watchlist entries
  benchmark: {},               // { initialSP, currentSP }
  priceCache: {},              // { [ticker]: { quote, history, historyPeriod, timestamp, historyTimestamp } }
  loadingTickers: Set,         // tickers currently fetching a quote
  historyLoadingTickers: Set,  // tickers currently fetching history
  historyFailed: false,        // true if any history fetch failed this session (in-memory only)
  apiWarning: null,            // string | null — shown as banner on Dashboard
  isRefreshing: false,         // true while refreshPrices is running
  lastUpdated: null,           // timestamp of most recent quote fetch
}
```

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

**Benchmark Comparison uses manual inputs.** The Dashboard's Benchmark section requires the user to manually enter S&P 500 initial and current values. These should eventually be fetched from the backend via a `GET /history/^GSPC` call and populated automatically.

**`config.js` contains dead Alpha Vantage exports.** `API_KEY` and `API_BASE_URL` are still exported from `config.js` but not imported anywhere active. They can be removed if a config cleanup task comes up.

**`apiWarning` message in PortfolioContext still says "Alpha Vantage rate limit."** Line 315 in `PortfolioContext.jsx` dispatches a SET_API_WARNING with text referencing Alpha Vantage. The local backend never returns `rateLimited: true`, so this code path never fires — but it should be updated if the warning logic is ever activated.

---

## Known constraints and gotchas

**Removing the last lot removes the position.** `REMOVE_LOT` filters out positions where `lots.length === 0`. Intentional.

**Watchlist "Buy" flow is asymmetric.** `handleConvertComplete` in `Watchlist.jsx` calls `removeWatchlistEntry` directly. The position is created by `AddPositionModal` via `addPosition`. The watchlist entry is removed in `onClose`, not in the reducer.

**`historyFailed` is in-memory only.** Resets to `false` on every page load. If the chart shows an error, refreshing the page clears it and retries.

**Sparklines use last 30 data points** from cached history. Show a flat neutral line if history is not yet loaded.

**Dashboard time window buttons do not cover all yfinance periods.** `DASH_PERIOD_MAP` maps YTD → `'1y'` (not `'ytd'`) because the backend's valid period list does not include `'ytd'`. This means the YTD chart may show slightly more data than strictly year-to-date.

**History fetch guard (`historyFetchingRef`).** Only one `fetchHistoryForPositions` call can run at a time. A second call while the first is in progress is dropped silently.
