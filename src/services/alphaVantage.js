/**
 * Alpha Vantage API service with localStorage caching and request queue.
 * All API calls go through this file — never call fetch() for stock data anywhere else.
 *
 * Rate limiting: Alpha Vantage free tier = 5 calls/minute, 25 calls/day.
 * The request queue serialises all calls with a minimum 15-second gap so
 * simultaneous requests from multiple tickers never trigger the per-minute throttle.
 */
import { API_KEY, API_BASE_URL, CACHE_TTL_MS } from '../config'

const CACHE_KEY  = 'av_price_cache'
const USAGE_KEY  = 'av_api_usage'
const QUEUE_GAP  = 15_000   // ms between queued API calls (4/min, safely under 5/min limit)

// ─── Request queue ────────────────────────────────────────────────────────────
// All live API calls are funnelled through enqueueApiCall so they execute one at
// a time with at least QUEUE_GAP ms between each call.

let _queueTail    = Promise.resolve()
let _lastCallTime = 0
let _queueDepth   = 0

function enqueueApiCall(fn) {
  _queueDepth++
  const p = _queueTail.then(async () => {
    try {
      const elapsed = Date.now() - _lastCallTime
      const wait = Math.max(0, QUEUE_GAP - elapsed)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      _lastCallTime = Date.now()
      incrementUsage()
      return await fn()
    } finally {
      _queueDepth--
    }
  })
  // Prevent a rejection from freezing the queue for subsequent callers
  _queueTail = p.catch(() => {})
  return p
}

/** How many calls are currently waiting in or executing through the queue. */
export function getQueueDepth() {
  return _queueDepth
}

// ─── API usage counter (stored in localStorage, resets every 24 h) ────────────

function loadUsage() {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}')
    const now = Date.now()
    if (raw.resetAt && now > raw.resetAt) {
      // New 24-hour window
      return { count: 0, resetAt: now + 24 * 3_600_000 }
    }
    return {
      count:   raw.count   ?? 0,
      resetAt: raw.resetAt ?? now + 24 * 3_600_000,
    }
  } catch {
    return { count: 0, resetAt: Date.now() + 24 * 3_600_000 }
  }
}

function incrementUsage() {
  const usage = loadUsage()
  const updated = {
    count:   usage.count + 1,
    resetAt: usage.resetAt,
  }
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(updated)) } catch {}
}

/**
 * Returns current API usage stats for display.
 * { callsToday: number, resetAt: number, timeUntilReset: string }
 */
