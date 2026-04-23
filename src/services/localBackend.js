/**
 * Local Python backend service — replaces Alpha Vantage for all price and
 * history data. Calls http://localhost:8000.
 *
 * Exports the same interface as alphaVantage.js so PortfolioContext only needs
 * its import path changed. alphaVantage.js is kept but no longer called.
 *
 * No request queue needed — the local backend has no rate limits.
 */
import { CACHE_TTL_MS } from '../config'

const LOCAL_BASE = 'http://localhost:8000'
const CACHE_KEY  = 'av_price_cache'   // reuse existing key to preserve cached data

// ─── Period helpers ───────────────────────────────────────────────────────────

/**
 * Maps the app's time-window keys to yfinance period strings.
 * Export so pages can map their current window to a fetch period.
 */
export const WINDOW_TO_PERIOD = {
  '1D':  '1d',
  '1W':  '5d',
  'MTD': '1mo',
  '1M':  '1mo',
  '3M':  '3mo',
  '6M':  '6mo',
  'YTD': 'ytd',
  '1Y':  '1y',
  '5Y':  '5y',
  'MAX': 'max',
}

// Ordered from smallest to largest so we can check coverage.
const PERIOD_ORDER = ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max']

/**
 * Returns true when cachedPeriod already covers the data range of requestedPeriod.
 * e.g. if we have '5y' cached, '1y' is fully covered — no refetch needed.
 */
function periodCovers(cachedPeriod, requestedPeriod) {
  if (!cachedPeriod) return false
  const ci = PERIOD_ORDER.indexOf(cachedPeriod)
  const ri = PERIOD_ORDER.indexOf(requestedPeriod)
  if (ci === -1 || ri === -1) return false
  return ci >= ri
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    console.warn('localStorage quota exceeded — cache not saved', e)
  }
}

function isFresh(entry) {
  return !!(entry?.timestamp && Date.now() - entry.timestamp < CACHE_TTL_MS)
}

function isHistoryFresh(entry) {
  return !!(entry?.historyTimestamp && Date.now() - entry.historyTimestamp < CACHE_TTL_MS)
}

