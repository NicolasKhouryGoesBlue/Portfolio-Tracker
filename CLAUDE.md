# CLAUDE.md — Stock Portfolio Tracker

Briefing for every new session. Read this before touching any code.

---

## Project purpose

Personal investment portfolio dashboard. Tracks stock positions (with multiple purchase lots per position), calculates unrealized gain/loss, logs dividends, shows price history charts, and maintains a watchlist for stocks under consideration. No backend — all data lives in the browser via localStorage. Live prices come from Alpha Vantage's free tier API.

---

## Tech stack

| Tool | Role |
|---|---|
| React 18 | UI framework |
| Vite 5 | Dev server and build tool |
| React Router v6 | Tab navigation (`/`, `/stocks`, `/stocks/:ticker`, `/positions`, `/watchlist`) |
| Recharts | All charts — line charts, donut pie chart, sparklines |
| Alpha Vantage API | Live stock quotes (`GLOBAL_QUOTE`) and daily price history (`TIME_SERIES_DAILY`) |
| localStorage | Full persistence — portfolio data, API response cache, usage counter |

No TypeScript. No CSS framework. Styles are in `src/index.css` using CSS custom properties (dark theme, design tokens).

---

## File structure

```
.env                              ← VITE_ALPHA_VANTAGE_KEY (not committed)
src/
  config.js                       ← API key ref, API_BASE_URL, CACHE_TTL_MS (24h), SECTORS list, SECTOR_COLORS map
  main.jsx                        ← React entry point — mounts App into #root
  App.jsx                         ← BrowserRouter + PortfolioProvider wrapper + route definitions
  index.css                       ← All styles — dark theme tokens, layout, component classes

  services/
    alphaVantage.js               ← All API calls, localStorage cache (av_price_cache), request queue, usage counter

  store/
    PortfolioContext.jsx          ← Global state via useReducer; exposes state + actions via usePortfolio()
    placeholderData.js            ← Seed data injected on first load (AAPL position + empty watchlist)

  utils/
    calculations.js               ← Pure math: calcPosition, calcPortfolioSummary, buildPortfolioHistory, etc.
    formatters.js                 ← Currency, percent, gain, date, share formatting + gainClass helper
    timeWindows.js                ← TIME_WINDOWS config + getWindowStartDate(key) → YYYY-MM-DD or null

  components/
    NavBar.jsx                    ← Sticky top nav with four tabs; active state via useLocation
    Footer.jsx                    ← Static disclaimer footer
    Modal.jsx                     ← Reusable modal wrapper (Escape to close, backdrop click to close)
    ConfirmDialog.jsx             ← Delete confirmation built on Modal
    LoadingSpinner.jsx            ← Inline spinner; size='sm' (default) or 'lg'
    Sparkline.jsx                 ← 30-point miniature line chart with no axes; green/red/neutral
    TimeWindowSelector.jsx        ← Button group for 1D/1W/MTD/1M/3M/6M/YTD/1Y/5Y/MAX
    AddPositionModal.jsx          ← Add new position or add a lot to an existing one; accepts prefill prop
    AddWatchlistModal.jsx         ← Add or edit a watchlist entry; accepts editEntry prop

  pages/
    Dashboard.jsx                 ← Portfolio overview: summary metrics, value-over-time chart, sector donut, weights
    MyStocks.jsx                  ← Card grid of all held positions with sparklines
    MyStockDetail.jsx             ← Individual stock view at /stocks/:ticker — price chart, lots table, dividends, notes
    AllPositions.jsx              ← Sortable list + grid toggle; Add Position button; delete positions
    Watchlist.jsx                 ← Watchlist table with target price gap; Buy (convert), Edit, Delete per row
```

---

## Data flow

1. **App mounts** → `PortfolioProvider` calls `buildInitialState()`:
   - Reads `pf_positions`, `pf_watchlist`, `pf_benchmark` from localStorage
   - If `pf_positions` is null (first ever load), seeds placeholder data (AAPL + empty watchlist)
   - Reads `av_price_cache` into `state.priceCache`

2. **On mount**, `refreshPrices(false)` fires automatically:
   - Loops all position + watchlist tickers
   - Calls `fetchQuote(ticker)` for each, spaced 15 seconds apart via the request queue
   - Dispatches `SET_TICKER_DATA` to update `state.priceCache` as each quote arrives

3. **Dashboard and MyStockDetail trigger lazy history fetch**:
   - Dashboard calls `actions.fetchHistoryForPositions(false)` on mount
   - MyStockDetail calls `actions.fetchHistoryForTicker(ticker)` on mount
   - History data (`TIME_SERIES_DAILY`) goes into `priceCache[ticker].history`

4. **UI reads derived data**:
   - All calculations (gain/loss, sector allocation, portfolio history) are pure functions in `calculations.js` that take `state.positions` and `state.priceCache` as inputs
   - `buildPortfolioHistory` constructs the portfolio value-over-time series from cached history; uses `findPriceBefore` to fill non-trading days by looking up the nearest prior date

5. **User mutations** (add position, log dividend, update notes, etc.) dispatch actions to the reducer → `useEffect` hooks persist the changed slice to localStorage immediately

---

## API layer

**Base URL:** `https://www.alphavantage.co/query`

