import { TIME_WINDOWS } from '../utils/timeWindows'

export default function TimeWindowSelector({ value, onChange }) {
  return (
    <div className="tw-selector">
      {TIME_WINDOWS.map(w => (
        <button
          key={w.key}
          className={`tw-btn${value === w.key ? ' active' : ''}`}
          onClick={() => onChange(w.key)}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}
