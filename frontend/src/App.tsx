import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { PolicyPurchase } from './pages/PolicyPurchase';
import { TradFiInsurance } from './pages/TradFiInsurance';
import { VaultStaking } from './pages/VaultStaking';
import { Claims } from './pages/Claims';
import { HedgedInsurance } from './pages/HedgedInsurance';
import { Analytics } from './pages/Analytics';
import { RiskDashboard } from './pages/RiskDashboard';
import { Home } from './pages/Home';
import { MultiChainInsurance } from './pages/MultiChainInsurance';
import { EnterpriseBulk } from './pages/EnterpriseBulk';
import { Escrow } from './pages/Escrow';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminRoute, useIsAdmin } from './components/AdminRoute';

const manifestUrl = import.meta.env.VITE_TON_CONNECT_MANIFEST_URL || 'http://localhost:5174/tonconnect-manifest.json';

function Navigation() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [coverageDropdownOpen, setCoverageDropdownOpen] = useState(false);
  const [mobileCoverageOpen, setMobileCoverageOpen] = useState(false);
  const isAdmin = useIsAdmin();

  const isCoveragePage = ['/policy', '/tradfi', '/multi-chain', '/enterprise', '/hedged'].includes(location.pathname);

  return (
    <nav className="bg-cream-300 border-b-3 border-cream-400">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex justify-between items-center gap-4">
          <Link to="/" className="text-xl font-bold font-mono text-[#D87665] flex items-center gap-1 hover:text-[#C66555] transition-colors">
            <span>&gt;</span>
            <span className="tracking-tight">TONSURANCE</span>
          </Link>

          {/* Desktop menu */}
          <div className="hidden md:flex gap-1 text-sm font-mono flex-1">
            {/* BUY_COVERAGE Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setCoverageDropdownOpen(true)}
              onMouseLeave={() => setCoverageDropdownOpen(false)}
            >
              <Link
                to="/policy"
                className={`px-3 py-1 border-2 transition-colors inline-block ${
                  isCoveragePage
                    ? 'bg-copper-500 text-cream-50 border-copper-600'
                    : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                }`}
              >
                &gt; BUY_COVERAGE ▾
              </Link>

              {coverageDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 w-56 bg-cream-300 border-2 border-cream-400 shadow-lg z-50"
                >
                  <div className="px-3 py-1 bg-cream-400 font-bold text-xs text-text-secondary">
                    HACKATHON DEMO
                  </div>
                  <Link
                    to="/policy"
                    onClick={() => setCoverageDropdownOpen(false)}
                    className={`block px-3 py-2 border-b-2 border-cream-400 transition-colors ${
                      isActive('/policy')
                        ? 'bg-copper-500 text-cream-50'
                        : 'hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; DeFi (Depeg Insurance)
                  </Link>
                  <Link
                    to="/tradfi"
                    onClick={() => setCoverageDropdownOpen(false)}
                    className={`block px-3 py-2 border-b-2 border-cream-400 transition-colors ${
                      isActive('/tradfi')
                        ? 'bg-copper-500 text-cream-50'
                        : 'hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; TradFi (Catastrophe) 🌪️
                  </Link>
                  <div className="px-3 py-1 bg-cream-400 font-bold text-xs text-text-secondary mt-2">
                    COMING SOON
                  </div>
                  <Link
                    to="/multi-chain"
                    onClick={() => setCoverageDropdownOpen(false)}
                    className={`block px-3 py-2 border-b-2 border-cream-400 transition-colors ${
                      isActive('/multi-chain')
                        ? 'bg-copper-500 text-cream-50'
                        : 'hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Multi-Chain
                  </Link>
                  <Link
                    to="/enterprise"
                    onClick={() => setCoverageDropdownOpen(false)}
                    className={`block px-3 py-2 border-b-2 border-cream-400 transition-colors ${
                      isActive('/enterprise')
                        ? 'bg-copper-500 text-cream-50'
                        : 'hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Enterprise
                  </Link>
                  <Link
                    to="/hedged"
                    onClick={() => setCoverageDropdownOpen(false)}
                    className={`block px-3 py-2 transition-colors ${
                      isActive('/hedged')
                        ? 'bg-copper-500 text-cream-50'
                        : 'hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Hedge
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="/vaults"
              onClick={() => setCoverageDropdownOpen(false)}
              className={`px-3 py-1 border-2 transition-colors ${
                isActive('/vaults')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; VAULTS
            </Link>
            <Link
              to="/escrow"
              onClick={() => setCoverageDropdownOpen(false)}
              className={`px-3 py-1 border-2 transition-colors ${
                isActive('/escrow')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; ESCROW
            </Link>
            <Link
              to="/claims"
              onClick={() => setCoverageDropdownOpen(false)}
              className={`px-3 py-1 border-2 transition-colors ${
                isActive('/claims')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; CLAIMS
            </Link>
            <Link
              to="/analytics"
              onClick={() => setCoverageDropdownOpen(false)}
              className={`px-3 py-1 border-2 transition-colors ${
                isActive('/analytics')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; ANALYTICS
            </Link>
            <Link
              to="/risk"
              onClick={() => setCoverageDropdownOpen(false)}
              className={`px-3 py-1 border-2 transition-colors ${
                isActive('/risk')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; RISK
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setCoverageDropdownOpen(false)}
                className={`px-3 py-1 border-2 transition-colors ${
                  isActive('/admin')
                    ? 'bg-copper-500 text-cream-50 border-copper-600'
                    : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                }`}
              >
                &gt; ADMIN
              </Link>
            )}
          </div>

          {/* Wallet button - always visible */}
          <div className="flex items-center">
            <WalletConnect />
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden px-3 py-1 border-2 border-cream-400 hover:bg-cream-200 transition-colors"
            aria-label="Toggle menu"
          >
            <span className="text-copper-500 font-bold font-mono text-lg">
              {mobileMenuOpen ? '✕' : '☰'}
            </span>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t-2 border-cream-400 space-y-2">
            {/* BUY_COVERAGE Collapsible */}
            <div>
              <Link
                to="/policy"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                  isActive('/policy')
                    ? 'bg-copper-500 text-cream-50 border-copper-600'
                    : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                }`}
              >
                &gt; DeFi (Depeg Insurance)
              </Link>

              <Link
                to="/tradfi"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                  isActive('/tradfi')
                    ? 'bg-copper-500 text-cream-50 border-copper-600'
                    : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                }`}
              >
                &gt; TradFi (Catastrophe) 🌪️
              </Link>

              <button
                onClick={() => setMobileCoverageOpen(!mobileCoverageOpen)}
                className="w-full text-left px-3 py-2 text-xs font-mono text-text-secondary hover:text-copper-500 transition-colors"
              >
                {mobileCoverageOpen ? '▴' : '▾'} More Coverage Options (Coming Soon)
              </button>

              {mobileCoverageOpen && (
                <div className="ml-4 space-y-2">
                  <Link
                    to="/multi-chain"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                      isActive('/multi-chain')
                        ? 'bg-copper-500 text-cream-50 border-copper-600'
                        : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Multi-Chain
                  </Link>
                  <Link
                    to="/enterprise"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                      isActive('/enterprise')
                        ? 'bg-copper-500 text-cream-50 border-copper-600'
                        : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Enterprise
                  </Link>
                  <Link
                    to="/hedged"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                      isActive('/hedged')
                        ? 'bg-copper-500 text-cream-50 border-copper-600'
                        : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                    }`}
                  >
                    &gt; Hedge
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="/vaults"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                isActive('/vaults')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; VAULTS
            </Link>
            <Link
              to="/escrow"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                isActive('/escrow')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; ESCROW
            </Link>
            <Link
              to="/claims"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                isActive('/claims')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; CLAIMS
            </Link>
            <Link
              to="/analytics"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                isActive('/analytics')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; ANALYTICS
            </Link>
            <Link
              to="/risk"
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 border-2 transition-colors text-sm font-mono ${
                isActive('/risk')
                  ? 'bg-copper-500 text-cream-50 border-copper-600'
                  : 'border-cream-400 hover:bg-cream-200 text-text-primary'
              }`}
            >
              &gt; RISK
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

function App() {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <Router>
        <div className="min-h-screen bg-cream-200">
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/policy" element={<PolicyPurchase />} />
              <Route path="/tradfi" element={<TradFiInsurance />} />
              <Route path="/multi-chain" element={<MultiChainInsurance />} />
              <Route path="/enterprise" element={<EnterpriseBulk />} />
              <Route path="/hedged" element={<HedgedInsurance />} />
              <Route path="/vaults" element={<VaultStaking />} />
              <Route path="/claims" element={<Claims />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/risk" element={<RiskDashboard />} />
              <Route path="/escrow" element={<Escrow />} />
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            </Routes>
          </main>
        </div>
      </Router>
    </TonConnectUIProvider>
  );
}

export default App;
