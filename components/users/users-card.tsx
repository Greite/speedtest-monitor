'use client';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type UserRow = {
  id: number;
  email: string;
  role: 'admin' | 'viewer';
  provider: 'local' | 'oidc';
  name: string | null;
  createdAt: number;
  lastLoginAt: number | null;
};

export function UsersCard() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/users');
    if (!res.ok) {
      setStatus(`Load failed: HTTP ${res.status}`);
      return;
    }
    const body = await res.json();
    setUsers(body.users);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (session?.user?.role !== 'admin') return null;

  async function setRole(id: number, role: 'admin' | 'viewer') {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(String(body.error ?? `HTTP ${res.status}`));
      return;
    }
    await refresh();
    setStatus('Role updated');
  }

  async function del(id: number) {
    if (!confirm('Delete this user?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      setStatus(String(body.error ?? `HTTP ${res.status}`));
      return;
    }
    await refresh();
  }

  async function add() {
    const email = window.prompt('Email?');
    if (!email) return;
    const password = window.prompt('Temporary password (min 10 chars)?');
    if (!password) return;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(String(body.error ?? `HTTP ${res.status}`));
      return;
    }
    await refresh();
  }

  async function resetPassword(id: number) {
    const newPassword = window.prompt('New password (min 10 chars)?');
    if (!newPassword) return;
    const res = await fetch(`/api/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus(String(body.error ?? `HTTP ${res.status}`));
      return;
    }
    setStatus('Password reset');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button onClick={add}>Add user</Button>
          <span className="text-xs">{status}</span>
        </div>
        <table className="text-sm w-full">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Provider</th>
              <th>Last login</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t">
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.id, e.target.value as 'admin' | 'viewer')}
                    className="border rounded px-1 py-0.5"
                  >
                    <option value="admin">admin</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
                <td>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{u.provider}</span>
                </td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('sv-SE') : '-'}</td>
                <td className="flex gap-2 justify-end py-1">
                  <Button variant="outline" size="sm" onClick={() => resetPassword(u.id)}>
                    Reset pw
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => del(u.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
