import { useState, useRef, useEffect } from 'react'
import { usePortfolio } from '../store/PortfolioContext'
import NewsList from '../components/NewsList'

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
  const {
    state,
    analysisResult, setAnalysisResult,
    analysisNewsData, setAnalysisNewsData,
    scenarioResult, setScenarioResult,
    scenarioInput, setScenarioInput,
    chatMessages, setChatMessages,
    showFullAnalysis, setShowFullAnalysis,
  } = usePortfolio()

  // ── Existing portfolio analysis state ────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // ── Scenario analysis state ───────────────────────────────────────────────────
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState(null)

  // ── Chat state ────────────────────────────────────────────────────────────────
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState(null)

  const chatBottomRef = useRef(null)
  const prevChatLengthRef = useRef(chatMessages.length)

  useEffect(() => {
    if (chatMessages.length > prevChatLengthRef.current) {
      prevChatLengthRef.current = chatMessages.length
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages])

  // ── Existing handler — untouched ─────────────────────────────────────────────
  async function handleRunAnalysis() {
    setLoading(true)
    setAnalysisResult(null)
    setError(null)
    setAnalysisNewsData(null)

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

    // Map ticker → companyName for the news query param
    const companyNames = {}
    for (const pos of state.positions) {
      companyNames[pos.ticker] = pos.companyName
    }

    // Fire analyze POST and all news GETs simultaneously
    const analyzePromise = fetch('http://localhost:8000/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers, holdings }),
    })

    const newsPromises = tickers.map(async (ticker) => {
      const companyName = companyNames[ticker]
      const url = companyName
        ? `http://localhost:8000/news/${encodeURIComponent(ticker)}?company_name=${encodeURIComponent(companyName)}`
        : `http://localhost:8000/news/${encodeURIComponent(ticker)}`
      try {
        const res = await fetch(url)
        if (!res.ok) return [ticker, []]
        const data = await res.json()
        return [ticker, Array.isArray(data.headlines) ? data.headlines : []]
      } catch {
        return [ticker, []]
      }
    })

    try {
      const [analyzeRes, ...newsResults] = await Promise.all([analyzePromise, ...newsPromises])

      if (!analyzeRes.ok) {
        throw new Error(`Server responded with ${analyzeRes.status}`)
      }

      const data = await analyzeRes.json()

      if (data.status !== 'success') {
        throw new Error(data.error ?? 'Analysis failed')
      }

      setAnalysisResult(data.analysis)

      const news = {}
      for (const [ticker, headlines] of newsResults) {
        news[ticker] = headlines
      }
      setAnalysisNewsData(news)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Scenario handler ──────────────────────────────────────────────────────────
  async function handleRunScenario() {
    if (!scenarioInput.trim()) return

    setScenarioLoading(true)
    setScenarioResult(null)
    setScenarioError(null)

    // Build holdings: quantity, cost_basis, and current_value where available
    const holdings = {}
    for (const pos of state.positions) {
      const totalShares = pos.lots.reduce((s, l) => s + l.shares, 0)
      const totalCost = pos.lots.reduce((s, l) => s + l.shares * l.pricePerShare, 0)
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0
      const currentPrice = state.priceCache[pos.ticker]?.quote?.price
      const entry = { quantity: totalShares, cost_basis: avgCost }
      if (currentPrice != null) entry.current_value = totalShares * currentPrice
      holdings[pos.ticker] = entry
    }

    try {
      const res = await fetch('http://localhost:8000/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioInput.trim(), holdings }),
      })
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      const data = await res.json()
      setScenarioResult(data)
    } catch (err) {
      setScenarioError(err.message)
    } finally {
      setScenarioLoading(false)
    }
  }

  // ── Chat handler ──────────────────────────────────────────────────────────────
  async function handleSendMessage() {
    if (!chatInput.trim()) return
    if (chatLoading) return

    setChatLoading(true)
    setChatError(null)

    const userMessage = chatInput.trim()
    setChatInput('')

    // Capture prior history before appending the new user message
    const priorHistory = chatMessages
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])

    // Build holdings: quantity, cost_basis, and current_value where available
    const holdings = {}
    for (const pos of state.positions) {
      const totalShares = pos.lots.reduce((s, l) => s + l.shares, 0)
      const totalCost = pos.lots.reduce((s, l) => s + l.shares * l.pricePerShare, 0)
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0
      const currentPrice = state.priceCache[pos.ticker]?.quote?.price
      const entry = { quantity: totalShares, cost_basis: avgCost }
      if (currentPrice != null) entry.current_value = totalShares * currentPrice
      holdings[pos.ticker] = entry
    }

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_history: priorHistory,
          holdings,
        }),
      })
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }])
    } catch (err) {
      setChatError(err.message)
    } finally {
      setChatLoading(false)
    }
  }

  // ── Derived display values ────────────────────────────────────────────────────
  const hasAnyNews = analysisNewsData != null && Object.values(analysisNewsData).some(h => h.length > 0)

  const DIVIDER = '---FULL ANALYSIS---'
  const analysisParts = analysisResult ? analysisResult.split(DIVIDER) : null
  const bulletSection = analysisParts ? analysisParts[0].trim() : null
  const fullSection = analysisParts && analysisParts.length >= 2 ? analysisParts[1].trim() : null
  const hasDivider = fullSection !== null

  // Inline formatters for scenario results (no external import needed)
  function fmtImpact(n) {
    if (n == null || isNaN(n)) return '—'
    const sign = n >= 0 ? '+' : '-'
    return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  function fmtMove(n) {
    if (n == null || isNaN(n)) return '—'
    const sign = n >= 0 ? '+' : ''
    return `${sign}${Number(n).toFixed(2)}%`
  }
  function impactColor(n) {
    if (n == null || isNaN(n) || n === 0) return 'var(--text)'
    return n > 0 ? 'var(--green)' : 'var(--red)'
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Analysis</h1>
      </div>

      {/* ── Portfolio Analysis ──────────────────────────────────────────────────── */}
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

      {analysisResult && !loading && (
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

          {/* Bullets section — always shown */}
          <div
            style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(hasDivider ? bulletSection : analysisResult) }}
          />

          {/* Toggle — only shown when the divider was present */}
          {hasDivider && (
            <>
              <button
                onClick={() => setShowFullAnalysis(v => !v)}
                style={{
                  marginTop: 14,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 13,
                  color: 'var(--blue)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {showFullAnalysis ? 'Hide full analysis' : 'Show full analysis'}
              </button>

              {showFullAnalysis && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
                  <div
                    style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(fullSection) }}
                  />
                </>
              )}
            </>
          )}

          {hasAnyNews && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0 20px' }} />
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: 14,
              }}>
                Recent News
              </div>
              {Object.entries(analysisNewsData)
                .filter(([, headlines]) => headlines.length > 0)
                .map(([ticker, headlines]) => (
                  <div key={ticker} style={{ marginBottom: 18 }}>
                    <div
                      className="mono"
                      style={{ fontWeight: 700, fontSize: 13, color: 'var(--blue)', marginBottom: 8 }}
                    >
                      {ticker}
                    </div>
                    <NewsList items={headlines} />
                  </div>
                ))
              }
            </>
          )}
        </div>
      )}

      {/* ── Scenario Analysis ───────────────────────────────────────────────────── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0' }} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 10,
        }}>
          Scenario Analysis
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Describe a market event and see how your portfolio would be affected.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            value={scenarioInput}
            onChange={e => setScenarioInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRunScenario() }}
            placeholder="e.g. S&P 500 drops 20%, interest rates rise 1%, tech selloff"
            disabled={scenarioLoading}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleRunScenario}
            disabled={scenarioLoading}
          >
            {scenarioLoading ? 'Running...' : 'Run Scenario'}
          </button>
        </div>
        {scenarioLoading && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            Analyzing scenario...
          </p>
        )}
        {scenarioError && !scenarioLoading && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 10 }}>
            {scenarioError}
          </p>
        )}
      </div>

      {scenarioResult && !scenarioLoading && (
        <div className="card">
          {/* Scenario label */}
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 14 }}>
            Scenario: {scenarioResult.scenario ?? scenarioInput}
          </div>

          {/* Total portfolio impact */}
          {scenarioResult.total_impact != null && (
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              color: impactColor(scenarioResult.total_impact),
              marginBottom: 24,
            }}>
              Estimated Portfolio Impact: {fmtImpact(scenarioResult.total_impact)}
            </div>
          )}

          {/* Per-position impact table */}
          {Array.isArray(scenarioResult.positions) && scenarioResult.positions.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Ticker', 'Sector', 'Beta', 'Est. Move', 'Est. Impact'].map(h => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '6px 8px',
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scenarioResult.positions.map((pos, i) => (
                    <tr key={pos.ticker ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td
                        className="mono"
                        style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--blue)' }}
                      >
                        {pos.ticker ?? '—'}
                      </td>
                      <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {pos.sector ?? '—'}
                      </td>
                      <td className="mono" style={{ padding: '8px 8px' }}>
                        {pos.beta != null ? Number(pos.beta).toFixed(2) : '—'}
                      </td>
                      <td
                        className="mono"
                        style={{ padding: '8px 8px', color: impactColor(pos.estimated_move_pct) }}
                      >
                        {fmtMove(pos.estimated_move_pct)}
                      </td>
                      <td
                        className="mono"
                        style={{ padding: '8px 8px', color: impactColor(pos.estimated_impact_usd) }}
                      >
                        {fmtImpact(pos.estimated_impact_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Narrative analysis */}
          {scenarioResult.analysis && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 16px' }} />
              <div
                style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(scenarioResult.analysis) }}
              />
            </>
          )}
        </div>
      )}

      {/* ── Chat with Claude ─────────────────────────────────────────────────────── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0' }} />

      <div className="card">
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 10,
        }}>
          Chat with Claude
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Ask anything about your portfolio. Claude knows your holdings, prices, and sector weights.
        </p>

        {chatMessages.length > 0 && (
          <div style={{
            height: 400,
            overflowY: 'auto',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: msg.role === 'user' ? '75%' : '85%',
                  background: msg.role === 'user' ? 'var(--blue)' : 'rgba(255,255,255,0.06)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}>
                  {msg.role === 'assistant'
                    ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    : msg.content
                  }
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
        )}

        {chatLoading && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Claude is thinking...
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSendMessage() }}
            placeholder="Ask about your portfolio..."
            disabled={chatLoading}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSendMessage}
            disabled={chatLoading || !chatInput.trim()}
          >
            Send
          </button>
        </div>

        {chatError && (
          <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 10 }}>
            {chatError}
          </p>
        )}
      </div>
    </div>
  )
}
