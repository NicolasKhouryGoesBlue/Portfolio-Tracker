export const TIME_WINDOWS = [
  { key: '1D', label: '1D', days: 1 },
  { key: '1W', label: '1W', days: 7 },
  { key: 'MTD', label: 'MTD', days: null, mode: 'mtd' },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: 'YTD', label: 'YTD', days: null, mode: 'ytd' },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '5Y', label: '5Y', days: 1825 },
  { key: 'MAX', label: 'MAX', days: null, mode: 'max' },
]

/**
 * Returns a YYYY-MM-DD start date string for a given time window key,
 * or null for MAX.
 */
export function getWindowStartDate(windowKey) {
  const win = TIME_WINDOWS.find(w => w.key === windowKey)
  if (!win) return null

  const now = new Date()

  if (win.mode === 'max') return null

  if (win.mode === 'mtd') {
    return toDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  if (win.mode === 'ytd') {
    return toDateStr(new Date(now.getFullYear(), 0, 1))
  }

  if (win.days != null) {
    return toDateStr(new Date(now.getTime() - win.days * 86_400_000))
  }

  return null
}

function toDateStr(d) {
  return d.toISOString().split('T')[0]
}
