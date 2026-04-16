import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '../store/PortfolioContext'
import { calcPortfolioSummary } from '../utils/calculations'
import { formatCurrency, formatPercent, formatGain, gainClass } from '../utils/formatters'
import AddPositionModal from '../components/AddPositionModal'
import ConfirmDialog from '../components/ConfirmDialog'
import Sparkline from '../components/Sparkline'
import LoadingSpinner from '../components/LoadingSpinner'
import { SECTOR_COLORS } from '../config'

// Build sparkline data (last 30 close prices) for a ticker
function getSparkData(ticker, priceCache) {
  const history = priceCache[ticker]?.history
  if (!history) return []
  const sorted = Object.keys(history).sort()
  return sorted.slice(-30).map(d => history[d]).filter(Boolean)
}

// ─── Sort helper ──────────────────────────────────────────────────────────────
function sortPositions(positions, key, dir) {
  if (!key) return positions
  return [...positions].sort((a, b) => {
    let av = a[key], bv = b[key]
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span className="sort-icon">↕</span>
  return <span className="sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export default function AllPositions() {
  const { state, actions } = usePortfolio()
  const navigate = useNavigate()
  const [view, setView] = useState('list')
  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [sortKey, setSortKey] = useState('ticker')
  const [sortDir, setSortDir] = useState('asc')

  const summary = useMemo(
    () => calcPortfolioSummary(state.positions, state.priceCache),
    [state.positions, state.priceCache]
  )

  const enriched = useMemo(() => {
    const totalValue = summary.positions.reduce((s, p) => s + p.currentValue, 0)
    return summary.positions.map(p => ({
      ...p,
      weight: totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
      sparkData: getSparkData(p.ticker, state.priceCache),
    }))
  }, [summary.positions, state.priceCache])

  const sorted = useMemo(() => sortPositions(enriched, sortKey, sortDir), [enriched, sortKey, sortDir])

  function handleSort(col) {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(col); setSortDir('asc') }
  }

  function handleDelete() {
    if (deleteTarget) {
      actions.removePosition(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const totals = summary

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">All Positions</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="view-toggle">
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}>Grid</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Add Position</button>
        </div>
      </div>

      {state.positions.length === 0 ? (
        <div className="empty-state card">
          <p style={{ fontSize: 16, marginBottom: 8 }}>No positions yet</p>
          <p>Click "Add Position" to start tracking your investments.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddModal(true)}>
            + Add Position
          </button>
        </div>
      ) : view === 'list' ? (
        /* ── List View ──────────────────────────────────────────────────────── */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    { key: 'ticker',          label: 'Ticker'    },
                    { key: 'companyName',     label: 'Company'   },
                    { key: 'currentValue',    label: 'Value'     },
                    { key: 'totalCostBasis',  label: 'Cost Basis'},
                    { key: 'unrealizedGain',  label: 'Gain / Loss $'},
                    { key: 'unrealizedGainPct', label: 'Gain %'  },
                    { key: 'weight',          label: 'Weight'    },
                    { key: 'sector',          label: 'Sector'    },
                    { key: null,              label: 'Sparkline' },
                    { key: null,              label: ''          },
                  ].map(col => (
                    <th
                      key={col.label}
                      className={`${col.key ? 'sortable' : ''} ${sortKey === col.key ? 'sorted' : ''}`}
                      onClick={() => col.key && handleSort(col.key)}
                    >
                      {col.label}
                      {col.key && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(pos => {
                  const gc = gainClass(pos.unrealizedGain)
                  const isLoading = state.loadingTickers?.has(pos.ticker)
                  return (
                    <tr key={pos.id}>
                      <td>
                        <span className="ticker-chip" onClick={() => navigate(`/stocks/${pos.ticker}`)}>
                          {pos.ticker}
                          {isLoading && <LoadingSpinner />}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pos.companyName}
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>{formatCurrency(pos.currentValue)}</td>
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>{formatCurrency(pos.totalCostBasis)}</td>
                      <td className={`mono ${gc}`}>{formatGain(pos.unrealizedGain)}</td>
                      <td className={`mono ${gc}`}>{formatPercent(pos.unrealizedGainPct)}</td>
                      <td>
                        <div className="weight-bar-wrap" style={{ minWidth: 100 }}>
                          <div className="weight-bar-bg">
                            <div className="weight-bar-fill" style={{ width: `${Math.min(pos.weight, 100)}%` }} />
                          </div>
                          <span className="mono" style={{ fontSize: 11, width: 38, flexShrink: 0 }}>{pos.weight.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td>
                        <span className="tag" style={{ borderColor: SECTOR_COLORS[pos.sector], color: SECTOR_COLORS[pos.sector] }}>
                          {pos.sector}
                        </span>
                      </td>
                      <td style={{ padding: '4px 12px' }}>
                        <Sparkline
                          data={pos.sparkData}
                          positive={pos.unrealizedGain >= 0 ? true : false}
                          width={80}
                          height={32}
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setDeleteTarget(pos)}
                          title="Remove position"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-card-alt)' }}>
                  <td colSpan={2} style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>TOTAL</td>
                  <td className="mono">{formatCurrency(totals.totalValue)}</td>
                  <td className="mono" style={{ color: 'var(--text-muted)' }}>{formatCurrency(totals.totalInvested)}</td>
                  <td className={`mono ${gainClass(totals.totalUnrealizedGain)}`}>{formatGain(totals.totalUnrealizedGain)}</td>
                  <td className={`mono ${gainClass(totals.unrealizedGainPct)}`}>{formatPercent(totals.unrealizedGainPct)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* ── Grid View ──────────────────────────────────────────────────────── */
        <>
          <div className="card-grid">
            {sorted.map(pos => {
              const gc = gainClass(pos.unrealizedGain)
              return (
                <div
                  key={pos.id}
                  className="position-card"
                  onClick={() => navigate(`/stocks/${pos.ticker}`)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="card-ticker">{pos.ticker}</div>
                      <div className="card-name">{pos.companyName}</div>
                    </div>
                    <span
                      className="tag"
                      style={{ borderColor: SECTOR_COLORS[pos.sector], color: SECTOR_COLORS[pos.sector], marginTop: 2 }}
                    >
                      {pos.sector}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div className="card-price">{formatCurrency(pos.currentValue)}</div>
                      <div className={`card-gain ${gc}`}>
                        {formatGain(pos.unrealizedGain)} ({formatPercent(pos.unrealizedGainPct)})
                      </div>
                    </div>
                    <Sparkline data={pos.sparkData} positive={pos.unrealizedGain >= 0} width={80} height={36} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Portfolio weight</span>
                      <span className="mono">{pos.weight.toFixed(1)}%</span>
                    </div>
                    <div className="weight-bar-bg" style={{ height: 6 }}>
                      <div className="weight-bar-fill" style={{ height: 6, width: `${Math.min(pos.weight, 100)}%` }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cost basis</span>
                    <span className="mono">{formatCurrency(pos.totalCostBasis)}</span>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    style={{ alignSelf: 'flex-end' }}
                    onClick={e => { e.stopPropagation(); setDeleteTarget(pos) }}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
          {/* Grid totals */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 32 }}>
              <div>
                <div className="label-sm">Total Value</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(totals.totalValue)}</div>
              </div>
              <div>
                <div className="label-sm">Total Invested</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-muted)' }}>{formatCurrency(totals.totalInvested)}</div>
              </div>
              <div>
                <div className="label-sm">Unrealized Gain</div>
                <div className={`mono ${gainClass(totals.totalUnrealizedGain)}`} style={{ fontSize: 18, fontWeight: 700 }}>
                  {formatGain(totals.totalUnrealizedGain)} ({formatPercent(totals.unrealizedGainPct)})
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showAddModal && <AddPositionModal onClose={() => setShowAddModal(false)} />}

      {deleteTarget && (
        <ConfirmDialog
          title="Remove Position"
          message={`Remove ${deleteTarget.ticker} (${deleteTarget.companyName}) and all its lots from your portfolio? This cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
