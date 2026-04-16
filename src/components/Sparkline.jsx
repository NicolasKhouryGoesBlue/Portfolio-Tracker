import { LineChart, Line, ResponsiveContainer } from 'recharts'

/**
 * Tiny inline sparkline — no axes, no labels.
 * data: array of numbers (close prices, newest last)
 * positive: true = green, false = red, null = neutral
 */
export default function Sparkline({ data = [], positive = null, width = 80, height = 32 }) {
  if (!data || data.length < 2) {
    // Flat neutral line
    const flat = [{ v: 1 }, { v: 1 }]
    return (
      <LineChart width={width} height={height} data={flat}>
        <Line type="monotone" dataKey="v" dot={false} stroke="var(--text-dim)" strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    )
  }

  const chartData = data.map(v => ({ v }))
  const color = positive === true ? 'var(--green)' : positive === false ? 'var(--red)' : 'var(--text-muted)'

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          dot={false}
          stroke={color}
          strokeWidth={1.5}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
