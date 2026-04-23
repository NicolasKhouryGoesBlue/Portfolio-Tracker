export default function NewsList({ items, emptyMessage = 'No recent news available.' }) {
  if (!items || items.length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{emptyMessage}</p>
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.5,
            paddingLeft: 12,
            borderLeft: '2px solid var(--border-light)',
          }}
        >
          {item.url
            ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {item.headline}
              </a>
            )
            : <span>{item.headline}</span>
          }
          {item.source && (
            item.url
              ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6, textDecoration: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                >
                  [{item.source}]
                </a>
              )
              : (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                  [{item.source}]
                </span>
              )
          )}
        </li>
      ))}
    </ul>
  )
}
