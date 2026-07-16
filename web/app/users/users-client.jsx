'use client';

import { useEffect, useState, useCallback } from 'react';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import {
  fetchUsers,
  fetchRoles,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
  disableUser,
  enableUser,
} from '@/lib/users-api';

const EMPTY_FORM = {
  email: '',
  display_name: '',
  password: '',
  roles: ['operator'],
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'reset-password' | 'delete' | 'permissions'
  const [activeUser, setActiveUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resetPw, setResetPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [u, r] = await Promise.all([fetchUsers(), fetchRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setActiveUser(null);
    setModal('add');
  }

  function openEdit(user) {
    setForm({
      email: user.email || '',
      display_name: user.display_name || '',
      password: '',
      roles: user.roles || ['operator'],
    });
    setActiveUser(user);
    setModal('edit');
  }

  function openResetPassword(user) {
    setResetPw('');
    setActiveUser(user);
    setModal('reset-password');
  }

  function openDelete(user) {
    setActiveUser(user);
    setModal('delete');
  }

  function openPermissions(user) {
    setActiveUser(user);
    setModal('permissions');
  }

  function closeModal() {
    setModal(null);
    setActiveUser(null);
    setForm(EMPTY_FORM);
    setResetPw('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (modal === 'add') {
        await createUser(form);
        showToast('User created successfully');
      } else if (modal === 'edit') {
        const payload = { email: form.email, display_name: form.display_name, roles: form.roles };
        if (form.password) payload.password = form.password;
        await updateUser(activeUser.id, payload);
        showToast('User updated successfully');
      }
      closeModal();
      await load();
    } catch (e) {
      setError(e.message || 'Operation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await resetPassword(activeUser.id, resetPw);
      showToast('Password reset successfully');
      closeModal();
    } catch (e) {
      setError(e.message || 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteUser(activeUser.id);
      showToast('User deleted');
      closeModal();
      await load();
    } catch (e) {
      setError(e.message || 'Failed to delete user');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(user) {
    try {
      if (user.disabled_at) {
        await enableUser(user.id);
        showToast('User enabled');
      } else {
        await disableUser(user.id);
        showToast('User disabled');
      }
      await load();
    } catch (e) {
      setError(e.message || 'Operation failed');
    }
  }

  function handleRoleToggle(roleName) {
    setForm((prev) => {
      const roles = prev.roles.includes(roleName)
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName];
      return { ...prev, roles: roles.length ? roles : ['operator'] };
    });
  }

  function roleColor(role) {
    const map = { admin: 'red', operator: 'blue', analyst: 'amber', viewer: 'gray' };
    return map[role] || 'gray';
  }

  const activeUsers = users.filter((user) => !user.disabled_at).length;
  const disabledUsers = users.length - activeUsers;

  return (
    <div className="operations-page users-page">
      <CompactPageHeader eyebrow="Access administration" title="Users and access" description="Manage tenant accounts, roles, passwords, and account status without losing the operational context." status={<Pill>{users.length} user{users.length === 1 ? '' : 's'}</Pill>} actions={<button className="btn" onClick={openAdd}>Add user</button>} />
      <OperationsSummaryStrip items={[{ label: 'Users', value: users.length }, { label: 'Active', value: activeUsers }, { label: 'Disabled', value: disabledUsers }, { label: 'Roles available', value: roles.length }]} />

      {toast ? <div className="toast">{toast}</div> : null}
      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn ghost" onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <OperationalSection eyebrow="Directory" title="Tenant users" status={<Pill>{loading ? 'Loading' : `${users.length} listed`}</Pill>}>
        {loading ? (
          <p className="compact-empty-note">Loading users…</p>
        ) : users.length === 0 ? (
          <ComposedEmptyState title="No tenant users found" description="Add the first operator account to begin managing access." actions={<button className="btn" onClick={openAdd}>Add user</button>} />
        ) : (
          <OperationsLedger label="Tenant users">
            {users.map((user) => (
              <OperationsLedgerRow key={user.id}>
                <div className="operations-row-copy">
                  <b>{user.display_name || user.email}</b>
                  <span>{user.email} · Created {formatDate(user.created_at)}</span>
                  <div className="role-pills">{(user.roles || []).filter(Boolean).map((role) => <Pill key={role} tone={roleColor(role)}>{role}</Pill>)}</div>
                </div>
                <div className="operations-row-actions">
                  <Pill tone={user.disabled_at ? 'red' : 'green'}>{user.disabled_at ? 'Disabled' : 'Active'}</Pill>
                  <button className="btn ghost" onClick={() => openEdit(user)}>Edit</button>
                  <button className="btn ghost" onClick={() => openResetPassword(user)}>Reset password</button>
                  <button className="btn ghost" onClick={() => openPermissions(user)}>Permissions</button>
                  <button className="btn ghost" onClick={() => handleToggleStatus(user)}>{user.disabled_at ? 'Enable' : 'Disable'}</button>
                  <button className="btn ghost danger" onClick={() => openDelete(user)}>Delete</button>
                </div>
              </OperationsLedgerRow>
            ))}
          </OperationsLedger>
        )}
      </OperationalSection>

      {/* ── Modals ── */}

      {/* Add / Edit modal */}
      {modal === 'add' || modal === 'edit' ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{modal === 'add' ? 'Add user' : 'Edit user'}</h2>
              <button className="btn ghost" onClick={closeModal}>✕</button>
            </header>
            <form onSubmit={handleSubmit}>
              <label>
                Display name
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                  placeholder="Jane Doe"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="jane@shore360.local"
                />
              </label>
              <label>
                {modal === 'edit' ? 'Password (leave blank to keep current)' : 'Password'}
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={modal === 'add'}
                  placeholder={modal === 'edit' ? '••••••••' : 'Minimum 8 characters'}
                  minLength={8}
                />
              </label>
              <fieldset className="roles-fieldset">
                <legend>Roles</legend>
                <div className="roles-checkboxes">
                  {roles.map((role) => (
                    <label key={role.name} className="role-checkbox">
                      <input
                        type="checkbox"
                        checked={form.roles.includes(role.name)}
                        onChange={() => handleRoleToggle(role.name)}
                      />
                      <span className={`pill ${roleColor(role.name)}`}>{role.name}</span>
                      <small>{role.description}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="modal-actions">
                <button type="button" className="btn alt" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Saving…' : modal === 'add' ? 'Create user' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Reset password modal */}
      {modal === 'reset-password' ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Reset password</h2>
              <button className="btn ghost" onClick={closeModal}>✕</button>
            </header>
            <form onSubmit={handleResetPassword}>
              <p className="modal-desc">
                Set a new password for <strong>{activeUser?.display_name}</strong> ({activeUser?.email}).
              </p>
              <label>
                New password
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  autoFocus
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn alt" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn" disabled={busy}>
                  {busy ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation modal */}
      {modal === 'delete' ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Delete user</h2>
              <button className="btn ghost" onClick={closeModal}>✕</button>
            </header>
            <p className="modal-desc">
              Are you sure you want to delete <strong>{activeUser?.display_name}</strong> ({activeUser?.email})?
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn alt" onClick={closeModal}>Cancel</button>
              <button className="btn danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Permissions modal */}
      {modal === 'permissions' ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Permissions</h2>
              <button className="btn ghost" onClick={closeModal}>✕</button>
            </header>
            <p className="modal-desc">
              Current role assignments for <strong>{activeUser?.display_name}</strong>.
            </p>
            <div className="permissions-list">
              {roles.map((role) => {
                const assigned = (activeUser?.roles || []).includes(role.name);
                return (
                  <div key={role.name} className={`perm-row ${assigned ? 'assigned' : ''}`}>
                    <div>
                      <span className={`pill ${roleColor(role.name)}`}>{role.name}</span>
                      <small>{role.description}</small>
                    </div>
                    <span className={`perm-badge ${assigned ? 'on' : 'off'}`}>
                      {assigned ? 'Assigned' : 'Not assigned'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn alt" onClick={closeModal}>Close</button>
              <button className="btn" onClick={() => { closeModal(); openEdit(activeUser); }}>Edit roles</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}
