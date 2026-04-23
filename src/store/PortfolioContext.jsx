import { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchQuote,
  fetchHistory,
  getCachedEntry,
  seedCacheEntry,
  getLastUpdatedTimestamp,
} from '../services/localBackend'
import {
  PLACEHOLDER_POSITIONS,
  PLACEHOLDER_WATCHLIST,
  PLACEHOLDER_BENCHMARK,
  PLACEHOLDER_PRICES,
} from './placeholderData'
import { buildPortfolioHistory } from '../utils/calculations'

// ─── Benchmark helpers ────────────────────────────────────────────────────────

/** Returns the earliest lot purchase date across all positions, or null. */
export function getEarliestPurchaseDate(positions) {
  const dates = positions.flatMap(p => p.lots.map(l => l.date)).filter(Boolean)
  if (dates.length === 0) return null
  return dates.sort()[0]
}

/**
 * Rebase a {date, value}[] series to 100 at the first available trading day
 * on or after anchorDate. Returns [] if anchorDate is beyond the series end.
 */
export function normalizeSeries(series, anchorDate) {
  if (!series || series.length === 0 || !anchorDate) return []
  const anchorEntry = series.find(d => d.date >= anchorDate)
  if (!anchorEntry || !anchorEntry.value) return []
  const base = anchorEntry.value
  return series
    .filter(d => d.date >= anchorEntry.date)
    .map(d => ({ date: d.date, value: (d.value / base) * 100 }))
}

/**
 * Derives normalized portfolio and benchmark series from state.
 * Returns { anchorDate, portfolioNormalized, benchmarkNormalized } or null
 * if ^GSPC history is not yet loaded or there are no positions.
 */
export function computeBenchmarkData(state) {
  const { positions, priceCache } = state
  if (!positions || positions.length === 0) return null

  const anchorDate = getEarliestPurchaseDate(positions)
  if (!anchorDate) return null

  const benchmarkHistory = priceCache['^GSPC']?.history
  if (!benchmarkHistory) return null

  const portfolioSeries = buildPortfolioHistory(positions, priceCache, null)
  if (portfolioSeries.length === 0) return null

  const benchmarkSeries = Object.keys(benchmarkHistory)
    .sort()
    .map(date => ({ date, value: benchmarkHistory[date] }))

  const portfolioNormalized = normalizeSeries(portfolioSeries, anchorDate)
  const benchmarkNormalized = normalizeSeries(benchmarkSeries, anchorDate)

  return { anchorDate, portfolioNormalized, benchmarkNormalized }
}

// ─── LocalStorage keys ────────────────────────────────────────────────────────
const LS_POSITIONS  = 'pf_positions'
const LS_WATCHLIST  = 'pf_watchlist'
const LS_BENCHMARK  = 'pf_benchmark'

// ─── Helpers ─────────────────────────────────────────────────────────────────
function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch (e) { console.warn('localStorage write failed', e) }
}
function uid() { return crypto.randomUUID() }

// ─── Initial state ────────────────────────────────────────────────────────────
function buildInitialState() {
  const positions = loadLS(LS_POSITIONS, null)
  const watchlist = loadLS(LS_WATCHLIST, null)
  const benchmark = loadLS(LS_BENCHMARK, null)
  const isFirstLoad = positions === null

  // Seed placeholder prices into the API cache so they show up immediately
  if (isFirstLoad) {
    for (const [ticker, price] of Object.entries(PLACEHOLDER_PRICES)) {
      seedCacheEntry(ticker, { price, open: price, high: price, low: price, prevClose: price, volume: 0, change: 0, changePercent: 0 }, null)
    }
  }

  // Build priceCache from localStorage (API service cache)
  const priceCache = buildPriceCacheFromLS()

  return {
    positions:  isFirstLoad ? PLACEHOLDER_POSITIONS : positions,
    watchlist:  watchlist ?? PLACEHOLDER_WATCHLIST,
    benchmark:  benchmark ?? PLACEHOLDER_BENCHMARK,
    priceCache,
    lastUpdated: getLastUpdatedTimestamp(),
    loadingTickers: new Set(),
    historyLoadingTickers: new Set(),
    historyFailed: false,
    apiWarning: null,
    isRefreshing: false,
  }
}

