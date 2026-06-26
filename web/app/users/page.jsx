'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  undoDeleteUser,
} from '@/lib/users-api';

const EMPTY_FORM = {
  email: '',
  display_name: '',
  password: '',
  roles: ['operator'],
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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
  const [deletedUser, setDeletedUser] = useState(null);
  const modalRef = useRef(null);
  const lastFocusedElement = useRef(null);

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

  useEffect(() => {
    if (!modal || !modalRef.current) return undefined;
    const dialog = modalRef.current;
    const firstFocusable = dialog.querySelector(FOCUSABLE_SELECTOR);
    (firstFocusable || dialog).focus();
    return undefined;
  }, [modal]);

  function rememberTrigger(event) {
    lastFocusedElement.current = event?.currentTarget || document.activeElement;
  }

  function restoreTriggerFocus() {
    const trigger = lastFocusedElement.current;
    if (trigger && typeof trigger.focus === 'function') {
      window.setTimeout(() => trigger.focus(), 0);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  }

  function openAdd(event) {
    rememberTrigger(event);
    setForm(EMPTY_FORM);
    setActiveUser(null);
    setModal('add');
  }

  function openEdit(user, event) {
    rememberTrigger(event);
    setForm({
      email: user.email || '',
      display_name: user.display_name || '',
      password: '',
      roles: user.roles || ['operator'],
    });
    setActiveUser(user);
    setModal('edit');
  }

  function openResetPassword(user, event) {
    rememberTrigger(event);
    setResetPw('');
    setActiveUser(user);
    setModal('reset-password');
  }

  function openDelete(user, event) {
    rememberTrigger(event);
    setActiveUser(user);
    setModal('delete');
  }

  function openPermissions(user, event) {
    rememberTrigger(event);
    setActiveUser(user);
    setModal('permissions');
  }

  function closeModal() {
    setModal(null);
    setActiveUser(null);
    setForm(EMPTY_FORM);
    setResetPw('');
    restoreTriggerFocus();
  }

  function handleModalKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab' || !modalRef.current) return;

    const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
    if (!focusable.length) {
      event.preventDefault();
      modalRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      const result = await deleteUser(activeUser.id);
      const undoToken = result?.undo_token;
      const affectedName = activeUser?.display_name || 'User';
      const affectedEmail = activeUser?.email || '';
      const affectedRoles = result?.affected?.roles || [];
      closeModal();
      if (undoToken) {
        showToast(`${affectedName} soft-deleted. Undo available for 24 hours.`);
      } else {
        showToast('User deleted');
      }
      setDeletedUser({ id: activeUser.id, name: affectedName, email: affectedEmail, roles: affectedRoles, undoToken });
      await load();
    } catch (e) {
      setError(e.message || 'Failed to delete user');
    } finally {
      setBusy(false);
    }
  }

  async function handleUndoDelete() {
    if (!deletedUser?.undoToken) return;
    setBusy(true);
    try {
      await undoDeleteUser(deletedUser.id, deletedUser.undoToken);
      showToast(`User ${deletedUser.name} restored`);
      setDeletedUser(null);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to undo delete');
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

  return (
    <div className="stack users-page">
      <section className="hero">
        <div>
          <p className="eye">User management</p>
          <h1>Users & access</h1>
          <p>Manage operator accounts, roles, and access permissions for this Shore Sentinel tenant.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={openAdd}>+ Add user</button>
        </div>
      </section>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast}</span>
          {deletedUser?.undoToken ? (
            <button className="btn ghost" onClick={handleUndoDelete} style={{ marginLeft: '0.5rem' }}>
              Undo delete
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="btn ghost" onClick={() => setError('')}>Dismiss</button>
        </div>
      ) : null}

      <section className="panel users-panel" aria-busy={loading}>
        <header>
          <h2>Tenant users</h2>
          <span className="user-count" role="status" aria-live="polite">{loading ? 'Loading…' : `${users.length} user${users.length !== 1 ? 's' : ''}`}</span>
        </header>

        {loading ? (
          <div className="loading-row" role="status" aria-live="polite">Loading users…</div>
        ) : users.length === 0 ? (
          <div className="empty" data-testid="users-empty-state">
            <h3>No operator accounts yet</h3>
            <p>Shore Sentinel is ready for your team. Create the first operator account so colleagues can sign in, view scan evidence, and work remediation tasks.</p>
            <button className="btn" onClick={openAdd}>+ Add user</button>
          </div>
        ) : (
          <table className="users-table">
            <thead className="visually-hidden">
              <tr>
                <th>User</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Created</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={user.disabled_at ? 'row-disabled' : ''}>
                  <td data-label="User">
                    <div className="user-cell">
                      <span className="avatar" aria-hidden="true">{getInitials(user.display_name)}</span>
                      <div>
                        <b>{user.display_name}</b>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Roles">
                    <div className="role-pills">
                      {(user.roles || []).filter(Boolean).map((role) => (
                        <span key={role} className={`pill ${roleColor(role)}`}>{role}</span>
                      ))}
                    </div>
                  </td>
                  <td data-label="Status">
                    {user.disabled_at ? (
                      <span className="pill red">Disabled</span>
                    ) : (
                      <span className="pill green">Active</span>
                    )}
                  </td>
                  <td data-label="Created">
                    <small>{formatDate(user.created_at)}</small>
                  </td>
                  <td className="actions-col" data-label="Actions">
                    <div className="row-actions">
                      <button className="btn ghost" title="Edit" onClick={(event) => openEdit(user, event)}>Edit</button>
                      <button className="btn ghost" title="Reset password" onClick={(event) => openResetPassword(user, event)}>Reset password</button>
                      <button className="btn ghost" title="Roles" onClick={(event) => openPermissions(user, event)}>Roles</button>
                      {user.disabled_at ? (
                        <button className="btn ghost" title="Enable" onClick={() => handleToggleStatus(user)}>Enable</button>
                      ) : (
                        <button className="btn ghost" title="Disable" onClick={() => handleToggleStatus(user)}>Disable</button>
                      )}
                      <button className="btn ghost danger" title="Delete" onClick={(event) => openDelete(user, event)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modal === 'add' || modal === 'edit' ? (
        <div className="modal-overlay" role="presentation">
          <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="edit-user-title" aria-describedby="edit-user-desc" tabIndex={-1} onKeyDown={handleModalKeyDown}>
            <header>
              <h2 id="edit-user-title">{modal === 'add' ? 'Add user' : 'Edit user'}</h2>
              <button className="btn ghost" onClick={closeModal}>Close</button>
            </header>
            <p id="edit-user-desc" className="modal-desc">Create or update an operator account and assign the roles this user needs.</p>
            <form onSubmit={handleSubmit} aria-busy={busy}>
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

      {modal === 'reset-password' ? (
        <div className="modal-overlay" role="presentation">
          <div className="modal modal-sm" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="reset-password-title" aria-describedby="reset-password-desc" tabIndex={-1} onKeyDown={handleModalKeyDown}>
            <header>
              <h2 id="reset-password-title">Reset password</h2>
              <button className="btn ghost" onClick={closeModal}>Close</button>
            </header>
            <form onSubmit={handleResetPassword} aria-busy={busy}>
              <p id="reset-password-desc" className="modal-desc">
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

      {modal === 'delete' ? (
        <div className="modal-overlay" role="presentation">
          <div className="modal modal-sm" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-desc" tabIndex={-1} onKeyDown={handleModalKeyDown}>
            <header>
              <h2 id="delete-user-title">Delete user</h2>
              <button className="btn ghost" onClick={closeModal}>Close</button>
            </header>
            <form onSubmit={handleDelete} aria-busy={busy}>
              <p id="delete-user-desc" className="modal-desc">
                Delete <strong>{activeUser?.display_name}</strong> ({activeUser?.email})?
                The account will be soft-deleted so it can be restored within 24 hours.
              </p>
              <div className="affected-resources" role="status" aria-live="polite">
                <p className="affected-title">Affected resource details:</p>
                <ul className="affected-list">
                  <li>User: <strong>{activeUser?.display_name}</strong> ({activeUser?.email})</li>
                  <li>Roles: <strong>{(activeUser?.roles || []).filter(Boolean).join(', ') || 'none'}</strong></li>
                  <li>After 24 hours: user data is permanently purged and cannot be restored.</li>
                </ul>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn alt" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn danger" disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modal === 'permissions' ? (
        <div className="modal-overlay" role="presentation">
          <div className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="permissions-title" aria-describedby="permissions-desc" tabIndex={-1} onKeyDown={handleModalKeyDown}>
            <header>
              <h2 id="permissions-title">Permissions</h2>
              <button className="btn ghost" onClick={closeModal}>Close</button>
            </header>
            <p id="permissions-desc" className="modal-desc">
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
              <button className="btn" onClick={(event) => { rememberTrigger(event); closeModal(); openEdit(activeUser, event); }}>Edit roles</button>
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
