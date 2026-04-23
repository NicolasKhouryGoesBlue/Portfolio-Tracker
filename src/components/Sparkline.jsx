import { LineChart, Line, ResponsiveContainer } from 'recharts'

/**
 * Tiny inline sparkline — no axes, with start/end price labels and range hint.
 * data: array of numbers (close prices, newest last)
 * positive: true = green, false = red, null = neutral
 */
export default function Sparkline({ data = [], positive = null, width = 80, height = 32 }) {
  function formatPrice(val) {
    if (val == null) return ''
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
    if (val >= 100) return `$${Math.round(val)}`
    return `$${val.toFixed(2)}`
  }

  if (!data || data.length < 2) {
    const flat = [{ v: 1 }, { v: 1 }]
    return (
      <LineChart width={width} height={height} data={flat}>
        <Line type="monotone" dataKey="v" dot={false} stroke="var(--text-dim)" strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    )
  }

  const first = data[0]
  const last = data[data.length - 1]
  const color = positive === true ? 'var(--green)' : positive === false ? 'var(--red)' : 'var(--text-muted)'
  const chartData = data.map(v => ({ v }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          fontSize: '9px',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          minWidth: '36px',
          textAlign: 'right',
        }}>
          {formatPrice(first)}
        </span>

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

        <span style={{
          fontSize: '9px',
          color: positive === false ? 'var(--red)' : 'var(--green)',
          whiteSpace: 'nowrap',
          minWidth: '36px',
        }}>
          {formatPrice(last)}
        </span>
      </div>
      <div style={{
        fontSize: '9px',
        color: 'var(--text-muted)',
        paddingLeft: '40px',
        opacity: 0.6,
      }}>
        ~30d
      </div>
    </div>
  )
}
