import { apiBase } from '@/lib/data';

export async function fetchUsers() {
  const res = await fetch(`${apiBase}/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function fetchRoles() {
  const res = await fetch(`${apiBase}/users/roles`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}

export async function createUser(data) {
  const res = await fetch(`${apiBase}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create user');
  }
  return res.json();
}

export async function updateUser(id, data) {
  const res = await fetch(`${apiBase}/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update user');
  }
  return res.json();
}

export async function resetPassword(id, password) {
  const res = await fetch(`${apiBase}/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reset password');
  }
  return res.json();
}

export async function deleteUser(id) {
  const res = await fetch(`${apiBase}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to delete user');
  }
  return res.json();
}

export async function undoDeleteUser(id, undoToken) {
  const res = await fetch(`${apiBase}/users/${id}/undo-delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ undo_token: undoToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to undo delete');
  }
  return res.json();
}

export async function disableUser(id) {
  const res = await fetch(`${apiBase}/users/${id}/disable`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to disable user');
  }
  return res.json();
}

export async function enableUser(id) {
  const res = await fetch(`${apiBase}/users/${id}/enable`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to enable user');
  }
  return res.json();
}
