import { useState } from 'react'
import Modal from './Modal'
import { SECTORS } from '../config'
import { usePortfolio } from '../store/PortfolioContext'

const today = () => new Date().toISOString().split('T')[0]

export default function AddPositionModal({ onClose, prefill = null }) {
  const { state, actions } = usePortfolio()
  const existingTickers = state.positions.map(p => p.ticker)

  const [form, setForm] = useState({
    ticker:       prefill?.ticker || '',
    companyName:  prefill?.companyName || '',
    sector:       prefill?.sector || 'Technology',
    date:         today(),
    shares:       '',
    pricePerShare: '',
  })
  const [errors, setErrors] = useState({})

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.ticker.trim()) e.ticker = 'Required'
    if (!form.companyName.trim()) e.companyName = 'Required'
    if (!form.date) e.date = 'Required'
    const shares = parseFloat(form.shares)
    if (isNaN(shares) || shares <= 0) e.shares = 'Must be > 0'
    const price = parseFloat(form.pricePerShare)
    if (isNaN(price) || price <= 0) e.pricePerShare = 'Must be > 0'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    const ticker = form.ticker.trim().toUpperCase()
    const isExisting = existingTickers.includes(ticker)

    actions.addPosition({
      ticker,
      companyName: form.companyName.trim(),
      sector: form.sector,
      lot: {
        date: form.date,
        shares: parseFloat(form.shares),
        pricePerShare: parseFloat(form.pricePerShare),
      },
    })
    onClose()
  }

  const ticker = form.ticker.trim().toUpperCase()
  const isExisting = existingTickers.includes(ticker)

  return (
    <Modal
      title="Add Position"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {isExisting ? 'Add Lot' : 'Add Position'}
          </button>
        </>
      }
    >
      {isExisting && (
        <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--blue)' }}>
          <strong>{ticker}</strong> is already in your portfolio. This will add a new purchase lot.
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label>Ticker Symbol *</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value.toUpperCase())}
            placeholder="AAPL"
            style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
          />
          {errors.ticker && <span className="field-error">{errors.ticker}</span>}
        </div>
        <div className="field">
          <label>Sector *</label>
          <select value={form.sector} onChange={e => set('sector', e.target.value)}>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Company Name *</label>
        <input
          value={form.companyName}
          onChange={e => set('companyName', e.target.value)}
          placeholder="Apple Inc."
          disabled={isExisting}
          style={isExisting ? { opacity: .6 } : {}}
        />
        {errors.companyName && <span className="field-error">{errors.companyName}</span>}
      </div>

      <hr className="divider" style={{ margin: '4px 0' }} />
      <p className="label-sm" style={{ marginBottom: 4 }}>Purchase Lot</p>

      <div className="field-row3">
        <div className="field">
          <label>Date *</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          {errors.date && <span className="field-error">{errors.date}</span>}
        </div>
        <div className="field">
          <label>Shares *</label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.shares}
            onChange={e => set('shares', e.target.value)}
            placeholder="10"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          {errors.shares && <span className="field-error">{errors.shares}</span>}
        </div>
        <div className="field">
          <label>Price / Share *</label>
          <input
            type="number"
            min="0"
            step="any"
            value={form.pricePerShare}
            onChange={e => set('pricePerShare', e.target.value)}
            placeholder="142.50"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          {errors.pricePerShare && <span className="field-error">{errors.pricePerShare}</span>}
        </div>
      </div>

      {form.shares && form.pricePerShare && (
        <div style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
          Cost basis: <span className="mono" style={{ color: 'var(--text)' }}>
            ${(parseFloat(form.shares || 0) * parseFloat(form.pricePerShare || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </Modal>
  )
}
