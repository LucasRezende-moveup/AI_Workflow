import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Edit2, Check, X, Shield, User, AlertCircle, RefreshCw, KeyRound } from 'lucide-react';

// ── Self-service password change (shown to editors; also usable by anyone) ──────
function PasswordForm() {
  const [cur, setCur]         = useState('');
  const [nw, setNw]           = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null); // { type: 'ok'|'err', text }

  const token = localStorage.getItem('auth_token');

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (nw.length < 8)   return setMsg({ type: 'err', text: 'New password must be at least 8 characters.' });
    if (nw !== confirm)  return setMsg({ type: 'err', text: 'New password and confirmation do not match.' });
    setLoading(true);
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: cur, new_password: nw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Could not update password');
      setMsg({ type: 'ok', text: 'Password updated successfully.' });
      setCur(''); setNw(''); setConfirm('');
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  const field = { marginBottom: 12 };
  const label = { fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 };

  return (
    <form className="glass-panel" style={{ padding: '18px 20px', maxWidth: 460 }} onSubmit={submit}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>Change Password</h3>

      <div style={field}>
        <label style={label}>Current password *</label>
        <input className="glass-input" type="password" required autoComplete="current-password"
          value={cur} onChange={e => setCur(e.target.value)} placeholder="Your current password" />
      </div>
      <div style={field}>
        <label style={label}>New password *</label>
        <input className="glass-input" type="password" required autoComplete="new-password"
          value={nw} onChange={e => setNw(e.target.value)} placeholder="At least 8 characters" />
      </div>
      <div style={field}>
        <label style={label}>Confirm new password *</label>
        <input className="glass-input" type="password" required autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter new password" />
      </div>

      {msg && (
        <div role="alert" style={{
          padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 12,
          background: msg.type === 'ok' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
          color: msg.type === 'ok' ? '#4ade80' : '#f87171',
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </div>
    </form>
  );
}

// Editor standalone page: the form plus a page header
function ChangePasswordPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 460 }}>
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <KeyRound size={18} color="var(--primary)" /> My Account
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Change your password. You'll keep using the same email to sign in.
        </p>
      </div>
      <PasswordForm />
    </div>
  );
}

const ROLE_LABELS = { 'super-admin': 'Super Admin', editor: 'Editor' };
const ROLE_COLORS = { 'super-admin': '#E20071', editor: '#60a5fa' };

function RoleBadge({ role }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
      background: role === 'super-admin' ? 'rgba(226,0,113,0.15)' : 'rgba(96,165,250,0.15)',
      color: ROLE_COLORS[role] || 'var(--text-muted)',
      border: `1px solid ${role === 'super-admin' ? 'rgba(226,0,113,0.3)' : 'rgba(96,165,250,0.3)'}`,
    }}>
      {role === 'super-admin' ? <Shield size={10} /> : <User size={10} />}
      {ROLE_LABELS[role] || role}
    </span>
  );
}

