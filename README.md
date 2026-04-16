# Stock Portfolio Tracker

Stock Portfolio Tracker — A personal investment portfolio dashboard with live market data, multi-agent-ready architecture, and full portfolio analytics.

---

## Overview

Stock Portfolio Tracker is a manually-curated personal portfolio tracker built with React and Vite, powered by live stock data from the Alpha Vantage API. It tracks invested positions, calculates gains and losses, visualizes portfolio performance over time, and includes a watchlist for stocks under consideration. All data persists locally in the browser via localStorage. No account, no backend, no login required.

---

## Features

### Dashboard
- Total portfolio value vs. total amount invested
- Total and percentage gain/loss
- Realized vs. unrealized gains displayed separately and clearly labeled
- Portfolio value over time chart with 10 time window filters (1D, 1W, MTD, 1M, 3M, 6M, YTD, 1Y, 5Y, MAX)
- Sector allocation donut chart
- S&P 500 benchmark comparison with manually entered index values
- Portfolio weight breakdown per position

### My Stocks
- Card grid of all positions with click-through to individual stock detail pages
- Live price and OHLCV data per stock
- Per-lot purchase history with average cost basis
- Total gain/loss in dollars and percentage
- Dividend logger factored into total return
- Price history chart with average cost reference line
- Free-text notes field for thesis and observations

### All Positions
- Sortable list view and card grid toggle
- Sparkline trend indicators per stock — green if above cost basis, red if below
- Totals row showing aggregate value, invested, and gain/loss
- Add Position button

### Watchlist
- Tracks stocks with no capital invested
- Shows current price vs. target buy price gap in dollars and percentage
- Convert-to-position flow that pre-fills the Add Position form
- Edit and delete per entry

---

## Tech Stack

| Technology | Purpose |
|---|---|
| React 18 + Vite 5 | Frontend framework and build tool |
| React Router v6 | Tab navigation and routing |
| Recharts | All charts — line, donut, sparklines |
| Alpha Vantage API | Live stock quotes and historical price data |
| localStorage | All data persistence — portfolio, cache, settings |

---

## Getting Started

1. Clone the repository
2. Run `npm install`
3. Get a free API key from [alphavantage.co](https://www.alphavantage.co)
4. Create a `.env` file in the project root and add:
   ```
   VITE_ALPHA_VANTAGE_KEY=your_key_here
   ```
5. Run `npm run dev`
6. Open `http://localhost:5173` in your browser

---

## API Key & Security

The Alpha Vantage API key is stored only in the `.env` file, which is listed in `.gitignore` and must never be committed to version control. Anyone cloning this repository must supply their own key. The key is referenced exclusively in source code as `import.meta.env.VITE_ALPHA_VANTAGE_KEY` and is never hardcoded anywhere.

---

## Data Persistence

All portfolio data — positions, purchase lots, dividends, notes, watchlist entries, and S&P 500 benchmark values — is stored in the browser's localStorage. Clearing browser data will erase the portfolio entirely. No server or database is involved.

---

## API Usage & Caching

The app caches all price data in localStorage with a timestamp and will not call the Alpha Vantage API again until that data is stale (older than 24 hours). The free tier allows 25 requests per day. A manual Refresh button is available on the Dashboard but warns the user before consuming quota. If the daily limit is hit or a request fails, the app falls back to the most recently cached data and displays a visible warning banner.

---

## Placeholder Data

On first load, the app seeds 6 positions — AAPL (with two separate purchase lots), NVDA, MSFT, UNH, JPM, and XOM — and 2 watchlist entries (META and AMZN) so all views are immediately usable before entering real data. Live prices are fetched from Alpha Vantage immediately after seeding and replace the placeholder values automatically.

---

## Project Structure

```
src/
  config.js                       ← API key, sector list, sector colors
  services/alphaVantage.js        ← All API calls + 24h localStorage cache logic
  store/PortfolioContext.jsx      ← Global state (useReducer + localStorage persistence)
  store/placeholderData.js        ← Seed data for first load
  utils/calculations.js           ← Pure portfolio math functions
  utils/formatters.js             ← Currency, percent, date formatting
  utils/timeWindows.js            ← 1D/1W/MTD/1M/3M/6M/YTD/1Y/5Y/MAX logic
  components/NavBar.jsx           ← Top navigation bar with four tabs
  components/Footer.jsx           ← Footer with data disclaimer
  components/Modal.jsx            ← Reusable modal wrapper
  components/ConfirmDialog.jsx    ← Delete confirmation dialog
  components/Sparkline.jsx        ← Small inline trend chart (no axes)
  components/TimeWindowSelector.jsx ← Time window button group
  components/LoadingSpinner.jsx   ← Inline loading indicator
  components/AddPositionModal.jsx ← Add position / add lot form
  components/AddWatchlistModal.jsx ← Add / edit watchlist entry form
  pages/Dashboard.jsx             ← Tab 1: portfolio overview and charts
  pages/MyStocks.jsx              ← Tab 2: card grid of all positions
  pages/MyStockDetail.jsx         ← Tab 2 detail: individual stock view at /stocks/:ticker
  pages/AllPositions.jsx          ← Tab 3: sortable list and grid view
  pages/Watchlist.jsx             ← Tab 4: watchlist with price gap tracking
  index.css                       ← Global dark theme styles and design tokens
  main.jsx                        ← React entry point
  App.jsx                         ← Router setup and layout shell
```

---

## Roadmap — Potential V3 Features

- **Sell / close positions** — log a sale at a specific price to realize gains and track realized P&L separately from unrealized
- **CSV import / export** — export portfolio to CSV for backup; import historical transactions
- **Price alerts** — flag watchlist entries when price crosses the target buy price
- **Multiple portfolios** — separate namespaced localStorage keys per portfolio
- **Mobile layout** — responsive overhaul of table views for small screens
- **Additional chart types** — individual stock volume bars, candlestick chart option
- **Performance optimization** — lazy-load history only when the chart is in view, reducing first-load API calls
- **localStorage compression** — LZ compression to handle 20+ years of history data across multiple tickers within browser storage limits

---

## Disclaimer

This tool is for personal tracking and educational purposes only. It is not financial advice. Always conduct your own research before making investment decisions.
