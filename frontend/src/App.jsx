import { useState } from 'react';
import { Activity, LayoutDashboard, Link2, Search, FileCode, Image as ImageIcon, Award, LogOut, Zap } from 'lucide-react';
import LogAnalyzer from './LogAnalyzer';
import GscDashboard from './GscDashboard';
import ScreamingFrog from './ScreamingFrog';
import UrlComparator from './UrlComparator';
import InternalLinking from './InternalLinking';
import SerpAnalyzer from './SerpAnalyzer';
import SchemaAudit from './SchemaAudit';
import CwvAnalysis from './CwvAnalysis';
import ImageAltAnalysis from './ImageAltAnalysis';
import EeatAnalysis from './EeatAnalysis';
import './index.css';

const navItems = [
  { name: 'GSC Dashboard',      icon: <Activity size={18} /> },
  { name: 'Log Analyzer',       icon: <DatabaseIcon size={18} /> },
  { name: 'Screaming Frog',     icon: <FrogIcon size={18} /> },
  { name: 'URL Comparator',     icon: <Link2 size={18} /> },
  { name: 'Internal Linking',   icon: <LayoutDashboard size={18} /> },
  { name: 'SERP Analyzer',      icon: <Search size={18} /> },
  { name: 'Schema Audit',       icon: <FileCode size={18} /> },
  { name: 'CWV Analysis',       icon: <Zap size={18} /> },
  { name: 'Image Alt Analysis', icon: <ImageIcon size={18} /> },
  { name: 'E-E-A-T Analysis',   icon: <Award size={18} /> },
];

function renderPage(page) {
  switch (page) {
    case 'GSC Dashboard':      return <GscDashboard />;
    case 'Log Analyzer':       return <LogAnalyzer />;
    case 'Screaming Frog':     return <ScreamingFrog />;
    case 'URL Comparator':     return <UrlComparator />;
    case 'Internal Linking':   return <InternalLinking />;
    case 'SERP Analyzer':      return <SerpAnalyzer />;
    case 'Schema Audit':       return <SchemaAudit />;
    case 'CWV Analysis':       return <CwvAnalysis />;
    case 'Image Alt Analysis': return <ImageAltAnalysis />;
    case 'E-E-A-T Analysis':   return <EeatAnalysis />;
    default:                   return null;
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
            <h2 style={{ fontFamily: "'Bai Jamjuree', sans-serif", letterSpacing: '-1px', marginBottom: 30, textShadow: '0 0 15px rgba(226, 0, 113, 0.8)' }}>
              SEO AI AGENT
            </h2>
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

function DatabaseIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function FrogIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
      <circle cx="9" cy="10" r="1" />
      <circle cx="15" cy="10" r="1" />
      <path d="M10 14a2 2 0 0 0 4 0" />
    </svg>
  );
}
