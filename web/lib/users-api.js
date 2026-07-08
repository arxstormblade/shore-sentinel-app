import { appPath } from '@/lib/paths';

const apiBase = () => appPath('/api');

async function parseError(res, fallback) {
  const err = await res.json().catch(() => ({}));
  return new Error(err.message || fallback);
}

export async function fetchUsers() {
  const res = await fetch(`${apiBase()}/users`, { cache: 'no-store' });
  if (!res.ok) throw await parseError(res, 'Failed to fetch users');
  return res.json();
}

export async function fetchRoles() {
  const res = await fetch(`${apiBase()}/users/roles`, { cache: 'no-store' });
  if (!res.ok) throw await parseError(res, 'Failed to fetch roles');
  return res.json();
}

export async function createUser(data) {
  const res = await fetch(`${apiBase()}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await parseError(res, 'Failed to create user');
  return res.json();
}

export async function updateUser(id, data) {
  const res = await fetch(`${apiBase()}/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await parseError(res, 'Failed to update user');
  return res.json();
}

export async function resetPassword(id, password) {
  const res = await fetch(`${apiBase()}/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await parseError(res, 'Failed to reset password');
  return res.json();
}

export async function deleteUser(id) {
  const res = await fetch(`${apiBase()}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) throw await parseError(res, `Failed to delete user (${res.status})`);
  return res.json();
}

export async function disableUser(id) {
  const res = await fetch(`${apiBase()}/users/${id}/disable`, { method: 'POST' });
  if (!res.ok) throw await parseError(res, 'Failed to disable user');
  return res.json();
}

export async function enableUser(id) {
  const res = await fetch(`${apiBase()}/users/${id}/enable`, { method: 'POST' });
  if (!res.ok) throw await parseError(res, 'Failed to enable user');
  return res.json();
}
