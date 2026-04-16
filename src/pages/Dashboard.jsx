import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { usePortfolio } from '../store/PortfolioContext'
import {
  calcPortfolioSummary,
  calcSectorAllocation,
  calcPortfolioWeights,
  buildPortfolioHistory,
  calcBenchmarkComparison,
} from '../utils/calculations'
import { formatCurrency, formatPercent, formatGain, formatDateTime, gainClass } from '../utils/formatters'
import TimeWindowSelector from '../components/TimeWindowSelector'
import LoadingSpinner from '../components/LoadingSpinner'
import { getWindowStartDate } from '../utils/timeWindows'
import { SECTOR_COLORS } from '../config'
import { getApiUsageStats, getQueueDepth } from '../services/alphaVantage'

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

export default function Dashboard() {
  const { state, actions } = usePortfolio()
  const navigate = useNavigate()
  const [window, setWindow] = useState('1Y')
  const [refreshing, setRefreshing] = useState(false)
  const [showRefreshWarning, setShowRefreshWarning] = useState(false)

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

  const benchmark = useMemo(
    () => calcBenchmarkComparison(summary.totalReturnPct, state.benchmark),
    [summary.totalReturnPct, state.benchmark]
  )

  // Format dates for chart X axis
  const chartData = historyData.map(d => ({
    date: d.date,
    value: d.value,
    // Short label for axis
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  const hasChartData = chartData.length >= 2

  // Fix 2 — trigger lazy history fetch once on mount
  useEffect(() => {
    actions.fetchHistoryForPositions(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derive history loading / failed state from context
  const historyLoading = (state.historyLoadingTickers?.size ?? 0) > 0
  const historyFailed  = state.historyFailed ?? false

  // Oldest historyTimestamp across all positions — tells user how fresh the chart data is
  const historyTimestamp = useMemo(() => {
    const ts = state.positions
      .map(p => state.priceCache[p.ticker]?.historyTimestamp ?? 0)
      .filter(t => t > 0)
    return ts.length > 0 ? Math.min(...ts) : null
  }, [state.positions, state.priceCache])

  // API usage stats — read from localStorage on every render (cheap sync read)
  const apiUsage   = getApiUsageStats()
  const queueActive = getQueueDepth() > 0 || state.isRefreshing || historyLoading

  async function handleRefresh() {
    setShowRefreshWarning(false)
    setRefreshing(true)
    await actions.refreshPrices(true)
    setRefreshing(false)
  }

  const totalGainClass = gainClass(summary.totalReturn)
  const hasPositions = state.positions.length > 0

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {state.lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {formatDateTime(state.lastUpdated)}
            </span>
          )}
          {state.isRefreshing || refreshing ? (
            <LoadingSpinner label="Refreshing…" />
          ) : (
            <>
              {showRefreshWarning ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--yellow)' }}>Uses API quota (25/day)</span>
                  <button className="btn btn-sm btn-primary" onClick={handleRefresh}>Confirm</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShowRefreshWarning(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowRefreshWarning(true)}>
                  ↻ Refresh Prices
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Fix 5 — API usage status ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -16, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          API usage: {apiUsage.callsToday}/25 calls today
          {' · '}resets in {apiUsage.timeUntilReset}
          {queueActive && (
            <span style={{ color: 'var(--yellow)', marginLeft: 6 }}>· queuing requests…</span>
          )}
        </span>
      </div>

      {/* ── Summary metrics ──────────────────────────────────────────────────── */}
      <div className="metric-grid">
        <div className="metric-card">
          <span className="m-label">Portfolio Value</span>
          <span className="m-value mono">{formatCurrency(summary.totalValue)}</span>
          <span className="m-sub">Invested {formatCurrency(summary.totalInvested)}</span>
        </div>
        <div className="metric-card">
          <span className="m-label">Total Return</span>
          <span className={`m-value mono ${totalGainClass}`}>{formatGain(summary.totalReturn)}</span>
          <span className={`m-sub ${totalGainClass}`}>{formatPercent(summary.totalReturnPct)}</span>
        </div>
        <div className="metric-card">
          <span className="m-label">Unrealized Gain</span>
          <span className={`m-value mono ${gainClass(summary.totalUnrealizedGain)}`}>
            {formatGain(summary.totalUnrealizedGain)}
          </span>
          <span className={`m-sub ${gainClass(summary.unrealizedGainPct)}`}>
            {formatPercent(summary.unrealizedGainPct)} price appreciation
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
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--blue)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--blue)' }}
                />
              </LineChart>
            </ResponsiveContainer>
            {/* Fix 4 — cache timestamp label */}
            {historyTimestamp && (
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                Price history last updated:{' '}
                {new Date(historyTimestamp).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                })}
              </div>
            )}
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
          /* Fix 3 — fetch failed / rate limited */
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
            <p style={{ color: 'var(--yellow)', fontWeight: 600 }}>
              Historical data unavailable — Alpha Vantage rate limit reached.
            </p>
            <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 12 }}>
              Cached data will be used when available. Try again after the daily quota resets.
            </p>
          </div>

        ) : (
          /* Fix 3 — no data at all yet */
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <p>No historical data yet.</p>
            <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-dim)' }}>
              Data will load automatically within the API rate limit window.
            </p>
          </div>
        )}
      </div>

      {/* ── Two-column: Benchmark + Sector allocation ─────────────────────────── */}
      <div className="two-col" style={{ marginBottom: 16 }}>

        {/* Benchmark */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="chart-title">Benchmark Comparison</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Manually updated</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>S&P 500 — Initial Value</label>
              <input
                type="number"
                value={state.benchmark.initialSP ?? ''}
                onChange={e => actions.updateBenchmark({ initialSP: parseFloat(e.target.value) || 0 })}
                placeholder="4700"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>S&P 500 — Current Value</label>
              <input
                type="number"
                value={state.benchmark.currentSP ?? ''}
                onChange={e => actions.updateBenchmark({ currentSP: parseFloat(e.target.value) || 0 })}
                placeholder="5300"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          {benchmark ? (
            <>
              <div className="bench-row">
                <span className="bench-label">Your Return</span>
                <span className={`bench-value ${gainClass(benchmark.portfolioReturnPct)}`}>
                  {formatPercent(benchmark.portfolioReturnPct)}
                </span>
              </div>
              <div className="bench-row">
                <span className="bench-label">S&P 500 Return</span>
                <span className={`bench-value ${gainClass(benchmark.spReturn)}`}>
                  {formatPercent(benchmark.spReturn)}
                </span>
              </div>
              <div className="bench-row">
                <span className="bench-label">Alpha (Your − S&P)</span>
                <span className={`bench-value ${gainClass(benchmark.alpha)}`}>
                  {formatPercent(benchmark.alpha, true)}
                </span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
              Enter S&P 500 values above to compare.
            </p>
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
