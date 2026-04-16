/**
 * Core portfolio calculations. All functions are pure — they take state and
 * return derived values without mutating anything.
 */

export function getCurrentPrice(ticker, priceCache) {
  return priceCache[ticker]?.quote?.price ?? null
}

/**
 * Enrich a single position with all calculated metrics.
 */
export function calcPosition(position, priceCache) {
  const currentPrice = getCurrentPrice(position.ticker, priceCache)
  const lots = position.lots ?? []
  const dividends = position.dividends ?? []

  const totalShares = lots.reduce((s, l) => s + l.shares, 0)
  const totalCostBasis = lots.reduce((s, l) => s + l.shares * l.pricePerShare, 0)
  const avgCostBasis = totalShares > 0 ? totalCostBasis / totalShares : 0

  // Use live price if available, otherwise fall back to last known or avg cost
  const effectivePrice = currentPrice ?? avgCostBasis
  const currentValue = totalShares * effectivePrice
  const unrealizedGain = currentValue - totalCostBasis
  const unrealizedGainPct = totalCostBasis > 0 ? (unrealizedGain / totalCostBasis) * 100 : 0

  const totalDividends = dividends.reduce((s, d) => s + d.amount, 0)
  const totalReturn = unrealizedGain + totalDividends
  const totalReturnPct = totalCostBasis > 0 ? (totalReturn / totalCostBasis) * 100 : 0

  return {
    ...position,
    currentPrice: effectivePrice,
    livePriceAvailable: currentPrice != null,
    totalShares,
    totalCostBasis,
    avgCostBasis,
    currentValue,
    unrealizedGain,
    unrealizedGainPct,
    totalDividends,
    totalReturn,
    totalReturnPct,
  }
}

/**
 * Summarize the entire portfolio.
 */
export function calcPortfolioSummary(positions, priceCache) {
  const enriched = positions.map(p => calcPosition(p, priceCache))
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0)
  const totalInvested = enriched.reduce((s, p) => s + p.totalCostBasis, 0)
  const totalUnrealizedGain = enriched.reduce((s, p) => s + p.unrealizedGain, 0)
  const totalDividends = enriched.reduce((s, p) => s + p.totalDividends, 0)
  const totalReturn = totalUnrealizedGain + totalDividends
  const unrealizedGainPct = totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0
  const totalReturnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0

  return {
    totalValue,
    totalInvested,
    totalUnrealizedGain,
    unrealizedGainPct,
    totalDividends,
    totalReturn,
    totalReturnPct,
    positions: enriched,
  }
}

/**
 * Sector allocation — array of { sector, value, percentage }.
 */
export function calcSectorAllocation(positions, priceCache) {
  const enriched = positions.map(p => calcPosition(p, priceCache))
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0)
  const map = {}
  for (const p of enriched) {
    const sector = p.sector || 'Other'
    map[sector] = (map[sector] ?? 0) + p.currentValue
  }
  return Object.entries(map)
    .map(([sector, value]) => ({
      sector,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Portfolio weight per position — array of { ticker, weight }.
 */
export function calcPortfolioWeights(positions, priceCache) {
  const enriched = positions.map(p => calcPosition(p, priceCache))
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0)
  return enriched.map(p => ({
    ...p,
    weight: totalValue > 0 ? (p.currentValue / totalValue) * 100 : 0,
  }))
}

/**
 * Build daily portfolio value series from historical close price data.
 * Returns array of { date: 'YYYY-MM-DD', value: number }.
 */
export function buildPortfolioHistory(positions, priceCache, startDate = null) {
  // Collect all trading dates across all tickers
  const allDates = new Set()
  for (const pos of positions) {
    const history = priceCache[pos.ticker]?.history
    if (history) Object.keys(history).forEach(d => allDates.add(d))
  }
  if (allDates.size === 0) return []

  const sorted = Array.from(allDates).sort()

  // Find the earliest purchase date across all positions
  const earliestPurchase = positions
    .flatMap(p => p.lots.map(l => l.date))
    .sort()[0]

  // Apply start date filter
  const effectiveStart = startDate
    ? startDate > earliestPurchase
      ? startDate
      : earliestPurchase
    : earliestPurchase

  const dates = sorted.filter(d => d >= effectiveStart)
  if (dates.length === 0) return []

  const result = []
  // Build a price lookup for fast access
  const priceAt = {}
  for (const pos of positions) {
    const history = priceCache[pos.ticker]?.history
    if (!history) continue
    priceAt[pos.ticker] = history
  }

  for (const date of dates) {
    let dayValue = 0
    let hasPosition = false

    for (const pos of positions) {
      const history = priceAt[pos.ticker]
      if (!history) continue

      const sharesOwned = pos.lots
        .filter(l => l.date <= date)
        .reduce((s, l) => s + l.shares, 0)

      if (sharesOwned <= 0) continue

      // Find price on or closest before this date
      const price = history[date] ?? findPriceBefore(history, date)
      if (price != null) {
        dayValue += sharesOwned * price
        hasPosition = true
      }
    }

    if (hasPosition && dayValue > 0) {
      result.push({ date, value: dayValue })
    }
  }

  return result
}

function findPriceBefore(history, targetDate) {
  // Binary-search-style: get the last date <= targetDate
  const dates = Object.keys(history).filter(d => d <= targetDate)
  if (dates.length === 0) return null
  dates.sort()
  return history[dates[dates.length - 1]]
}

/**
 * Benchmark return comparison.
 */
export function calcBenchmarkComparison(portfolioReturnPct, benchmark) {
  const { initialSP, currentSP } = benchmark
  if (!initialSP || !currentSP || initialSP <= 0) return null
  const spReturn = ((currentSP - initialSP) / initialSP) * 100
  const alpha = portfolioReturnPct - spReturn
  return { spReturn, alpha, portfolioReturnPct }
}
