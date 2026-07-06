const publicApiBase = () => (
  process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || '/shore-sentinel-api'
).replace(/\/$/, '');

const serverApiBase = () => {
  if (typeof window !== 'undefined') return publicApiBase();
  return (
    process.env.INTERNAL_API_URL
    || process.env.API_URL
    || publicApiBase()
    || 'http://api:4000'
  ).replace(/\/$/, '');
};

export async function fetchUsers() {
  const res = await fetch(`${serverApiBase()}/users`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function fetchRoles() {
  const res = await fetch(`${serverApiBase()}/users/roles`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}

export async function createUser(data) {
  const res = await fetch(`${serverApiBase()}/users`, {
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
  const res = await fetch(`${serverApiBase()}/users/${id}`, {
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
  const res = await fetch(`${serverApiBase()}/users/${id}/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Failed to reset password');
  return res.json();
}

export async function deleteUser(id) {
  const res = await fetch(`${serverApiBase()}/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Failed to delete user (${res.status})`);
  }
  return res.json();
}

export async function disableUser(id) {
  const res = await fetch(`${serverApiBase()}/users/${id}/disable`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to disable user');
  return res.json();
}

export async function enableUser(id) {
  const res = await fetch(`${serverApiBase()}/users/${id}/enable`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to enable user');
  return res.json();
}
