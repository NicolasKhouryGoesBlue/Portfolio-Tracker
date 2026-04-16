export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      padding: '12px 24px',
      textAlign: 'center',
      color: 'var(--text-dim)',
      fontSize: 12,
      flexShrink: 0,
    }}>
      Data is stored in this browser only. Clearing browser data will erase your portfolio.
      {' '}Stock prices provided by{' '}
      <span style={{ color: 'var(--text-muted)' }}>Alpha Vantage</span>.
    </footer>
  )
}