**Endpoints used:**
- `GLOBAL_QUOTE` — current price, open, high, low, prev close, volume, change, change%
- `TIME_SERIES_DAILY` — daily OHLCV history; parsed down to `{ 'YYYY-MM-DD': closePrice }`

**Free tier constraints:**
- 25 calls per day, 5 calls per minute
- `outputsize=compact` only — returns last 100 trading days (~5 months). `outputsize=full` is a premium feature and returns an `Information` message instead of data. Never change this to `full`.
- The request queue enforces a 15-second gap between calls (`QUEUE_GAP = 15_000ms`) to safely stay under the per-minute limit

**Cache TTL:** 24 hours (`CACHE_TTL_MS` in `config.js`). Quote and history have separate timestamps so a quote refresh doesn't falsely mark un-fetched history as fresh.

**Error handling:**
- `isRateLimited(json)` checks the `Note` key for actual rate-limit messages. Returns `true` → caller returns cached data with `rateLimited: true`.
- `Information` key in the response means a premium feature was requested. `isRateLimited` logs a console warning and returns `false` — this is NOT treated as a rate limit. If you see this, the request is misconfigured (e.g. wrong outputsize).
- Network/parse errors fall into the catch block → return cached data if available, else `{ history: null, stale: true }`.
- `historyFailed` in context state is set when any history fetch returns `rateLimited || stale`. It is **in-memory only** — resets to `false` on every page load.

---

## localStorage

| Key | Content | Lifetime |
|---|---|---|
| `pf_positions` | Array of position objects (ticker, companyName, sector, lots[], dividends[], notes) | Permanent until user clears browser data |
| `pf_watchlist` | Array of watchlist entries (ticker, companyName, sector, targetBuyPrice, reason) | Permanent |
| `pf_benchmark` | `{ initialSP, currentSP }` for S&P 500 comparison | Permanent |
| `av_price_cache` | `{ [ticker]: { quote, history, timestamp, historyTimestamp } }` | Survives page loads; entries expire after 24h TTL |
| `av_api_usage` | `{ count, resetAt }` — call counter for the 25/day display | Resets when `resetAt` timestamp passes (every 24h) |

Nothing is wiped on page load. All five keys persist across refreshes. First-load seed only runs when `pf_positions` is absent entirely.

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
  priceCache: {},              // { [ticker]: { quote, history, timestamp, historyTimestamp } }
  loadingTickers: Set,         // tickers currently fetching a quote
  historyLoadingTickers: Set,  // tickers currently fetching history
  historyFailed: false,        // true if any history fetch failed this session
  apiWarning: null,            // string | null — shown as a banner on Dashboard
  isRefreshing: false,         // true during manual full refresh
  lastUpdated: null,           // timestamp of most recent quote fetch
}
```

**Key actions:** `addPosition`, `addLot`, `removeLot`, `addDividend`, `removeDividend`, `updateNotes`, `addWatchlistEntry`, `updateWatchlistEntry`, `removeWatchlistEntry`, `convertWatchlistToPosition`, `updateBenchmark`, `refreshPrices(force)`, `fetchHistoryForPositions(force)`, `fetchHistoryForTicker(ticker, force)`.

---

## Known constraints and gotchas

**outputsize=compact is non-negotiable.** The free API key only supports 100 days of history. Time windows beyond ~5 months (6M, YTD, 1Y, 5Y, MAX) will show truncated data — this is expected, not a bug.

**History is lazy-loaded.** `refreshPrices` (called on mount) only fetches quotes. History is fetched separately by Dashboard and MyStockDetail on their own mount effects. If a user never visits the Dashboard or a detail page, history won't be in cache.

**15-second queue gap.** With 8 tickers, a full history fetch takes ~2 minutes. The queue is serialised — all calls, quotes and history, share the same queue. Don't add parallel fetching without redesigning the queue.

**Removing the last lot removes the position.** `REMOVE_LOT` filters out positions where `lots.length === 0`. This is intentional.

**Watchlist "Buy" converts to position.** `handleConvertComplete` in Watchlist calls `removeWatchlistEntry` directly (does not use `convertWatchlistToPosition` action). The actual position is created by `AddPositionModal` via `addPosition`. This is slightly asymmetric — the watchlist entry is removed in `onClose`, not in the reducer.

**Placeholder data:** On first load, a single AAPL position is seeded (2 lots, 2 dividends, notes). Watchlist and benchmark also have defaults. These are defined in `placeholderData.js` — update them if you want different seed data.

**`historyFailed` is in-memory only.** It resets every page load. If the chart shows an error, refreshing the page clears the flag and retries.

**Sparklines use last 30 data points** from cached history. If history hasn't loaded yet, they show a flat neutral line — not an error state.

---

## How to run

```bash
# Install dependencies (only needed once or after package.json changes)
npm install

# Start dev server
npm run dev
# → http://localhost:5173 (or 5174 if 5173 is taken)

# Stop dev server
Ctrl+C
```

**.env file** must exist in the project root:
```
VITE_ALPHA_VANTAGE_KEY=your_key_here
```

Without `.env`, the app renders with placeholder data but all API calls return undefined key errors. Vite must be restarted after creating or changing `.env`.

**Production build:**
```bash
npm run build    # outputs to dist/
npm run preview  # serves the dist/ build locally
```
