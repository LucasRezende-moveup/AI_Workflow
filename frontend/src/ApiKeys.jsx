import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';

// API key management. Super-admin only, and mounted inside the Users page because that is
// where access is already administered.
//
// The full key is returned exactly once, by the create call. It is stored as a SHA-256 hash,
// so it cannot be shown again — the UI has to make that unmissable before the panel closes.

const API = (path, opts = {}) => {
  const token = localStorage.getItem('auth_token');
  return fetch(path, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
};

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState('');
  const [scope, setScope] = useState([]);        // empty = every project
  const [minted, setMinted] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [kr, pr] = await Promise.all([API('/api/api-keys'), API('/api/tracking/projects')]);
      if (kr.ok) setKeys((await kr.json()).keys || []);
      if (pr.ok) setProjects((await pr.json()).projects || []);
    } catch { setError('Could not load keys.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError(''); setMinted(null);
    try {
      const res = await API('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), project_ids: scope.length ? scope : null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Failed');
      setMinted(d); setName(''); setScope([]); load();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  const revoke = async (id) => {
    setBusy(true); setError('');
    try {
      const res = await API(`/api/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed');
      setConfirmId(null); load();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(minted.key)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); })
      .catch(() => {});
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={18} color="var(--primary)" /> API Keys
        </h3>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Read-only access to the rank-tracking data at <code>/api/v1</code>, for people and systems
          outside this console. A key is its own identity — it carries only the scope set here, never a user's session.
        </div>
      </div>

      {/* The one and only sight of the key */}
      {minted && (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(226,0,113,0.07)',
          border: '1px solid rgba(226,0,113,0.35)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 9 }}>
            <AlertTriangle size={16} color="var(--primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: '0.84rem', color: 'var(--text-strong)' }}>
              <strong>Copy this now.</strong> {minted.warning}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 380px', padding: '9px 11px', borderRadius: 7, fontSize: '0.78rem',
              background: 'rgb(var(--ink) / 0.06)', border: '1px solid rgb(var(--ink) / 0.12)',
              color: 'var(--text-strong)', wordBreak: 'break-all', userSelect: 'all' }}>{minted.key}</code>
            <button type="button" onClick={copyKey} className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: '0.8rem' }}>
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button type="button" onClick={() => setMinted(null)} className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.8rem' }}>Done</button>
          </div>
        </div>
      )}

      {/* Mint */}
      <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="metric-label mb-2 block" htmlFor="ak-name">Key name</label>
          <input id="ak-name" className="glass-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Looker Studio, partner-agency" style={{ width: '100%' }} />
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label className="metric-label mb-2 block" htmlFor="ak-scope">Projects it can read</label>
          <select id="ak-scope" className="glass-input glass-select" multiple value={scope}
            onChange={(e) => setScope([...e.target.selectedOptions].map((o) => o.value))}
            style={{ width: '100%', minHeight: 72 }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.domain}</option>)}
          </select>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 3 }}>
            Select none for every project. Narrow scope is the safer default for anyone outside the team.
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !name.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px', fontSize: '0.84rem' }}>
          <Plus size={14} aria-hidden="true" /> Create key
        </button>
      </form>

      {error && (
        <div role="alert" style={{ padding: '9px 13px', borderRadius: 8, fontSize: '0.8rem',
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#dc2626' }}>{error}</div>
      )}

      {/* Existing keys */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Prefix</th><th>Scope</th><th>Created by</th>
              <th>Last used</th><th style={{ textAlign: 'right' }}>Requests</th><th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={k.revoked ? { opacity: 0.45 } : undefined}>
                <td style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {k.name}{k.revoked && <span style={{ fontSize: '0.68rem', color: '#dc2626', marginLeft: 7 }}>revoked</span>}
                </td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  mu_live_{k.prefix}…
                </td>
                <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {k.project_ids?.length ? `${k.project_ids.length} project(s)` : 'all projects'}
                </td>
                <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{k.created_by || '—'}</td>
                <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{when(k.last_used_at)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(k.request_count ?? 0).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  {!k.revoked && (confirmId === k.id ? (
                    <button onClick={() => revoke(k.id)} disabled={busy}
                      style={{ background: 'var(--danger)', color: 'var(--on-primary)', border: 'none',
                        borderRadius: 6, padding: '4px 9px', fontSize: '0.72rem', cursor: 'pointer' }}>
                      Confirm revoke
                    </button>
                  ) : (
                    <button onClick={() => setConfirmId(k.id)} aria-label={`Revoke ${k.name}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ))}
                </td>
              </tr>
            ))}
            {!keys.length && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                No keys yet. Create one to give an outside system read access.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Revoking takes effect on the next request. Keys are never deleted, so the record of what
        existed and how much it was used survives. Point integrations at{' '}
        <code>{typeof window !== 'undefined' ? window.location.origin : ''}/api/v1</code> — that endpoint
        lists the rest and needs no key, so it is the easiest way to check one works.
      </div>
    </div>
  );
}