function buildPriceCacheFromLS() {
  try {
    const raw = JSON.parse(localStorage.getItem('av_price_cache') || '{}')
    const cache = {}
    for (const [ticker, entry] of Object.entries(raw)) {
      cache[ticker] = {
        quote:            entry.quote            ?? null,
        history:          entry.history          ?? null,
        historyPeriod:    entry.historyPeriod    ?? null,
        timestamp:        entry.timestamp        ?? 0,
        historyTimestamp: entry.historyTimestamp ?? 0,
      }
    }
    return cache
  } catch {
    return {}
  }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {

    // ── Positions ──────────────────────────────────────────────────────────
    case 'ADD_POSITION': {
      const existing = state.positions.find(p => p.ticker === action.payload.ticker)
      let positions
      if (existing) {
        // Add a new lot to the existing position
        positions = state.positions.map(p =>
          p.ticker === action.payload.ticker
            ? { ...p, lots: [...p.lots, { id: uid(), ...action.payload.lot }] }
            : p
        )
      } else {
        const newPos = {
          id: uid(),
          ticker: action.payload.ticker,
          companyName: action.payload.companyName,
          sector: action.payload.sector,
          lots: [{ id: uid(), ...action.payload.lot }],
          dividends: [],
          notes: '',
        }
        positions = [...state.positions, newPos]
      }
      return { ...state, positions }
    }

    case 'UPDATE_POSITION': {
      const positions = state.positions.map(p =>
        p.id === action.id ? { ...p, ...action.payload } : p
      )
      return { ...state, positions }
    }

    case 'REMOVE_POSITION': {
      return { ...state, positions: state.positions.filter(p => p.id !== action.id) }
    }

    case 'ADD_LOT': {
      const positions = state.positions.map(p =>
        p.id === action.positionId
          ? { ...p, lots: [...p.lots, { id: uid(), ...action.payload }] }
          : p
      )
      return { ...state, positions }
    }

    case 'UPDATE_LOT': {
      const positions = state.positions.map(p =>
        p.id === action.positionId
          ? { ...p, lots: p.lots.map(l => l.id === action.lotId ? { ...l, ...action.payload } : l) }
          : p
      )
      return { ...state, positions }
    }

    case 'REMOVE_LOT': {
      const positions = state.positions.map(p => {
        if (p.id !== action.positionId) return p
        const lots = p.lots.filter(l => l.id !== action.lotId)
        return { ...p, lots }
      }).filter(p => p.lots.length > 0)
      return { ...state, positions }
    }

    case 'ADD_DIVIDEND': {
      const positions = state.positions.map(p =>
        p.id === action.positionId
          ? { ...p, dividends: [...(p.dividends ?? []), { id: uid(), ...action.payload }] }
          : p
      )
      return { ...state, positions }
    }

    case 'REMOVE_DIVIDEND': {
      const positions = state.positions.map(p =>
        p.id === action.positionId
          ? { ...p, dividends: (p.dividends ?? []).filter(d => d.id !== action.dividendId) }
          : p
      )
      return { ...state, positions }
    }

    case 'UPDATE_NOTES': {
      const positions = state.positions.map(p =>
        p.id === action.positionId ? { ...p, notes: action.notes } : p
      )
      return { ...state, positions }
    }

    // ── Watchlist ──────────────────────────────────────────────────────────
    case 'ADD_WATCHLIST': {
      return { ...state, watchlist: [...state.watchlist, { id: uid(), ...action.payload }] }
    }
    case 'UPDATE_WATCHLIST': {
      return {
        ...state,
        watchlist: state.watchlist.map(e => e.id === action.id ? { ...e, ...action.payload } : e),
      }
    }
    case 'REMOVE_WATCHLIST': {
      return { ...state, watchlist: state.watchlist.filter(e => e.id !== action.id) }
    }
    case 'CONVERT_WATCHLIST': {
      // Remove from watchlist, caller handles adding the position
      return { ...state, watchlist: state.watchlist.filter(e => e.id !== action.id) }
    }

    // ── Benchmark ──────────────────────────────────────────────────────────
    case 'UPDATE_BENCHMARK': {
      return { ...state, benchmark: { ...state.benchmark, ...action.payload } }
    }

    // ── Price cache ────────────────────────────────────────────────────────
    case 'SET_TICKER_DATA': {
      const prev = state.priceCache[action.ticker] ?? {}
      const priceCache = {
        ...state.priceCache,
        [action.ticker]: {
          quote:            action.quote            ?? prev.quote           ?? null,
          history:          action.history          ?? prev.history         ?? null,
          historyPeriod:    action.historyPeriod    ?? prev.historyPeriod   ?? null,
          timestamp:        action.timestamp        ?? prev.timestamp       ?? Date.now(),
          historyTimestamp: action.historyTimestamp ?? prev.historyTimestamp ?? 0,
        },
      }
      return { ...state, priceCache }
    }

    case 'SET_LOADING_TICKER': {
      const loadingTickers = new Set(state.loadingTickers)
      if (action.loading) loadingTickers.add(action.ticker)
      else loadingTickers.delete(action.ticker)
      return { ...state, loadingTickers }
    }

    case 'SET_HISTORY_LOADING_TICKER': {
      const historyLoadingTickers = new Set(state.historyLoadingTickers)
      if (action.loading) historyLoadingTickers.add(action.ticker)
      else historyLoadingTickers.delete(action.ticker)
      return { ...state, historyLoadingTickers }
    }

    case 'SET_HISTORY_FAILED':
      return { ...state, historyFailed: action.value }

    case 'SET_REFRESHING':
      return { ...state, isRefreshing: action.value }

    case 'SET_ALL_HISTORY': {
      const priceCache = { ...state.priceCache }
      for (const { ticker, history, historyPeriod, historyTimestamp } of action.payload) {
        const prev = priceCache[ticker] ?? {}
        priceCache[ticker] = {
          ...prev,
          history:          history       != null ? history       : (prev.history          ?? null),
          historyPeriod:    historyPeriod != null ? historyPeriod : (prev.historyPeriod    ?? null),
          historyTimestamp: historyTimestamp       ?? prev.historyTimestamp ?? 0,
        }
      }
      return { ...state, priceCache }
    }

    case 'SET_API_WARNING':
      return { ...state, apiWarning: action.message }

    case 'SET_LAST_UPDATED':
      return { ...state, lastUpdated: action.ts }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const PortfolioContext = createContext(null)

export function PortfolioProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, buildInitialState)
  const fetchingRef = useRef(false)

  // ── Analysis tab persistent state ─────────────────────────────────────────
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisNewsData, setAnalysisNewsData] = useState(null)
  const [scenarioResult, setScenarioResult] = useState(null)
  const [scenarioInput, setScenarioInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [showFullAnalysis, setShowFullAnalysis] = useState(false)

  // ── Persist portfolio data to localStorage on every change ────────────────
  useEffect(() => { saveLS(LS_POSITIONS, state.positions) }, [state.positions])
  useEffect(() => { saveLS(LS_WATCHLIST, state.watchlist) }, [state.watchlist])
  useEffect(() => { saveLS(LS_BENCHMARK, state.benchmark) }, [state.benchmark])

  // Sync priceCache into state whenever AV cache in localStorage changes
  // (the service writes directly to localStorage; we read it back here)
  const syncPriceCache = useCallback(() => {
    const fresh = buildPriceCacheFromLS()
    dispatch({ type: 'SET_TICKER_DATA', ticker: '__sync__', quote: null, history: null })
    // Simpler: just rebuild entire priceCache
    for (const [ticker, entry] of Object.entries(fresh)) {
      dispatch({ type: 'SET_TICKER_DATA', ticker, quote: entry.quote, history: entry.history, timestamp: entry.timestamp })
    }
  }, [])

  // ── Fetch quotes for all tickers (on mount and manual refresh) ───────────
  // Fix 2: on auto-load only quotes are fetched; history is loaded lazily.
  // On a forced manual refresh both quotes AND history are fetched via fetchTickerData.
  const refreshPrices = useCallback(async (force = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    dispatch({ type: 'SET_REFRESHING', value: true })
    dispatch({ type: 'SET_API_WARNING', message: null })

    const tickers = [
      ...new Set([
        ...state.positions.map(p => p.ticker),
        ...state.watchlist.map(w => w.ticker),
      ]),
    ]

    let anyRateLimited = false
    let anyStale = false

    for (const ticker of tickers) {
      dispatch({ type: 'SET_LOADING_TICKER', ticker, loading: true })
      try {
        const result = await fetchQuote(ticker, force)

        if (result.rateLimited) anyRateLimited = true
        if (result.stale)       anyStale       = true

        dispatch({
          type:      'SET_TICKER_DATA',
          ticker,
          quote:     result.quote,
          timestamp: Date.now(),
        })
      } catch (e) {
        console.warn(`Failed to fetch ${ticker}:`, e)
      } finally {
        dispatch({ type: 'SET_LOADING_TICKER', ticker, loading: false })
      }
    }

    if (anyRateLimited) {
      dispatch({ type: 'SET_API_WARNING', message: 'Alpha Vantage rate limit reached. Showing cached prices — they may be outdated.' })
    } else if (anyStale) {
      dispatch({ type: 'SET_API_WARNING', message: 'Some prices could not be refreshed. Cached values are shown.' })
    }

    dispatch({ type: 'SET_LAST_UPDATED', ts: getLastUpdatedTimestamp() ?? Date.now() })
    dispatch({ type: 'SET_REFRESHING', value: false })
    fetchingRef.current = false
  }, [state.positions, state.watchlist])

  // Fetch quotes on mount
  useEffect(() => {
    refreshPrices(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Lazy history fetch — called by Dashboard and MyStockDetail on mount ───
  const historyFetchingRef = useRef(false)

  const fetchHistoryForPositions = useCallback(async (force = false, period = '1y') => {
    if (historyFetchingRef.current) return
    historyFetchingRef.current = true
    dispatch({ type: 'SET_HISTORY_FAILED', value: false })

    const tickers = [...new Set(state.positions.map(p => p.ticker))]

    // Mark all as loading before any fetches begin
    for (const ticker of tickers) {
      dispatch({ type: 'SET_HISTORY_LOADING_TICKER', ticker, loading: true })
    }

    // Fire all history fetches in parallel
    const results = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const result = await fetchHistory(ticker, force, period)
          const cached = getCachedEntry(ticker)
          return {
            ticker,
            history:          result.history,
            historyPeriod:    result.period ?? undefined,
            historyTimestamp: result.fromCache && !force
              ? (cached?.historyTimestamp ?? Date.now())
              : Date.now(),
            failed: !!(result.rateLimited || result.stale),
          }
        } catch (e) {
          console.warn(`fetchHistory(${ticker}) failed:`, e)
          return { ticker, history: null, historyPeriod: undefined, historyTimestamp: 0, failed: true }
        }
      })
    )

    // Single state update after all tickers have resolved — prevents intermediate renders
    dispatch({ type: 'SET_ALL_HISTORY', payload: results })

    for (const ticker of tickers) {
      dispatch({ type: 'SET_HISTORY_LOADING_TICKER', ticker, loading: false })
    }

    if (results.some(r => r.failed)) dispatch({ type: 'SET_HISTORY_FAILED', value: true })

    // Fetch ^GSPC benchmark history — always max period, failure is non-fatal
    try {
      const benchResult = await fetchHistory('^GSPC', force, 'max')
      if (benchResult.history) {
        dispatch({
          type:             'SET_TICKER_DATA',
          ticker:           '^GSPC',
          history:          benchResult.history,
          historyPeriod:    'max',
          historyTimestamp: Date.now(),
        })
      }
    } catch {
      // Benchmark fetch failure does not affect positions or historyFailed
    }

    historyFetchingRef.current = false
  }, [state.positions])

  const fetchHistoryForTicker = useCallback(async (ticker, force = false, period = '1y') => {
    dispatch({ type: 'SET_HISTORY_LOADING_TICKER', ticker, loading: true })
    try {
      const result = await fetchHistory(ticker, force, period)
      const cached = getCachedEntry(ticker)
      dispatch({
        type:             'SET_TICKER_DATA',
        ticker,
        history:          result.history,
        historyPeriod:    result.period ?? undefined,
        historyTimestamp: result.fromCache && !force
          ? (cached?.historyTimestamp ?? Date.now())
          : Date.now(),
      })
    } catch (e) {
      console.warn(`fetchHistoryForTicker(${ticker}) failed:`, e)
    } finally {
      dispatch({ type: 'SET_HISTORY_LOADING_TICKER', ticker, loading: false })
    }
  }, [])

  // ── Fetch quote for a newly-added ticker ──────────────────────────────────
  const fetchSingleTicker = useCallback(async (ticker) => {
    dispatch({ type: 'SET_LOADING_TICKER', ticker, loading: true })
    try {
      const result = await fetchQuote(ticker, true)
      dispatch({ type: 'SET_TICKER_DATA', ticker, quote: result.quote, timestamp: Date.now() })
      dispatch({ type: 'SET_LAST_UPDATED', ts: Date.now() })
    } finally {
      dispatch({ type: 'SET_LOADING_TICKER', ticker, loading: false })
    }
  }, [])

  // ── Action creators ───────────────────────────────────────────────────────
  const actions = {
    addPosition(data) {
      dispatch({ type: 'ADD_POSITION', payload: data })
      // Trigger a fetch if ticker is new
      const existing = state.positions.find(p => p.ticker === data.ticker)
      const cached = getCachedEntry(data.ticker)
      if (!existing && (!cached || !cached.quote)) {
        fetchSingleTicker(data.ticker)
      }
    },

    updatePosition(id, payload) {
      dispatch({ type: 'UPDATE_POSITION', id, payload })
    },

    removePosition(id) {
      dispatch({ type: 'REMOVE_POSITION', id })
    },

    addLot(positionId, payload) {
      dispatch({ type: 'ADD_LOT', positionId, payload })
    },

    updateLot(positionId, lotId, payload) {
      dispatch({ type: 'UPDATE_LOT', positionId, lotId, payload })
    },

    removeLot(positionId, lotId) {
      dispatch({ type: 'REMOVE_LOT', positionId, lotId })
    },

    addDividend(positionId, payload) {
      dispatch({ type: 'ADD_DIVIDEND', positionId, payload })
    },

    removeDividend(positionId, dividendId) {
      dispatch({ type: 'REMOVE_DIVIDEND', positionId, dividendId })
    },

    updateNotes(positionId, notes) {
      dispatch({ type: 'UPDATE_NOTES', positionId, notes })
    },

    addWatchlistEntry(payload) {
      dispatch({ type: 'ADD_WATCHLIST', payload })
      const cached = getCachedEntry(payload.ticker)
      if (!cached || !cached.quote) fetchSingleTicker(payload.ticker)
    },

    updateWatchlistEntry(id, payload) {
      dispatch({ type: 'UPDATE_WATCHLIST', id, payload })
    },

    removeWatchlistEntry(id) {
      dispatch({ type: 'REMOVE_WATCHLIST', id })
    },

    convertWatchlistToPosition(id) {
      const entry = state.watchlist.find(e => e.id === id)
      if (!entry) return null
      dispatch({ type: 'CONVERT_WATCHLIST', id })
      return entry
    },

    updateBenchmark(payload) {
      dispatch({ type: 'UPDATE_BENCHMARK', payload })
    },

    refreshPrices(force = true) {
      return refreshPrices(force)
    },

    fetchHistoryForPositions(force = false, period = '1y') {
      return fetchHistoryForPositions(force, period)
    },

    fetchHistoryForTicker(ticker, force = false, period = '1y') {
      return fetchHistoryForTicker(ticker, force, period)
    },
  }

  const value = {
    state,
    actions,
    analysisResult, setAnalysisResult,
    analysisNewsData, setAnalysisNewsData,
    scenarioResult, setScenarioResult,
    scenarioInput, setScenarioInput,
    chatMessages, setChatMessages,
    showFullAnalysis, setShowFullAnalysis,
  }
  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext)
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider')
  return ctx
}