export default function Users({ currentUser }) {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [mgmtStatus, setMgmtStatus] = useState(null);

  // Add user form
  const [showAdd, setShowAdd]       = useState(false);
  const [addForm, setAddForm]       = useState({ email: '', name: '', password: '', role: 'editor' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError]     = useState('');

  // Edit state
  const [editId, setEditId]         = useState(null);
  const [editForm, setEditForm]     = useState({ name: '', role: '', password: '' });
  const [editLoading, setEditLoading] = useState(false);

  // Delete state
  const [deleteId, setDeleteId]     = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Super-admin's own password panel
  const [showPw, setShowPw]         = useState(false);

  const isAdmin = currentUser?.role === 'super-admin';
  const token = localStorage.getItem('auth_token');
  const authHeader = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  async function fetchUsers() {
    setLoading(true); setError('');
    try {
      const [uRes, sRes] = await Promise.all([
        fetch('/api/users', { headers: authHeader }),
        fetch('/api/users/management-status', { headers: authHeader }),
      ]);
      if (!uRes.ok) throw new Error((await uRes.json()).detail || 'Failed to load users');
      setUsers(await uRes.json());
      if (sRes.ok) setMgmtStatus(await sRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isAdmin) fetchUsers(); }, [isAdmin]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!addForm.email || !addForm.password) return;
    setAddLoading(true); setAddError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: authHeader,
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create user');
      setAddForm({ email: '', name: '', password: '', role: 'editor' });
      setShowAdd(false);
      await fetchUsers();
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleEdit(userId) {
    setEditLoading(true);
    try {
      const body = {};
      if (editForm.name)     body.name     = editForm.name;
      if (editForm.role)     body.role     = editForm.role;
      if (editForm.password) body.password = editForm.password;
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT', headers: authHeader,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update');
      setEditId(null);
      await fetchUsers();
    } catch (e) {
      alert(e.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(userId) {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE', headers: authHeader,
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete');
      setDeleteId(null);
      await fetchUsers();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setEditForm({ name: user.name, role: user.role, password: '' });
  }

  // Editors (non-admins) only get the self-service password panel — no user list.
  if (!isAdmin) return <ChangePasswordPanel />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 2 }}>User Management</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Manage who has access and their permission level.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={fetchUsers} disabled={loading} aria-label="Refresh users">
            <RefreshCw size={14} aria-hidden="true" />
          </button>
          <button className="btn-secondary" onClick={() => setShowPw(v => !v)}>
            <KeyRound size={14} aria-hidden="true" /> My Password
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(v => !v)}>
            <UserPlus size={15} /> Add User
          </button>
        </div>
      </div>

      {/* Super-admin's own password change */}
      {showPw && <PasswordForm />}

      {/* Persistence warning */}
      {mgmtStatus && !mgmtStatus.vercel_token_configured && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 16px', borderRadius: 8,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          color: '#fbbf24', fontSize: '0.82rem', lineHeight: 1.5,
        }}>
          <AlertCircle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            <strong>Changes are temporary</strong> — set the <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3 }}>VERCEL_TOKEN</code> environment variable to persist user changes across deployments.
          </span>
        </div>
      )}

      {/* Add user form */}
      {showAdd && (
        <div className="glass-panel" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>New User</h3>
          <form onSubmit={handleAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Email *</label>
                <input
                  className="glass-input" type="email" required autoComplete="email"
                  placeholder="user@example.com"
                  value={addForm.email}
                  onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Name</label>
                <input
                  className="glass-input" type="text"
                  placeholder="Full name"
                  value={addForm.name}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Password *</label>
                <input
                  className="glass-input" type="password" required autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  value={addForm.password}
                  onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Role</label>
                <select
                  className="glass-input glass-select"
                  value={addForm.role}
                  onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="editor">Editor</option>
                  <option value="super-admin">Super Admin</option>
                </select>
              </div>
            </div>
            {addError && (
              <div role="alert" style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: '0.8rem', marginBottom: 12 }}>
                {addError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => { setShowAdd(false); setAddError(''); }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={addLoading}>
                {addLoading ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loader" style={{ margin: '0 auto 12px' }} />
            Loading users…
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: '#f87171', fontSize: '0.875rem' }}>{error}</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ padding: '14px 20px' }}>User</th>
                <th style={{ padding: '14px 20px' }}>Role</th>
                <th style={{ padding: '14px 20px' }}>Member since</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  {editId === user.id ? (
                    /* ── Edit row ── */
                    <>
                      <td style={{ padding: '10px 20px' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{user.email}</div>
                        <input
                          className="glass-input" type="text"
                          style={{ marginTop: 6, padding: '6px 10px', fontSize: '0.82rem' }}
                          placeholder="Display name"
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        />
                      </td>
                      <td style={{ padding: '10px 20px' }}>
                        <select
                          className="glass-input glass-select"
                          style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                          value={editForm.role}
                          onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                        >
                          <option value="editor">Editor</option>
                          <option value="super-admin">Super Admin</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 20px' }}>
                        <input
                          className="glass-input" type="password" autoComplete="new-password"
                          style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                          placeholder="New password (leave blank to keep)"
                          value={editForm.password}
                          onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                        />
                      </td>
                      <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn-primary" style={{ padding: '5px 12px' }}
                            onClick={() => handleEdit(user.id)} disabled={editLoading}
                          >
                            <Check size={13} /> Save
                          </button>
                          <button className="btn-secondary" style={{ padding: '5px 10px' }} onClick={() => setEditId(null)} aria-label="Cancel edit">
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : deleteId === user.id ? (
                    /* ── Confirm delete row ── */
                    <>
                      <td colSpan={3} style={{ padding: '14px 20px', color: '#f87171', fontSize: '0.875rem' }}>
                        Delete <strong>{user.name || user.email}</strong>? This cannot be undone.
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            className="btn-danger" style={{ padding: '5px 12px' }}
                            onClick={() => handleDelete(user.id)} disabled={deleteLoading}
                          >
                            <Trash2 size={13} /> {deleteLoading ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button className="btn-secondary" style={{ padding: '5px 10px' }} onClick={() => setDeleteId(null)} aria-label="Cancel">
                            <X size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    /* ── Normal row ── */
                    <>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user.name || '—'}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <RoleBadge role={user.role} />
                      </td>
                      <td style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        {user.id !== currentUser?.sub && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              className="btn-secondary" style={{ padding: '5px 10px' }}
                              onClick={() => startEdit(user)} aria-label="Edit user"
                            >
                              <Edit2 size={13} aria-hidden="true" />
                            </button>
                            <button
                              className="btn-danger" style={{ padding: '5px 10px' }}
                              onClick={() => setDeleteId(user.id)} aria-label="Delete user"
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        {user.id === currentUser?.sub && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>You</span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
