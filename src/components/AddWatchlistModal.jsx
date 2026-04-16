import { useState } from 'react'
import Modal from './Modal'
import { SECTORS } from '../config'
import { usePortfolio } from '../store/PortfolioContext'

export default function AddWatchlistModal({ onClose, editEntry = null }) {
  const { actions } = usePortfolio()

  const [form, setForm] = useState({
    ticker:        editEntry?.ticker || '',
    companyName:   editEntry?.companyName || '',
    sector:        editEntry?.sector || 'Technology',
    reason:        editEntry?.reason || '',
    targetBuyPrice: editEntry?.targetBuyPrice?.toString() || '',
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
    const price = parseFloat(form.targetBuyPrice)
    if (isNaN(price) || price <= 0) e.targetBuyPrice = 'Must be > 0'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    const payload = {
      ticker:        form.ticker.trim().toUpperCase(),
      companyName:   form.companyName.trim(),
      sector:        form.sector,
      reason:        form.reason.trim(),
      targetBuyPrice: parseFloat(form.targetBuyPrice),
    }
    if (editEntry) {
      actions.updateWatchlistEntry(editEntry.id, payload)
    } else {
      actions.addWatchlistEntry(payload)
    }
    onClose()
  }

  return (
    <Modal
      title={editEntry ? 'Edit Watchlist Entry' : 'Add to Watchlist'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            {editEntry ? 'Save Changes' : 'Add to Watchlist'}
          </button>
        </>
      }
    >
      <div className="field-row">
        <div className="field">
          <label>Ticker Symbol *</label>
          <input
            value={form.ticker}
            onChange={e => set('ticker', e.target.value.toUpperCase())}
            placeholder="META"
            style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
            disabled={!!editEntry}
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
          placeholder="Meta Platforms Inc."
        />
        {errors.companyName && <span className="field-error">{errors.companyName}</span>}
      </div>

      <div className="field">
        <label>Target Buy Price *</label>
        <input
          type="number"
          min="0"
          step="any"
          value={form.targetBuyPrice}
          onChange={e => set('targetBuyPrice', e.target.value)}
          placeholder="480.00"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        {errors.targetBuyPrice && <span className="field-error">{errors.targetBuyPrice}</span>}
      </div>

      <div className="field">
        <label>Reason for Watching</label>
        <textarea
          className="notes-area"
          value={form.reason}
          onChange={e => set('reason', e.target.value)}
          placeholder="Why are you watching this stock?"
          style={{ minHeight: 70 }}
        />
      </div>
    </Modal>
  )
}
