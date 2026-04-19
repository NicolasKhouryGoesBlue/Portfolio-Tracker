import { useState } from 'react'
import { usePortfolio } from '../store/PortfolioContext'

function renderMarkdown(text) {
  // Convert markdown-like formatting to HTML
  let html = text
    // Escape existing HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers: ### or ## or #
    .replace(/^### (.+)$/gm, '<h4 style="color:var(--text);margin:16px 0 6px;font-size:14px;font-weight:700">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="color:var(--text);margin:20px 0 8px;font-size:16px;font-weight:700">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="color:var(--text);margin:20px 0 8px;font-size:18px;font-weight:700">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Double newlines → paragraph breaks
    .replace(/\n\n/g, '</p><p style="margin:10px 0">')
    // Single newlines → line breaks
    .replace(/\n/g, '<br>')

  return `<p style="margin:10px 0">${html}</p>`
}

export default function Analysis() {
  const { state } = usePortfolio()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  async function handleRunAnalysis() {
    setLoading(true)
    setResult(null)
    setError(null)

    // Build holdings from state, falling back to placeholder if no positions
    let tickers
    let holdings

    if (state.positions.length > 0) {
      tickers = state.positions.map(p => p.ticker)
      holdings = {}
      for (const pos of state.positions) {
        const totalShares = pos.lots.reduce((s, l) => s + l.shares, 0)
        const totalCost = pos.lots.reduce((s, l) => s + l.shares * l.pricePerShare, 0)
        const avgCost = totalShares > 0 ? totalCost / totalShares : 0
        holdings[pos.ticker] = { quantity: totalShares, cost_basis: avgCost }
      }
    } else {
      tickers = ['AAPL']
      holdings = { AAPL: { quantity: 10, cost_basis: 150.00 } }
    }

    try {
      const res = await fetch('http://localhost:8000/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, holdings }),
      })

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`)
      }

      const data = await res.json()

      if (data.status !== 'success') {
        throw new Error(data.error ?? 'Analysis failed')
      }

      setResult(data.analysis)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Analysis</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Get an AI-powered analysis of your current portfolio holdings, including risk assessment,
          diversification insights, and actionable observations.
        </p>
        <button
          className="btn btn-primary"
          onClick={handleRunAnalysis}
          disabled={loading}
        >
          {loading ? 'Analyzing…' : 'Run Analysis'}
        </button>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Analyzing your portfolio…</p>
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Analysis failed</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{error}</p>
        </div>
      )}

      {result && !loading && (
        <div className="card">
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 14,
          }}>
            Analysis Result
          </div>
          <div
            style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(result) }}
          />
        </div>
      )}
    </div>
  )
}
