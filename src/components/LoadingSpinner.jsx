export default function LoadingSpinner({ size = 'sm', label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={`spinner${size === 'lg' ? ' spinner-lg' : ''}`} />
      {label && <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>}
    </span>
  )
}
