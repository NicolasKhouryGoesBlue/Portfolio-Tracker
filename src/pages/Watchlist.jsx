import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortfolio } from '../store/PortfolioContext'
import { formatCurrency, formatPercent, gainClass } from '../utils/formatters'
import AddPositionModal from '../components/AddPositionModal'
import AddWatchlistModal from '../components/AddWatchlistModal'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import { SECTOR_COLORS } from '../config'

export default function Watchlist() {
  const { state, actions } = usePortfolio()
  const navigate = useNavigate()
  const [showAddWatchlist, setShowAddWatchlist] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [convertTarget, setConvertTarget] = useState(null)  // entry being converted
  const [showConvertModal, setShowConvertModal] = useState(false)

  // Enrich watchlist entries with live prices
  const enriched = useMemo(() => {
    return state.watchlist.map(entry => {
      const quote = state.priceCache[entry.ticker]?.quote
      const currentPrice = quote?.price ?? null
      const gap = currentPrice != null ? currentPrice - entry.targetBuyPrice : null
      const gapPct = gap != null && entry.targetBuyPrice > 0 ? (gap / entry.targetBuyPrice) * 100 : null
      const atOrBelow = gap != null && gap <= 0
      return { ...entry, currentPrice, gap, gapPct, atOrBelow }
    })
  }, [state.watchlist, state.priceCache])

  function handleDelete() {
    if (deleteTarget) {
      actions.removeWatchlistEntry(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  function handleConvertStart(entry) {
    setConvertTarget(entry)
    setShowConvertModal(true)
  }

  function handleConvertComplete() {
    if (convertTarget) {
      actions.removeWatchlistEntry(convertTarget.id)
    }
    setConvertTarget(null)
    setShowConvertModal(false)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Watchlist</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddWatchlist(true)}>
          + Add to Watchlist
        </button>
      </div>

      {state.watchlist.length === 0 ? (
        <div className="empty-state card">
          <p style={{ fontSize: 16, marginBottom: 8 }}>Watchlist is empty</p>
          <p>Track stocks you're considering without committing capital.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddWatchlist(true)}>
            + Add to Watchlist
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Sector</th>
                  <th>Current Price</th>
                  <th>Target Price</th>
                  <th>Gap $</th>
                  <th>Gap %</th>
                  <th>Reason</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map(entry => {
                  const isLoading = state.loadingTickers?.has(entry.ticker)
                  const gapGc = entry.atOrBelow ? 'gain' : entry.gap != null ? 'loss' : 'neutral'

                  return (
                    <tr key={entry.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className="mono"
                            style={{ fontWeight: 700, fontSize: 14, color: 'var(--blue)', cursor: 'pointer' }}
                            onClick={() => navigate(`/stocks/${entry.ticker}`)}
                          >
                            {entry.ticker}
                          </span>
                          {isLoading && <LoadingSpinner />}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{entry.companyName}</td>
                      <td>
                        <span className="tag" style={{ borderColor: SECTOR_COLORS[entry.sector], color: SECTOR_COLORS[entry.sector] }}>
                          {entry.sector}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {entry.currentPrice != null ? formatCurrency(entry.currentPrice) : (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>
                        {formatCurrency(entry.targetBuyPrice)}
                      </td>
                      <td className={`mono ${gapGc}`}>
                        {entry.gap != null
                          ? `${entry.gap >= 0 ? '+' : ''}${formatCurrency(entry.gap)}`
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td className={`mono ${gapGc}`}>
                        {entry.gapPct != null
                          ? formatPercent(entry.gapPct)
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.reason || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            title="Convert to position"
                            onClick={() => handleConvertStart(entry)}
                          >
                            Buy
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setEditEntry(entry)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => setDeleteTarget(entry)}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Watchlist Modal */}
      {showAddWatchlist && <AddWatchlistModal onClose={() => setShowAddWatchlist(false)} />}
      {editEntry && <AddWatchlistModal editEntry={editEntry} onClose={() => setEditEntry(null)} />}

      {/* Convert to position — opens AddPositionModal pre-filled */}
      {showConvertModal && convertTarget && (
        <AddPositionModal
          prefill={{
            ticker: convertTarget.ticker,
            companyName: convertTarget.companyName,
            sector: convertTarget.sector,
          }}
          onClose={handleConvertComplete}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title="Remove from Watchlist"
          message={`Remove ${deleteTarget.ticker} (${deleteTarget.companyName}) from your watchlist?`}
          confirmLabel="Remove"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