export function getApiUsageStats() {
  const usage = loadUsage()
  const now   = Date.now()
  const msLeft = Math.max(0, (usage.resetAt ?? now) - now)
  const h = Math.floor(msLeft / 3_600_000)
  const m = Math.floor((msLeft % 3_600_000) / 60_000)
  return {
    callsToday:     usage.count,
    resetAt:        usage.resetAt,
    timeUntilReset: msLeft > 0 ? `${h}h ${m}m` : 'now',
  }
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

/** Quote freshness: uses the shared entry timestamp set when the quote was fetched. */
function isFresh(entry) {
  return !!(entry?.timestamp && Date.now() - entry.timestamp < CACHE_TTL_MS)
}

/**
 * History freshness: uses a SEPARATE historyTimestamp so that a quote fetch
 * (which updates `timestamp`) does not incorrectly mark un-fetched history as
 * fresh when lazy loading is in effect.
 */
function isHistoryFresh(entry) {
  return !!(entry?.historyTimestamp && Date.now() - entry.historyTimestamp < CACHE_TTL_MS)
}

/** Detect Alpha Vantage rate-limit responses (Note key = per-minute/daily limit hit). */
function isRateLimited(json) {
  if (!json) return false
  if (json.Information) {
    console.warn('[AlphaVantage] Premium feature required — downgrade request or upgrade plan:', json.Information)
    return false
  }
  const note = json.Note || ''
  return note.toLowerCase().includes('api call frequency') || note.toLowerCase().includes('thank you for using alpha vantage')
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch current quote for a ticker.
 * Cache check happens immediately; only actual network calls are queued.
 * Returns { quote, fromCache, stale, rateLimited }.
 */
export async function fetchQuote(ticker, forceRefresh = false) {
  const cache = loadCache()
  const entry = cache[ticker]

  if (!forceRefresh && entry?.quote && isFresh(entry)) {
    return { quote: entry.quote, fromCache: true, stale: false, rateLimited: false }
  }

  return enqueueApiCall(async () => {
    // Re-check cache inside the queue in case another queued call already populated it
    const freshCache = loadCache()
    const freshEntry = freshCache[ticker]
    if (!forceRefresh && freshEntry?.quote && isFresh(freshEntry)) {
      return { quote: freshEntry.quote, fromCache: true, stale: false, rateLimited: false }
    }

    try {
      const url = `${API_BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      if (isRateLimited(json)) {
        return {
          quote:       freshEntry?.quote ?? null,
          fromCache:   !!freshEntry?.quote,
          stale:       true,
          rateLimited: true,
        }
      }

      const raw = json['Global Quote']
      if (!raw || !raw['05. price']) throw new Error('No Global Quote in response')

      const quote = {
        price:         parseFloat(raw['05. price']),
        open:          parseFloat(raw['02. open']),
        high:          parseFloat(raw['03. high']),
        low:           parseFloat(raw['04. low']),
        prevClose:     parseFloat(raw['08. previous close']),
        volume:        parseInt(raw['06. volume'], 10),
        change:        parseFloat(raw['09. change']),
        changePercent: parseFloat(raw['10. change percent']),
      }

      // Update quote timestamp; preserve existing history & historyTimestamp
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
  })
}

/**
 * Fetch daily historical close prices for a ticker.
 * Stores history as { 'YYYY-MM-DD': closePrice } for space efficiency.
 * Uses a separate historyTimestamp so quote fetches don't falsely mark history fresh.
 * Returns { history, fromCache, stale, rateLimited }.
 */
export async function fetchHistory(ticker, forceRefresh = false) {
  const cache = loadCache()
  const entry = cache[ticker]

  if (!forceRefresh && entry?.history && isHistoryFresh(entry)) {
    return { history: entry.history, fromCache: true, stale: false, rateLimited: false }
  }

  return enqueueApiCall(async () => {
    // Re-check inside the queue
    const freshCache = loadCache()
    const freshEntry = freshCache[ticker]
    if (!forceRefresh && freshEntry?.history && isHistoryFresh(freshEntry)) {
      return { history: freshEntry.history, fromCache: true, stale: false, rateLimited: false }
    }

    try {
      const url = `${API_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      if (isRateLimited(json)) {
        return {
          history:     freshEntry?.history ?? null,
          fromCache:   !!freshEntry?.history,
          stale:       true,
          rateLimited: true,
        }
      }

      const ts = json['Time Series (Daily)']
      if (!ts) throw new Error('No Time Series (Daily) in response')

      const history = {}
      for (const [date, vals] of Object.entries(ts)) {
        history[date] = parseFloat(vals['4. close'])
      }

      // Update historyTimestamp separately — do NOT touch the quote timestamp
      const updatedCache = loadCache()
      updatedCache[ticker] = {
        ...(updatedCache[ticker] ?? {}),
        history,
        historyTimestamp: Date.now(),
      }
      saveCache(updatedCache)

      return { history, fromCache: false, stale: false, rateLimited: false }
    } catch (err) {
      console.warn(`fetchHistory(${ticker}) failed:`, err.message)
      const e = loadCache()[ticker]
      if (e?.history) return { history: e.history, fromCache: true, stale: true, rateLimited: false }
      return { history: null, fromCache: false, stale: true, rateLimited: false, error: err.message }
    }
  })
}

/**
 * Fetch both quote and history for a ticker (used for manual full-refresh).
 * Each call goes through the queue independently, so they are spaced correctly.
 */
export async function fetchTickerData(ticker, forceRefresh = false) {
  const quoteResult = await fetchQuote(ticker, forceRefresh)
  if (quoteResult.rateLimited) {
    const cached = loadCache()[ticker]
    return {
      quote:       quoteResult.quote,
      history:     cached?.history ?? null,
      fromCache:   true,
      stale:       true,
      rateLimited: true,
    }
  }
  const histResult = await fetchHistory(ticker, forceRefresh)
  return {
    quote:       quoteResult.quote,
    history:     histResult.history,
    fromCache:   quoteResult.fromCache && histResult.fromCache,
    stale:       quoteResult.stale || histResult.stale,
    rateLimited: histResult.rateLimited,
  }
}

/**
 * Read the current cached entry for a ticker (no API call).
 */
export function getCachedEntry(ticker) {
  return loadCache()[ticker] ?? null
}

/**
 * Inject placeholder price data into the cache for a ticker on first load.
 * Sets timestamp=0 so real data is fetched as soon as the queue processes it.
 */
export function seedCacheEntry(ticker, quote, history) {
  const cache = loadCache()
  if (!cache[ticker]) {
    cache[ticker] = { quote, history, timestamp: 0, historyTimestamp: 0 }
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
