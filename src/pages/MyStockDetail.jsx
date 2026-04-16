import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { usePortfolio } from '../store/PortfolioContext'
import { calcPosition } from '../utils/calculations'
import {
  formatCurrency, formatPercent, formatGain, formatDate, formatNumber, formatShares, gainClass,
} from '../utils/formatters'
import TimeWindowSelector from '../components/TimeWindowSelector'
import ConfirmDialog from '../components/ConfirmDialog'
import AddPositionModal from '../components/AddPositionModal'
import LoadingSpinner from '../components/LoadingSpinner'
import { getWindowStartDate } from '../utils/timeWindows'
import { SECTOR_COLORS } from '../config'

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 12px',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontWeight: 700 }}>{formatCurrency(payload[0].value)}</div>
    </div>
  )
}

// Inline editable note
function NotesEditor({ positionId, initialNotes }) {
  const { actions } = usePortfolio()
  const [notes, setNotes] = useState(initialNotes || '')
  const [saved, setSaved] = useState(false)

  function save() {
    actions.updateNotes(positionId, notes)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="chart-title">Notes &amp; Thesis</span>
        {saved && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
      </div>
      <textarea
        className="notes-area"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Write your thesis, observations, or notes here…"
      />
      <div style={{ textAlign: 'right', marginTop: 6 }}>
        <button className="btn btn-sm btn-ghost" onClick={save}>Save</button>
      </div>
    </div>
  )
}

// Dividend log section
function DividendsSection({ position }) {
  const { actions } = usePortfolio()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '' })
  const [deleteId, setDeleteId] = useState(null)
  const dividends = position.dividends ?? []

  function handleAdd() {
    const amount = parseFloat(form.amount)
    if (!form.date || isNaN(amount) || amount <= 0) return
    actions.addDividend(position.id, { date: form.date, amount })
    setForm({ date: '', amount: '' })
    setShowForm(false)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="chart-title">Dividends Received</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Cancel' : '+ Log Dividend'}
        </button>
      </div>

      {showForm && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Amount ($)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="23.50"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
        </div>
      )}

      {dividends.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No dividends logged yet.</p>
      ) : (
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Date</th>
              <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Amount</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {[...dividends].sort((a, b) => b.date.localeCompare(a.date)).map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 0', color: 'var(--text-muted)' }}>{formatDate(d.date)}</td>
                <td className="mono gain" style={{ textAlign: 'right', padding: '7px 0' }}>{formatCurrency(d.amount)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}
                    onClick={() => setDeleteId(d.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ paddingTop: 8, fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>Total</td>
              <td className="mono gain" style={{ textAlign: 'right', paddingTop: 8, fontWeight: 700 }}>
                {formatCurrency(dividends.reduce((s, d) => s + d.amount, 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {deleteId && (
        <ConfirmDialog
          title="Remove Dividend"
          message="Remove this dividend entry?"
          confirmLabel="Remove"
          onConfirm={() => { actions.removeDividend(position.id, deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MyStockDetail() {
  const { ticker } = useParams()
  const navigate = useNavigate()
  const { state, actions } = usePortfolio()
  const [window, setWindow] = useState('1Y')
  const [showAddLot, setShowAddLot] = useState(false)
  const [deleteLotId, setDeleteLotId] = useState(null)

  const position = state.positions.find(p => p.ticker === ticker)
  const watchlistEntry = state.watchlist.find(w => w.ticker === ticker)

  // Fix 2 — fetch history lazily when the user navigates to this page
  useEffect(() => {
    actions.fetchHistoryForTicker(ticker, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker])

  if (!position && !watchlistEntry) {
    return (
      <div className="page">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
          ← Back
        </button>
        <div className="empty-state card">
          <p style={{ fontSize: 16 }}>Ticker "{ticker}" not found in your portfolio or watchlist.</p>
        </div>
      </div>
    )
  }

  // If only watchlist, show minimal view
  const source = position || watchlistEntry

  const calc = position ? calcPosition(position, state.priceCache) : null
  const quote = state.priceCache[ticker]?.quote
  const history = state.priceCache[ticker]?.history
  const isLoading = state.loadingTickers?.has(ticker)

  // Build chart data
  const startDate = getWindowStartDate(window)
  const chartData = useMemo(() => {
    if (!history) return []
    const sorted = Object.keys(history).sort()
    const filtered = startDate ? sorted.filter(d => d >= startDate) : sorted
    return filtered.map(date => ({
      date,
      value: history[date],
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })).filter(d => d.value != null)
  }, [history, startDate])

  const hasChartData = chartData.length >= 2

  // Price change direction
  const priceChange = quote?.change ?? null
  const priceChangePct = quote?.changePercent ?? null
  const priceGc = gainClass(priceChange)

  // Avg cost line for chart
  const avgCost = calc?.avgCostBasis ?? null

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
        ← Back
      </button>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="detail-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="detail-ticker">{ticker}</span>
            {source.sector && (
              <span
                className="tag"
                style={{ borderColor: SECTOR_COLORS[source.sector], color: SECTOR_COLORS[source.sector] }}
              >
                {source.sector}
              </span>
            )}
            {isLoading && <LoadingSpinner />}
          </div>
          <div className="detail-name">{source.companyName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {quote ? (
            <>
              <div className="detail-price">{formatCurrency(quote.price)}</div>
              <div className={`detail-change ${priceGc}`}>
                {priceChange != null && `${priceChange >= 0 ? '+' : ''}${formatCurrency(priceChange)}`}
                {priceChangePct != null && ` (${formatPercent(priceChangePct)})`}
                {' '}today
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                H {formatCurrency(quote.high)} · L {formatCurrency(quote.low)} · Vol {quote.volume?.toLocaleString()}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Price loading…</div>
          )}
        </div>
      </div>

      {/* ── Summary metrics (only for held positions) ─────────────────────── */}
      {calc && (
        <div className="metric-grid" style={{ marginBottom: 20 }}>
          <div className="metric-card">
            <span className="m-label">Current Value</span>
            <span className="m-value mono">{formatCurrency(calc.currentValue)}</span>
            <span className="m-sub">{formatShares(calc.totalShares)} shares</span>
          </div>
          <div className="metric-card">
            <span className="m-label">Avg Cost Basis</span>
            <span className="m-value mono">{formatCurrency(calc.avgCostBasis)}</span>
            <span className="m-sub">Total {formatCurrency(calc.totalCostBasis)}</span>
          </div>
          <div className="metric-card">
            <span className="m-label">Price Return</span>
            <span className={`m-value mono ${gainClass(calc.unrealizedGain)}`}>
              {formatGain(calc.unrealizedGain)}
            </span>
            <span className={`m-sub ${gainClass(calc.unrealizedGainPct)}`}>
              {formatPercent(calc.unrealizedGainPct)}
            </span>
          </div>
          <div className="metric-card">
            <span className="m-label">Total Return (incl. Dividends)</span>
            <span className={`m-value mono ${gainClass(calc.totalReturn)}`}>
              {formatGain(calc.totalReturn)}
            </span>
            <span className={`m-sub ${gainClass(calc.totalReturnPct)}`}>
              {formatPercent(calc.totalReturnPct)}
            </span>
          </div>
        </div>
      )}

      {/* ── Price history chart ──────────────────────────────────────────────── */}
      <div className="chart-wrap" style={{ marginBottom: 16 }}>
        <div className="chart-header">
          <span className="chart-title">{ticker} Price History</span>
          <TimeWindowSelector value={window} onChange={setWindow} />
        </div>
        {!hasChartData ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {isLoading
              ? <LoadingSpinner label="Loading price history…" size="lg" />
              : <p>No historical data available for this time window.</p>
            }
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
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
                domain={['auto', 'auto']}
                tickFormatter={v => `$${v.toFixed(0)}`}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip content={<PriceTooltip />} />
              {avgCost && (
                <ReferenceLine
                  y={avgCost}
                  stroke="var(--yellow)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: `Avg ${formatCurrency(avgCost)}`, fill: 'var(--yellow)', fontSize: 11, position: 'right' }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={calc
                  ? (calc.unrealizedGain >= 0 ? 'var(--green)' : 'var(--red)')
                  : 'var(--blue)'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Purchase lots ────────────────────────────────────────────────────── */}
      {position && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="chart-title">Purchase Lots</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowAddLot(true)}>
              + Add Lot
            </button>
          </div>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['Date', 'Shares', 'Price / Share', 'Cost Basis', 'Current Value', 'Gain / Loss', ''].map(h => (
                  <th key={h} style={{ textAlign: h === '' ? 'right' : 'left', padding: '6px 8px', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...position.lots].sort((a, b) => a.date.localeCompare(b.date)).map(lot => {
                const lotCost = lot.shares * lot.pricePerShare
                const lotValue = lot.shares * (calc?.currentPrice ?? lot.pricePerShare)
                const lotGain = lotValue - lotCost
                const gc = gainClass(lotGain)
                return (
                  <tr key={lot.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px', color: 'var(--text-muted)' }}>{formatDate(lot.date)}</td>
                    <td className="mono" style={{ padding: '8px 8px' }}>{formatShares(lot.shares)}</td>
                    <td className="mono" style={{ padding: '8px 8px' }}>{formatCurrency(lot.pricePerShare)}</td>
                    <td className="mono" style={{ padding: '8px 8px', color: 'var(--text-muted)' }}>{formatCurrency(lotCost)}</td>
                    <td className="mono" style={{ padding: '8px 8px' }}>{formatCurrency(lotValue)}</td>
                    <td className={`mono ${gc}`} style={{ padding: '8px 8px' }}>
                      {formatGain(lotGain)} ({formatPercent((lotGain / lotCost) * 100)})
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {position.lots.length > 1 && (
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}
                          onClick={() => setDeleteLotId(lot.id)}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {position.lots.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ paddingTop: 8, fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', paddingLeft: 8 }}>
                    TOTAL ({position.lots.length} lots)
                  </td>
                  <td className="mono" style={{ padding: '8px 8px', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' }}>
                    Avg {formatCurrency(calc?.avgCostBasis)}
                  </td>
                  <td className="mono" style={{ padding: '8px 8px', fontWeight: 700 }}>{formatCurrency(calc?.totalCostBasis)}</td>
                  <td className="mono" style={{ padding: '8px 8px', fontWeight: 700 }}>{formatCurrency(calc?.currentValue)}</td>
                  <td className={`mono ${gainClass(calc?.unrealizedGain)}`} style={{ padding: '8px 8px', fontWeight: 700 }}>
                    {formatGain(calc?.unrealizedGain)} ({formatPercent(calc?.unrealizedGainPct)})
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Dividends + Notes ────────────────────────────────────────────────── */}
      {position && (
        <div className="two-col" style={{ marginBottom: 0 }}>
          <DividendsSection position={position} />
          <NotesEditor positionId={position.id} initialNotes={position.notes} />
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {showAddLot && (
        <AddPositionModal
          prefill={{ ticker, companyName: source.companyName, sector: source.sector }}
          onClose={() => setShowAddLot(false)}
        />
      )}

      {deleteLotId && (
        <ConfirmDialog
          title="Remove Lot"
          message="Remove this purchase lot? If it's the last lot, the entire position will be removed."
          confirmLabel="Remove"
          onConfirm={() => {
            actions.removeLot(position.id, deleteLotId)
            setDeleteLotId(null)
          }}
          onCancel={() => setDeleteLotId(null)}
        />
      )}
    </div>
  )
}
