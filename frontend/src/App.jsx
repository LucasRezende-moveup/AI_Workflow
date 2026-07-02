import { useState, useEffect } from 'react';
import { Activity, LayoutDashboard, Link2, Search, Layers, LogOut, Settings, Target, BarChart2, Globe, Users as UsersIcon } from 'lucide-react';
import moveupLogo from './assets/logo.png';
import GscDashboard from './GscDashboard';
import TechnicalAudit from './TechnicalAudit';
import OnPageAudit from './OnPageAudit';
import SeoHealth from './SeoHealth';
import UrlComparator from './UrlComparator';
import InternalLinking from './InternalLinking';
import SerpAnalyzer from './SerpAnalyzer';
import FsStealer from './FsStealer';
import IndexationControl from './IndexationControl';
import Users from './Users';
import './index.css';

const NAV_ITEMS = [
  { name: 'GSC Dashboard',      icon: <Activity size={17} /> },
  { name: 'SEO Health',         icon: <BarChart2 size={17} /> },
  { name: 'Indexation Control', icon: <Globe size={17} /> },
  { name: 'Technical Auditor',  icon: <Settings size={17} /> },
  { name: 'On-Page Auditor',    icon: <Layers size={17} /> },
  { name: 'URL Comparator',     icon: <Link2 size={17} /> },
  { name: 'Internal Linking',   icon: <LayoutDashboard size={17} /> },
  { name: 'SERP Analyzer',      icon: <Search size={17} /> },
  { name: 'FS Stealer',         icon: <Target size={17} /> },
];

function renderPage(page, user) {
  switch (page) {
    case 'GSC Dashboard':      return <GscDashboard />;
    case 'SEO Health':         return <SeoHealth />;
    case 'Indexation Control': return <IndexationControl />;
    case 'Technical Auditor':  return <TechnicalAudit />;
    case 'On-Page Auditor':    return <OnPageAudit />;
    case 'URL Comparator':     return <UrlComparator />;
    case 'Internal Linking':   return <InternalLinking />;
    case 'SERP Analyzer':      return <SerpAnalyzer />;
    case 'FS Stealer':         return <FsStealer />;
    case 'Users':              return <Users currentUser={user} />;
    default:                   return null;
  }
}

function initials(user) {
  if (!user) return 'U';
  if (user.name) return user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return user.email[0].toUpperCase();
}

export default function App() {
  const [activePage, setActivePage] = useState('GSC Dashboard');
  const [user, setUser]             = useState(null);    // null = loading / not authed
  const [authReady, setAuthReady]   = useState(false);   // false while checking localStorage

  // Login form state
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const stored = localStorage.getItem('auth_user');
    if (token && stored) {
      try {
        const parsed = JSON.parse(stored);
        // Simple expiry check from JWT payload (exp is epoch seconds)
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUser(parsed);
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
        }
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setAuthReady(true);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginLoading(true); setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    setEmail(''); setPassword(''); setLoginError('');
    setActivePage('GSC Dashboard');
  }

  // While checking stored auth, show nothing (avoids flash)
  if (!authReady) return null;

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-gradient)',
      }}>
        <div className="glass-panel" style={{ width: 380, position: 'relative', overflow: 'hidden', padding: '36px 32px' }}>
          {/* Background glow */}
          <div style={{
            position: 'absolute', top: '-60%', left: '-50%', width: '200%', height: '200%',
            background: 'radial-gradient(circle at center, rgba(226,0,113,0.15) 0%, transparent 65%)',
            pointerEvents: 'none', zIndex: 0,
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <img src={moveupLogo} alt="Moveup Media"
                style={{ width: 72, height: 72, borderRadius: 14, marginBottom: 14, boxShadow: '0 0 24px rgba(226,0,113,0.4)' }} />
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>Moveup Media</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>SEO Intelligence Platform</div>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Email</label>
                <input
                  className="glass-input" type="email" required autoFocus
                  placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Password</label>
                <input
                  className="glass-input" type="password" required
                  placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>

              {loginError && (
                <div style={{
                  padding: '8px 12px', borderRadius: 6, fontSize: '0.82rem',
                  background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171',
                }}>
                  {loginError}
                </div>
              )}

              <button type="submit" className="btn-primary w-full" style={{ marginTop: 4, padding: '11px' }} disabled={loginLoading}>
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── App shell ─────────────────────────────────────────────────────────────
  const isSuperAdmin = user.role === 'super-admin';
  const visibleNav   = [...NAV_ITEMS, ...(isSuperAdmin ? [{ name: 'Users', icon: <UsersIcon size={17} /> }] : [])];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <div style={{ width: 30, height: 30, background: 'var(--primary)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={17} color="white" />
          </div>
          Moveup Media
        </div>

        <div className="nav-menu">
          {visibleNav.map(item => (
            <div
              key={item.name}
              className={`nav-item ${activePage === item.name ? 'active' : ''}`}
              onClick={() => setActivePage(item.name)}
            >
              {item.icon}
              {item.name}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div className="nav-item" onClick={handleLogout} style={{ color: 'var(--text-muted)' }}>
            <LogOut size={16} /> Logout
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        <div className="topbar">
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activePage}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#fff' }}>{user.name || user.email}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {user.role === 'super-admin' ? 'Super Admin' : 'Editor'}
              </div>
            </div>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(226,0,113,0.25)', border: '1px solid rgba(226,0,113,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.78rem', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {initials(user)}
            </div>
          </div>
        </div>

        <div className="page-content">
          {renderPage(activePage, user)}
        </div>
      </div>
    </div>
  );
}
