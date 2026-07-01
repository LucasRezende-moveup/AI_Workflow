import { useState } from 'react';
import { Activity, LayoutDashboard, Link2, Search, Layers, LogOut, Settings, Target } from 'lucide-react';
import moveupLogo from './assets/logo.png';
import GscDashboard from './GscDashboard';
import TechnicalAudit from './TechnicalAudit';
import OnPageAudit from './OnPageAudit';
import UrlComparator from './UrlComparator';
import InternalLinking from './InternalLinking';
import SerpAnalyzer from './SerpAnalyzer';
import FsStealer from './FsStealer';
import './index.css';

const navItems = [
  { name: 'GSC Dashboard',      icon: <Activity size={18} /> },
  { name: 'Technical Auditor',  icon: <Settings size={18} /> },
  { name: 'On-Page Auditor',    icon: <Layers size={18} /> },
  { name: 'URL Comparator',     icon: <Link2 size={18} /> },
  { name: 'Internal Linking',   icon: <LayoutDashboard size={18} /> },
  { name: 'SERP Analyzer',      icon: <Search size={18} /> },
  { name: 'FS Stealer',         icon: <Target size={18} /> },
];

function renderPage(page) {
  switch (page) {
    case 'GSC Dashboard':     return <GscDashboard />;
    case 'Technical Auditor': return <TechnicalAudit />;
    case 'On-Page Auditor':   return <OnPageAudit />;
    case 'URL Comparator':    return <UrlComparator />;
    case 'Internal Linking':  return <InternalLinking />;
    case 'SERP Analyzer':     return <SerpAnalyzer />;
    case 'FS Stealer':        return <FsStealer />;
    default:                  return null;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState('GSC Dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessKey, setAccessKey] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (accessKey === 'moveupmedia') {
      setIsAuthenticated(true);
    } else {
      alert('Invalid Access Key');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <div className="glass-panel" style={{ width: 400, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
            background: 'radial-gradient(circle at center, rgba(226, 0, 113, 0.2) 0%, transparent 65%)',
            pointerEvents: 'none', zIndex: 0
          }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <img src={moveupLogo} alt="Moveup Media" style={{ width: 80, height: 80, borderRadius: 16, marginBottom: 30, boxShadow: '0 0 24px rgba(226, 0, 113, 0.5)' }} />
            <form onSubmit={handleLogin}>
              <input
                type="password"
                className="glass-input mb-6"
                style={{ textAlign: 'center', fontSize: '1.1rem' }}
                placeholder="Enter Access Key"
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
              />
              <button type="submit" className="btn-primary w-full" style={{ fontSize: '1.2rem', padding: '16px' }}>
                Enter
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="white" />
          </div>
          Moveup Media
        </div>

        <div className="nav-menu">
          {navItems.map(item => (
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
          <div className="nav-item" onClick={() => setIsAuthenticated(false)}>
            <LogOut size={18} /> Logout
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="topbar">
          <h3 style={{ fontWeight: 600 }}>{activePage}</h3>
          <div className="flex items-center gap-4">
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              U
            </div>
          </div>
        </div>

        <div className="page-content">
          {renderPage(activePage)}
        </div>
      </div>
    </div>
  );
}

