import { useState, useEffect } from 'react'
import { usePortfolio } from '../store/PortfolioContext'
import NewsList from '../components/NewsList'

export default function GeneralNews() {
  const { state } = usePortfolio()
  const [newsByTicker, setNewsByTicker] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (state.positions.length === 0) return

    setLoading(true)
    setError(null)
    setNewsByTicker({})

    const promises = state.positions.map(pos => {
      const { ticker, companyName } = pos
      const url = companyName
        ? `http://localhost:8000/news/${encodeURIComponent(ticker)}?company_name=${encodeURIComponent(companyName)}`
        : `http://localhost:8000/news/${encodeURIComponent(ticker)}`
      return fetch(url)
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then(data => ({ ticker, headlines: Array.isArray(data.headlines) ? data.headlines : [] }))
    })

    Promise.allSettled(promises).then(results => {
      const next = {}
      for (const result of results) {
        if (result.status === 'fulfilled') {
          next[result.value.ticker] = result.value.headlines
        }
      }
      setNewsByTicker(next)
      setLoading(false)
    })
  }, [state.positions])

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Recent News</h1>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading news for your portfolio…</p>
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Failed to load news</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{error}</p>
        </div>
      )}

      {!loading && state.positions.length === 0 && (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No positions in your portfolio.</p>
        </div>
      )}

      {!loading && state.positions.map(pos => (
        <div key={pos.ticker} className="card" style={{ marginBottom: 16 }}>
          <div
            className="mono"
            style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 12 }}
          >
            {pos.ticker}
          </div>
          <NewsList
            items={newsByTicker[pos.ticker] || []}
            emptyMessage={`No recent news for ${pos.ticker}.`}
          />
        </div>
      ))}
    </div>
  )
}