// ─── Queue depth stub ─────────────────────────────────────────────────────────
// Dashboard.jsx still imports getQueueDepth from alphaVantage.js directly, so
// this is only here for completeness if anything else calls it.
export function getQueueDepth() {
  return 0
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch current price for a ticker from GET /prices/{ticker}.
 * Returns { quote, fromCache, stale, rateLimited }.
 *
 * quote shape (fields the app reads):
 *   { price, open, high, low, prevClose, volume, change, changePercent }
 * Fields not provided by the local backend are set to null.
 */
export async function fetchQuote(ticker, forceRefresh = false) {
  const cache = loadCache()
  const entry = cache[ticker]

  if (!forceRefresh && entry?.quote && isFresh(entry)) {
    return { quote: entry.quote, fromCache: true, stale: false, rateLimited: false }
  }

  try {
    const res = await fetch(`${LOCAL_BASE}/prices/${encodeURIComponent(ticker)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const quote = {
      price:         json.current_price,
      open:          null,
      high:          null,
      low:           null,
      prevClose:     null,
      volume:        null,
      change:        null,
      changePercent: null,
    }

    const updatedCache = loadCache()
    updatedCache[ticker] = {
      ...(updatedCache[ticker] ?? {}),
      quote,
      timestamp: Date.now(),
    }
    saveCache(updatedCache)

    return { quote, fromCache: false, stale: false, rateLimited: false }
  } catch (err) {
    console.warn(`fetchQuote(${ticker}) failed:`, err.message)
    const e = loadCache()[ticker]
    if (e?.quote) return { quote: e.quote, fromCache: true, stale: true, rateLimited: false }
    return { quote: null, fromCache: false, stale: true, rateLimited: false, error: err.message }
  }
}

/**
 * Fetch historical close prices from GET /history/{ticker}?period={period}.
 * Converts the array response to { 'YYYY-MM-DD': closePrice } for compatibility.
 *
 * If the cached data already covers a >= period, returns cache without fetching.
 * Returns { history, period, fromCache, stale, rateLimited }.
 */
export async function fetchHistory(ticker, forceRefresh = false, period = '1y') {
  const cache = loadCache()
  const entry = cache[ticker]

  if (
    !forceRefresh &&
    entry?.history &&
    isHistoryFresh(entry) &&
    periodCovers(entry.historyPeriod, period)
  ) {
    return {
      history:     entry.history,
      period:      entry.historyPeriod,
      fromCache:   true,
      stale:       false,
      rateLimited: false,
    }
  }

  try {
    const res = await fetch(
      `${LOCAL_BASE}/history/${encodeURIComponent(ticker)}?period=${encodeURIComponent(period)}`
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    // Convert [{date, close}] → {'YYYY-MM-DD': number}
    const history = {}
    for (const { date, close } of (json.history ?? [])) {
      history[date] = close
    }

    const updatedCache = loadCache()
    updatedCache[ticker] = {
      ...(updatedCache[ticker] ?? {}),
      history,
      historyPeriod:    period,
      historyTimestamp: Date.now(),
    }
    saveCache(updatedCache)

    return { history, period, fromCache: false, stale: false, rateLimited: false }
  } catch (err) {
    console.warn(`fetchHistory(${ticker}, ${period}) failed:`, err.message)
    const e = loadCache()[ticker]
    if (e?.history) {
      return {
        history:     e.history,
        period:      e.historyPeriod ?? null,
        fromCache:   true,
        stale:       true,
        rateLimited: false,
      }
    }
    return { history: null, period: null, fromCache: false, stale: true, rateLimited: false, error: err.message }
  }
}

/**
 * Fetch both quote and history for a ticker (used for manual full-refresh).
 * Returns { quote, history, period, fromCache, stale, rateLimited }.
 */
export async function fetchTickerData(ticker, forceRefresh = false, period = '1y') {
  const quoteResult = await fetchQuote(ticker, forceRefresh)
  const histResult  = await fetchHistory(ticker, forceRefresh, period)
  return {
    quote:       quoteResult.quote,
    history:     histResult.history,
    period:      histResult.period,
    fromCache:   quoteResult.fromCache && histResult.fromCache,
    stale:       quoteResult.stale || histResult.stale,
    rateLimited: false,
  }
}

/**
 * Fetch sector and company name for a ticker from GET /prices/{ticker}.
 * Returns { sector, company_name } or null on any failure. Never throws.
 */
export async function fetchTickerInfo(ticker) {
  if (!ticker) return null
  try {
    const res = await fetch(`${LOCAL_BASE}/prices/${encodeURIComponent(ticker.toUpperCase())}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      sector:       data.sector ?? null,
      company_name: data.company_name ?? null,
    }
  } catch {
    return null
  }
}

/** Backward-compatible wrapper — returns sector string only. */
export async function fetchSector(ticker) {
  const info = await fetchTickerInfo(ticker)
  return info?.sector ?? null
}

/**
 * Read the current cached entry for a ticker (no API call).
 */
export function getCachedEntry(ticker) {
  return loadCache()[ticker] ?? null
}

/**
 * Inject placeholder price data into the cache for a ticker on first load.
 * Sets timestamp=0 so real data is fetched as soon as possible.
 */
export function seedCacheEntry(ticker, quote, history) {
  const cache = loadCache()
  if (!cache[ticker]) {
    cache[ticker] = { quote, history, historyPeriod: null, timestamp: 0, historyTimestamp: 0 }
    saveCache(cache)
  }
}

/**
 * Return the most recent timestamp any quote was fetched.
 */
export function getLastUpdatedTimestamp() {
  const cache = loadCache()
  const timestamps = Object.values(cache)
    .map(e => e?.timestamp ?? 0)
    .filter(t => t > 0)
  return timestamps.length > 0 ? Math.max(...timestamps) : null
}

/**
 * Return the oldest historyTimestamp across the given tickers,
 * or null if no history has been cached for any of them.
 */
export function getOldestHistoryTimestamp(tickers) {
  const cache = loadCache()
  const timestamps = tickers
    .map(t => cache[t]?.historyTimestamp ?? 0)
    .filter(ts => ts > 0)
  return timestamps.length > 0 ? Math.min(...timestamps) : null
}
