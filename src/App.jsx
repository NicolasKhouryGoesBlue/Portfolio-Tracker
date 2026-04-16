import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PortfolioProvider } from './store/PortfolioContext'
import NavBar from './components/NavBar'
import Footer from './components/Footer'
import Dashboard from './pages/Dashboard'
import MyStocks from './pages/MyStocks'
import MyStockDetail from './pages/MyStockDetail'
import AllPositions from './pages/AllPositions'
import Watchlist from './pages/Watchlist'

export default function App() {
  return (
    <PortfolioProvider>
      <BrowserRouter>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <NavBar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/stocks"        element={<MyStocks />} />
              <Route path="/stocks/:ticker" element={<MyStockDetail />} />
              <Route path="/positions"     element={<AllPositions />} />
              <Route path="/watchlist"     element={<Watchlist />} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </PortfolioProvider>
  )
}
