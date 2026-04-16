// Central configuration — the only place the API key is referenced
export const API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_KEY

export const API_BASE_URL = 'https://www.alphavantage.co/query'

// 24 hours in milliseconds — cache TTL
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Energy',
  'Consumer',
  'Industrials',
  'Real Estate',
  'Utilities',
  'Materials',
  'Communications',
  'Other',
]

export const SECTOR_COLORS = {
  Technology: '#3b82f6',
  Healthcare: '#10b981',
  Financials: '#f59e0b',
  Energy: '#f97316',
  Consumer: '#8b5cf6',
  Industrials: '#ec4899',
  'Real Estate': '#14b8a6',
  Utilities: '#06b6d4',
  Materials: '#84cc16',
  Communications: '#a78bfa',
  Other: '#6b7280',
}
