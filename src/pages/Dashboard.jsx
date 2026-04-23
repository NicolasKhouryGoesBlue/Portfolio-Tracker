import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { usePortfolio, computeBenchmarkData } from '../store/PortfolioContext'
import {
  calcPortfolioSummary,
  calcSectorAllocation,
  calcPortfolioWeights,
  buildPortfolioHistory,
} from '../utils/calculations'
import { formatCurrency, formatPercent, formatGain, formatDateTime, gainClass } from '../utils/formatters'
import TimeWindowSelector from '../components/TimeWindowSelector'
import { getWindowStartDate } from '../utils/timeWindows'
import { SECTOR_COLORS } from '../config'

// ─── Period coverage helpers ──────────────────────────────────────────────────
// periodCovers / PERIOD_ORDER are not exported from localBackend.js, so they
// are mirrored here. DASH_PERIOD_MAP uses '1y' for YTD so the fetch covers the
// full calendar year regardless of where Jan 1 falls.
const DASH_PERIOD_MAP = {
  '1D': '1d', '1W': '5d', 'MTD': '1mo', '1M': '1mo',
  '3M': '3mo', '6M': '6mo', 'YTD': '1y', '1Y': '1y', '5Y': '5y', 'MAX': 'max',
}
const DASH_PERIOD_ORDER = ['1d', '5d', '1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y', 'max']
function periodCoversLocal(cachedPeriod, requestedPeriod) {
  if (!cachedPeriod) return false
  const ci = DASH_PERIOD_ORDER.indexOf(cachedPeriod)
  const ri = DASH_PERIOD_ORDER.indexOf(requestedPeriod)
  if (ci === -1 || ri === -1) return false
  return ci >= ri
}

// ─── Recharts tooltip ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontWeight: 700 }}>{formatCurrency(payload[0].value)}</div>
    </div>
  )
}

function SectorTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.sector}</div>
      <div className="mono">{formatCurrency(d.value)}</div>
      <div style={{ color: 'var(--text-muted)' }}>{d.percentage.toFixed(1)}%</div>
    </div>
  )
}

function BenchmarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const portfolioVal = payload.find(p => p.dataKey === 'portfolio')?.value
  const benchmarkVal = payload.find(p => p.dataKey === 'benchmark')?.value
  const dateLabel = label
    ? new Date(label + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{dateLabel}</div>
      {portfolioVal != null && (
        <div className="mono" style={{ color: 'var(--green)' }}>Your Portfolio: {portfolioVal.toFixed(0)}</div>
      )}
      {benchmarkVal != null && (
        <div className="mono" style={{ color: 'var(--blue)' }}>S&P 500: {benchmarkVal.toFixed(0)}</div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { state, actions } = usePortfolio()
  const navigate = useNavigate()
  const [window, setWindow] = useState('MAX')

  const summary = useMemo(
    () => calcPortfolioSummary(state.positions, state.priceCache),
    [state.positions, state.priceCache]
  )

  const sectorData = useMemo(
    () => calcSectorAllocation(state.positions, state.priceCache),
    [state.positions, state.priceCache]
  )

  const weightData = useMemo(
    () => calcPortfolioWeights(state.positions, state.priceCache),
    [state.positions, state.priceCache]
  )

  const startDate = getWindowStartDate(window)
  const historyData = useMemo(
    () => buildPortfolioHistory(state.positions, state.priceCache, startDate),
    [state.positions, state.priceCache, startDate]
  )

  const benchData = useMemo(() => computeBenchmarkData(state), [state])

  const comparisonChartData = useMemo(() => {
    if (!benchData) return []
    const { portfolioNormalized, benchmarkNormalized } = benchData
    // O(n) two-pointer merge — both arrays are date-sorted
    const result = []
    let pi = 0
    let bi = 0
    while (pi < portfolioNormalized.length && bi < benchmarkNormalized.length) {
      const pd = portfolioNormalized[pi].date
      const bd = benchmarkNormalized[bi].date
      if (pd === bd) {
        result.push({ date: pd, portfolio: portfolioNormalized[pi].value, benchmark: benchmarkNormalized[bi].value })
        pi++; bi++
      } else if (pd < bd) {
        result.push({ date: pd, portfolio: portfolioNormalized[pi].value, benchmark: null })
        pi++
      } else {
        result.push({ date: bd, portfolio: null, benchmark: benchmarkNormalized[bi].value })
        bi++
      }
    }
    while (pi < portfolioNormalized.length) {
      result.push({ date: portfolioNormalized[pi].date, portfolio: portfolioNormalized[pi].value, benchmark: null })
      pi++
    }
    while (bi < benchmarkNormalized.length) {
      result.push({ date: benchmarkNormalized[bi].date, portfolio: null, benchmark: benchmarkNormalized[bi].value })
      bi++
    }
    return result
  }, [benchData])

  const chartData = historyData.map(d => ({
    date: d.date,
    value: d.value,
  }))

  const hasChartData = chartData.length >= 2

  const chartColor = (() => {
    if (!chartData || chartData.length < 2) return 'var(--accent)'
    const first = chartData[0]?.value
    const last = chartData[chartData.length - 1]?.value
    if (first == null || last == null) return 'var(--accent)'
    return last >= first ? 'var(--green)' : 'var(--red)'
  })()

  // Fetch history on mount using the initial window period
  useEffect(() => {
    actions.fetchHistoryForPositions(false, DASH_PERIOD_MAP['MAX'] ?? 'max')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When the user switches to a longer time window, fetch more history if the
  // cached period doesn't already cover it. Skips on the initial render so the
  // mount effect above handles the first fetch without doubling up.
  const isFirstWindowRender = useRef(true)
  const windowRef = useRef(window)
  useEffect(() => { windowRef.current = window }, [window])
  useEffect(() => {
    if (isFirstWindowRender.current) {
      isFirstWindowRender.current = false
      return
    }
    const period = DASH_PERIOD_MAP[window] ?? '1y'
    const needsFetch = state.positions.some(
      p => !periodCoversLocal(state.priceCache[p.ticker]?.historyPeriod ?? null, period)
    )
    if (needsFetch) {
      actions.fetchHistoryForPositions(false, period)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window])

  // Derive history loading / failed state from context
  const historyLoading = (state.historyLoadingTickers?.size ?? 0) > 0
  const historyFailed  = state.historyFailed ?? false

  // Auto-refresh prices every 60 seconds
  useEffect(() => {
    const id = setInterval(() => {
      actions.refreshPrices(true)
      actions.fetchHistoryForPositions(true, DASH_PERIOD_MAP[windowRef.current] ?? 'max')
    }, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live clock — updated every 60 seconds to match the auto-refresh cadence
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const getTickDates = (data, win) => {
    if (!data || data.length === 0) return []

    switch (win) {
      case 'MAX': {
        const seen = new Set()
        return data
          .filter(d => {
            const year = d.date.slice(0, 4)
            if (seen.has(year)) return false
            seen.add(year)
            return true
          })
          .map(d => d.date)
      }

      case '5Y': {
        const seen = new Set()
        return data
          .filter(d => {
            const month = parseInt(d.date.slice(5, 7), 10)
            const year = d.date.slice(0, 4)
            const half = month <= 6 ? 'H1' : 'H2'
            const key = `${year}-${half}`
            if (seen.has(key)) return false
            const isH1Start = month === 1
            const isH2Start = month === 7
            if (!isH1Start && !isH2Start) return false
            seen.add(key)
            return true
          })
          .map(d => d.date)
      }

      case '1Y': {
        const seen = new Set()
        return data
          .filter(d => {
            const month = parseInt(d.date.slice(5, 7), 10)
            const year = d.date.slice(0, 4)
            const isBiMonth = month % 2 === 1
            const key = `${year}-${month}`
            if (!isBiMonth || seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map(d => d.date)
      }

      case 'YTD': {
        const seen = new Set()
        return data
          .filter(d => {
            const yearMonth = d.date.slice(0, 7)
            if (seen.has(yearMonth)) return false
            seen.add(yearMonth)
            return true
          })
          .map(d => d.date)
      }

      case '6M': {
        // One tick per month — first trading day of each month
        // Same logic as YTD but applied to 6M range
        const seen = new Set()
        return data
          .filter(d => {
            const yearMonth = d.date.slice(0, 7)  // "2025-12"
            if (seen.has(yearMonth)) return false
            seen.add(yearMonth)
            return true
          })
          .map(d => d.date)
      }

      case '3M': {
        const seen = new Set()
        return data
          .filter(d => {
            const day = parseInt(d.date.slice(8, 10), 10)
            const yearMonth = d.date.slice(0, 7)
            const half = day <= 14 ? 'A' : 'B'
            const key = `${yearMonth}-${half}`
            if (seen.has(key)) return false
            const isAnchor = (day >= 1 && day <= 7) || (day >= 15 && day <= 21)
            if (!isAnchor) return false
            seen.add(key)
            return true
          })
          .map(d => d.date)
      }

      default:
        return undefined
    }
  }

  const formatAxisLabel = (dateStr, win) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')

    if (win === 'MAX') {
      return date.getFullYear().toString()
    }
    if (win === '5Y' || win === '1Y') {
      return date.toLocaleDateString('en-US', { month: 'short' }) + ' ' + date.getFullYear()
    }
    if (win === 'YTD' || win === '6M') {
      return date.toLocaleDateString('en-US', { month: 'short' }) + ' ' + date.getFullYear()
    }
    if (win === '3M') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const totalGainClass = gainClass(summary.totalReturn)
  const hasPositions = state.positions.length > 0

  const yDomain = (() => {
    if (!chartData || chartData.length === 0) return ['auto', 'auto']

    const shortRanges = ['1W', 'MTD', '1M', '3M', '6M', 'YTD', '1Y']
    if (!shortRanges.includes(window)) {
      const allValues = chartData.map(d => d.value).filter(v => v != null)
      const maxVal = allValues.length > 0 ? Math.max(...allValues) : 0
      return [0, Math.ceil((maxVal * 1.10) / 1000) * 1000]
    }

    const values = chartData.map(d => d.value).filter(v => v != null)
    if (values.length === 0) return ['auto', 'auto']

    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = (max - min) * 0.15

    return [
      Math.floor((min - padding) / 1000) * 1000,
      Math.ceil((max + padding) / 1000) * 1000,
    ]
  })()

  const yTicks = (() => {
    const [min, max] = yDomain
    if (min === 'auto' || max === 'auto') return undefined
    const step = Math.ceil((max - min) / 4 / 1000) * 1000
    return [0, 1, 2, 3, 4].map(i => min + i * step)
  })()

  return (
    <div className="page">
      {/* ── API warning ─────────────────────────────────────────────────────── */}
      {state.apiWarning && (
        <div className="api-warning">
          <span>⚠</span>
          <span>{state.apiWarning}</span>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last updated: {formatDateTime(now)}
        </span>
      </div>

      {/* ── Summary metrics ──────────────────────────────────────────────────── */}
      <div className="metric-grid">
        <div className="metric-card">
          <span className="m-label">Portfolio Value</span>
          <span className="m-value mono">{formatCurrency(summary.totalValue)}</span>
          <span className="m-sub">Invested {formatCurrency(summary.totalInvested)} (all lots)</span>
        </div>
        <div className="metric-card">
          <span className="m-label">Total Return</span>
          <span className={`m-value mono ${totalGainClass}`}>{formatGain(summary.totalReturn)}</span>
          <span className={`m-sub ${totalGainClass}`}>({formatPercent(summary.totalReturnPct)})</span>
        </div>
        <div className="metric-card">
          <span className="m-label">Unrealized Gain</span>
          <span className={`m-value mono ${gainClass(summary.totalUnrealizedGain)}`}>
            {formatGain(summary.totalUnrealizedGain)}
          </span>
          <span className={`m-sub ${gainClass(summary.unrealizedGainPct)}`}>
            ({formatPercent(summary.unrealizedGainPct)})
          </span>
        </div>
        <div className="metric-card">
          <span className="m-label">Dividends Received</span>
          <span className="m-value mono gain">{formatCurrency(summary.totalDividends)}</span>
          <span className="m-sub">Realized income</span>
        </div>
      </div>

      {/* ── Portfolio Value Over Time ─────────────────────────────────────────── */}
      <div className="chart-wrap" style={{ marginBottom: 16 }}>
        <div className="chart-header">
          <span className="chart-title">Portfolio Value Over Time</span>
          <TimeWindowSelector value={window} onChange={setWindow} />
        </div>
        {!hasPositions ? (
          <div className="empty-state"><p>Add positions to see your portfolio chart.</p></div>

        ) : hasChartData ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={getTickDates(chartData, window)}
                  tickFormatter={(dateStr) => formatAxisLabel(dateStr, window)}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  ticks={yTicks}
                  tickCount={5}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  labelFormatter={(label) => {
                    if (!label) return ''
                    const date = new Date(label + 'T00:00:00')
                    return date.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={chartColor}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, index } = props
                    if (index !== 0 && index !== chartData.length - 1) return null

                    const value = chartData[index]?.value
                    if (value == null) return null

                    const isFirst = index === 0
                    const label = value >= 1000
                      ? `$${(value / 1000).toFixed(0)}k`
                      : `$${value.toFixed(0)}`

                    let slopeUp
                    if (isFirst) {
                      const nextValue = chartData[1]?.value
                      slopeUp = nextValue != null ? nextValue >= value : true
                    } else {
                      const prevValue = chartData[chartData.length - 2]?.value
                      slopeUp = prevValue != null ? value >= prevValue : true
                    }

                    const CHART_H = 260 // matches ResponsiveContainer height prop
                    const offset = (window === '5Y' || window === 'MAX') ? 10 : 18
                    const rightDown = cy + offset
                    const rightUp = cy - offset
                    const labelY = isFirst
                      ? (slopeUp ? cy + 16 : cy - 8)
                      : (slopeUp
                          ? (rightDown > CHART_H - 20 ? rightUp : rightDown)
                          : (rightUp < 10 ? rightDown : rightUp))
                    const labelAnchor = isFirst ? 'start' : 'end'
                    const labelX = isFirst ? cx + 6 : cx - 6

                    return (
                      <g key={`endpoint-${index}`}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={chartColor}
                          stroke="var(--bg)"
                          strokeWidth={2}
                        />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor={labelAnchor}
                          fontSize={11}
                          fill="var(--text-muted)"
                          fontWeight={500}
                        >
                          {label}
                        </text>
                      </g>
                    )
                  }}
                  activeDot={{ r: 4, fill: chartColor }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>

        ) : historyLoading ? (
          /* Fix 3 — loading state: never spin indefinitely */
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p>Fetching historical data — this may take a moment due to API rate limits.</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-dim)' }}>
              Requests are queued at 15-second intervals to stay within the free-tier limit.
            </p>
          </div>

        ) : historyFailed ? (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
            <p style={{ color: 'var(--yellow)', fontWeight: 600 }}>
              Historical data unavailable.
            </p>
            <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 12 }}>
              Cached data will be used when available. Refresh to retry.
            </p>
          </div>

        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <p>Loading historical data...</p>
          </div>
        )}
      </div>

      {/* ── Two-column: Benchmark + Sector allocation ─────────────────────────── */}
      <div className="two-col" style={{ marginBottom: 16 }}>

        {/* Benchmark */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="chart-title">Benchmark Comparison</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>vs S&P 500 · Live data</span>
          </div>

          {!benchData ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Loading benchmark data…
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={comparisonChartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={(() => {
                      const seen = new Set()
                      return comparisonChartData
                        .filter(d => {
                          const year = d.date.slice(0, 4)
                          if (seen.has(year)) return false
                          seen.add(year)
                          return true
                        })
                        .map(d => d.date)
                    })()}
                    tickFormatter={dateStr => new Date(dateStr + 'T00:00:00').getFullYear().toString()}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={v => v.toFixed(0)}
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip content={<BenchmarkTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Your Portfolio"
                    stroke="var(--green)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmark"
                    name="S&P 500"
                    stroke="var(--blue)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {(() => {
                const portLast = benchData.portfolioNormalized.at(-1)?.value ?? 100
                const benchLast = benchData.benchmarkNormalized.at(-1)?.value ?? 100
                const portReturn = portLast - 100
                const spReturn = benchLast - 100
                const alpha = portReturn - spReturn
                return (
                  <div style={{ marginTop: 12 }}>
                    <div className="bench-row">
                      <span className="bench-label">Your Return</span>
                      <span className={`bench-value ${gainClass(portReturn)}`}>
                        {formatPercent(portReturn)}
                      </span>
                    </div>
                    <div className="bench-row">
                      <span className="bench-label">S&P 500 Return</span>
                      <span className={`bench-value ${gainClass(spReturn)}`}>
                        {formatPercent(spReturn)}
                      </span>
                    </div>
                    <div className="bench-row">
                      <span className="bench-label">Alpha (Your − S&P)</span>
                      <span className={`bench-value ${gainClass(alpha)}`}>
                        {formatPercent(alpha, true)}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* Sector allocation */}
        <div className="card">
          <span className="chart-title" style={{ display: 'block', marginBottom: 12 }}>Sector Allocation</span>
          {sectorData.length === 0 ? (
            <div className="empty-state"><p>No positions yet.</p></div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <PieChart width={160} height={160}>
                <Pie
                  data={sectorData}
                  dataKey="value"
                  nameKey="sector"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {sectorData.map((entry) => (
                    <Cell
                      key={entry.sector}
                      fill={SECTOR_COLORS[entry.sector] || '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip content={<SectorTooltip />} />
              </PieChart>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sectorData.map(s => (
                  <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="sector-dot"
                      style={{ background: SECTOR_COLORS[s.sector] || '#6b7280' }}
                    />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{s.sector}</span>
                    <span className="mono" style={{ fontSize: 12 }}>{s.percentage.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Portfolio weights ─────────────────────────────────────────────────── */}
      {weightData.length > 0 && (
        <div className="card">
          <span className="chart-title" style={{ display: 'block', marginBottom: 12 }}>Portfolio Weights</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weightData
              .sort((a, b) => b.weight - a.weight)
              .map(pos => (
                <div
                  key={pos.ticker}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => navigate(`/stocks/${pos.ticker}`)}
                >
                  <span
                    className="mono"
                    style={{ width: 52, fontSize: 13, fontWeight: 700, color: 'var(--blue)', flexShrink: 0 }}
                  >
                    {pos.ticker}
                  </span>
                  <div className="weight-bar-wrap" style={{ flex: 1 }}>
                    <div className="weight-bar-bg">
                      <div
                        className="weight-bar-fill"
                        style={{ width: `${Math.min(pos.weight, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 12, width: 44, textAlign: 'right', flexShrink: 0 }}>
                    {pos.weight.toFixed(1)}%
                  </span>
                  <span className="mono" style={{ fontSize: 12, width: 90, textAlign: 'right', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatCurrency(pos.currentValue)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
