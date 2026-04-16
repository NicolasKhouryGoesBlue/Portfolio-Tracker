import { NavLink, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/',           label: 'Dashboard'      },
  { to: '/stocks',     label: 'My Stocks'      },
  { to: '/positions',  label: 'All Positions'  },
  { to: '/watchlist',  label: 'Watchlist'      },
]

export default function NavBar() {
  const location = useLocation()

  return (
    <nav style={{
      background: '#0d1117',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      height: 56,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 32 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <polyline points="1,14 5,8 9,11 13,5 19,9" stroke="var(--blue)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
          <polyline points="15,5 19,5 19,9" stroke="var(--blue)" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
        <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.01em' }}>Portfolio</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        {tabs.map(({ to, label }) => {
          // "My Stocks" tab is active on both /stocks and /stocks/:ticker
          const isActive = to === '/stocks'
            ? location.pathname.startsWith('/stocks')
            : to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to)

          return (
            <NavLink
              key={to}
              to={to}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0 18px',
                height: '100%',
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                transition: 'color .15s',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
