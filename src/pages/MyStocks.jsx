import { useNavigate } from 'react-router-dom'
import { useMemo } from 'react'
import { usePortfolio } from '../store/PortfolioContext'
import { calcPortfolioSummary } from '../utils/calculations'
import { formatCurrency, formatPercent, formatGain, gainClass } from '../utils/formatters'
import Sparkline from '../components/Sparkline'
import LoadingSpinner from '../components/LoadingSpinner'
import { SECTOR_COLORS } from '../config'

function getSparkData(ticker, priceCache) {
  const history = priceCache[ticker]?.history
  if (!history) return []
  return Object.keys(history).sort().slice(-30).map(d => history[d]).filter(Boolean)
}

export default function MyStocks() {
  const { state } = usePortfolio()
  const navigate = useNavigate()

  const summary = useMemo(
    () => calcPortfolioSummary(state.positions, state.priceCache),
    [state.positions, state.priceCache]
  )

  if (state.positions.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">My Stocks</h1>
        </div>
        <div className="empty-state card">
          <p style={{ fontSize: 16, marginBottom: 8 }}>No positions yet</p>
          <p>Go to All Positions to add your first stock.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Stocks</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Click any stock to view full detail
        </span>
      </div>

      <div className="card-grid">
        {summary.positions.map(pos => {
          const gc = gainClass(pos.unrealizedGain)
          const isLoading = state.loadingTickers?.has(pos.ticker)
          const sparkData = getSparkData(pos.ticker, state.priceCache)
          const totalValue = summary.totalValue
          const weight = totalValue > 0 ? (pos.currentValue / totalValue) * 100 : 0

          return (
            <div
              key={pos.id}
              className="position-card"
              onClick={() => navigate(`/stocks/${pos.ticker}`)}
              style={{ cursor: 'pointer' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="card-ticker">{pos.ticker}</span>
                    {isLoading && <LoadingSpinner />}
                  </div>
                  <div className="card-name">{pos.companyName}</div>
                </div>
                <span
                  className="tag"
                  style={{ borderColor: SECTOR_COLORS[pos.sector], color: SECTOR_COLORS[pos.sector] }}
                >
                  {pos.sector}
                </span>
              </div>

              {/* Price + Sparkline */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>
                    {formatCurrency(pos.currentPrice)} / share
                  </div>
                  <div className="card-price">{formatCurrency(pos.currentValue)}</div>
                  <div className={`card-gain ${gc}`}>
                    {formatGain(pos.unrealizedGain)} ({formatPercent(pos.unrealizedGainPct)})
                  </div>
                </div>
                <Sparkline data={sparkData} positive={pos.unrealizedGain >= 0} width={80} height={40} />
              </div>

              {/* Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Shares</div>
                  <div className="mono">{pos.totalShares}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Avg Cost</div>
                  <div className="mono">{formatCurrency(pos.avgCostBasis)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Cost Basis</div>
                  <div className="mono">{formatCurrency(pos.totalCostBasis)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Total Return</div>
                  <div className={`mono ${gainClass(pos.totalReturn)}`}>
                    {formatGain(pos.totalReturn)}
                  </div>
                </div>
              </div>

              {/* Weight bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span>Portfolio weight</span>
                  <span className="mono">{weight.toFixed(1)}%</span>
                </div>
                <div className="weight-bar-bg" style={{ height: 4 }}>
                  <div className="weight-bar-fill" style={{ width: `${Math.min(weight, 100)}%` }} />
                </div>
              </div>

              <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>
                View detail →
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
