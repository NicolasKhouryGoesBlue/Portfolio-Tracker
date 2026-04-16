const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyFmtCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const numberFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—'
  return currencyFmt.format(val)
}

export function formatCurrencyCompact(val) {
  if (val == null || isNaN(val)) return '—'
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}K`
  }
  return currencyFmt.format(val)
}

export function formatPercent(val, showSign = true) {
  if (val == null || isNaN(val)) return '—'
  const sign = showSign && val > 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

export function formatGain(val) {
  if (val == null || isNaN(val)) return '—'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${currencyFmt.format(val)}`
}

export function formatNumber(val, decimals = 2) {
  if (val == null || isNaN(val)) return '—'
  return val.toFixed(decimals)
}

export function formatShares(val) {
  if (val == null || isNaN(val)) return '—'
  return val % 1 === 0 ? val.toString() : numberFmt.format(val)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(ts) {
  if (!ts) return 'Never'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function gainClass(val) {
  if (val == null || val === 0) return 'neutral'
  return val > 0 ? 'gain' : 'loss'
}
