/**
 * Seed data injected on first launch so every view is immediately usable.
 * Uses realistic prices and dates.
 */

function id() {
  return crypto.randomUUID()
}

export const PLACEHOLDER_POSITIONS = [
  {
    id: id(),
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Technology',
    lots: [
      { id: id(), date: '2022-06-15', shares: 20, pricePerShare: 135.87 },
      { id: id(), date: '2023-11-10', shares: 15, pricePerShare: 182.41 },
    ],
    dividends: [
      { id: id(), date: '2024-02-15', amount: 14.60 },
      { id: id(), date: '2024-08-15', amount: 14.60 },
    ],
    notes: 'Core holding. Strong services growth, tight ecosystem lock-in. Will add on dips.',
  },
]

export const PLACEHOLDER_WATCHLIST = []

export const PLACEHOLDER_BENCHMARK = {
  initialSP: 4700,
  currentSP: 5300,
}

/**
 * Placeholder prices used for display before live API data loads.
 * These are approximate recent values — real prices will replace them.
 */
export const PLACEHOLDER_PRICES = {
  AAPL: 213.49,
}
