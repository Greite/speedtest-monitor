'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
import {
  pixel,
  proportional,
  Table,
  type TableColumn,
  type TableSortState,
  useTableSortable,
} from '@astryxdesign/core/Table';
import { Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { Token } from '@astryxdesign/core/Token';
import { KeyRound, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddUserDialog } from './add-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

import { parseApiError } from '@/lib/api-client';
import { authClient } from '@/lib/auth/client';
import { formatDateTime } from '@/lib/format';
import { togglePillClasses } from '@/lib/utils';

type UserRow = {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  provider: 'local' | 'oidc';
  name: string | null;
  createdAt: number;
  lastLoginAt: number | null;
};

type RoleFilter = 'all' | 'admin' | 'viewer';
type ProviderFilter = 'all' | 'local' | 'oidc';
type SortKey = 'email' | 'role' | 'provider' | 'lastLoginAt';

const ROLE_SELECT_OPTIONS = [
  { value: 'admin', label: 'admin' },
  { value: 'viewer', label: 'viewer' },
];

// Client-side sort replacing the removed TanStack getSortedRowModel: the Astryx
// sort plugin is headless (it only owns header affordances/aria-sort), so this
// component sorts the already-fetched `users` array itself. Only a single active
// sort entry is supported (matches isMultiSortEnabled's default of false - the
// original file never exposed a shift-click multi-sort UI). `lastLoginAt` keeps
// nulls last regardless of direction, mirroring the old column's
// `sortUndefined: 'last'`.
function sortUsers(users: UserRow[], sort: TableSortState<SortKey>): UserRow[] {
  const entry = sort[0];
  if (!entry) {
    return users;
  }
  const dir = entry.direction === 'ascending' ? 1 : -1;
  const { sortKey } = entry;
  return [...users].sort((a, b) => {
    if (sortKey === 'lastLoginAt') {
      // Nulls sort last in both ascending and descending directions - deliberate
      // change from the old TanStack config, which coalesced null lastLoginAt to
      // epoch 0 and therefore listed never-logged-in users first when ascending.
      if (a.lastLoginAt == null && b.lastLoginAt == null) {
        return 0;
      }
      if (a.lastLoginAt == null) {
        return 1;
      }
      if (b.lastLoginAt == null) {
        return -1;
      }
      return dir * (a.lastLoginAt - b.lastLoginAt);
    }
    return dir * a[sortKey].localeCompare(b[sortKey]);
  });
}

export function UsersCard() {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const [users, setUsers] = useState<UserRow[] | null>(null);

  const [emailQuery, setEmailQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [sort, setSort] = useState<TableSortState<SortKey>>([{ sortKey: 'email', direction: 'ascending' }]);

  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/users');
    if (!res.ok) {
      const err = await parseApiError(res);
      toast({ body: `Load failed: ${err.message}`, type: 'error' });
      return;
    }
    const body = await res.json();
    setUsers(body.users);
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setRole = useCallback(
    async (id: string, role: 'admin' | 'viewer') => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        toast({ body: err.message, type: 'error' });
        return;
      }
      await refresh();
      toast({ body: 'Role updated' });
    },
    [refresh, toast],
  );

  const onAdded = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const onDeleted = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const columns = useMemo<TableColumn<UserRow>[]>(
    () => [
      {
        key: 'email',
        header: 'Email',
        width: proportional(2),
        sortable: { sortKey: 'email' },
        renderCell: (u) => <span className="font-medium">{u.email}</span>,
      },
      {
        key: 'role',
        header: 'Role',
        width: pixel(110),
        sortable: { sortKey: 'role' },
        renderCell: (u) => (
          <Selector
            label={`Role for ${u.email}`}
            isLabelHidden
            size="sm"
            options={ROLE_SELECT_OPTIONS}
            value={u.role}
            onChange={(v) => setRole(u.id, v as 'admin' | 'viewer')}
          />
        ),
      },
      {
        key: 'provider',
        header: 'Provider',
        width: pixel(96),
        sortable: { sortKey: 'provider' },
        renderCell: (u) => <Token label={u.provider.toUpperCase()} size="sm" />,
      },
      {
        key: 'lastLoginAt',
        header: 'Last login',
        width: proportional(1),
        sortable: { sortKey: 'lastLoginAt' },
        renderCell: (u) => (
          <span className="text-xs text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '-'}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: pixel(112),
        resizable: false,
        renderCell: (u) => (
          <div className="flex items-center justify-end gap-2">
            <IconButton
              icon={<KeyRound aria-hidden className="size-4" />}
              label={`Reset password for ${u.email}`}
              variant="secondary"
              size="sm"
              className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
              onClick={() => setResetTarget({ id: u.id, email: u.email })}
            />
            <IconButton
              icon={<Trash2 aria-hidden className="size-4" />}
              label={`Delete ${u.email}`}
              variant="destructive"
              size="sm"
              className="min-h-11 min-w-11 md:min-h-7 md:min-w-7"
              onClick={() => setDeleteTarget({ id: u.id, email: u.email })}
            />
          </div>
        ),
      },
    ],
    [setRole],
  );

  const sortable = useTableSortable<UserRow, SortKey>({
    sort,
    onSortChange: setSort,
    allowUnsortedState: true,
  });

  const filteredUsers = useMemo(() => {
    if (!users) {
      return [];
    }
    const email = emailQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (email && !u.email.toLowerCase().includes(email)) {
        return false;
      }
      if (roleFilter !== 'all' && u.role !== roleFilter) {
        return false;
      }
      if (providerFilter !== 'all' && u.provider !== providerFilter) {
        return false;
      }
      return true;
    });
  }, [users, emailQuery, roleFilter, providerFilter]);

  const sortedUsers = useMemo(() => sortUsers(filteredUsers, sort), [filteredUsers, sort]);

  if ((session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role !== 'admin') {
    return null;
  }

  const hasActiveFilter = emailQuery.trim() !== '' || roleFilter !== 'all' || providerFilter !== 'all';

  return (
    <Card padding={0} className="flex flex-col gap-6 overflow-hidden py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Users
        </Heading>
      </div>
      <div className="flex flex-col gap-4 px-6">
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Search email"
            value={emailQuery}
            onChange={setEmailQuery}
            placeholder="jane@example.com"
            size="sm"
            width={224}
            startIcon={Search}
            hasClear
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground" aria-hidden>
              Role
            </span>
            <div className={togglePillClasses}>
              <ToggleButtonGroup
                label="Filter by role"
                type="single"
                size="sm"
                value={roleFilter}
                onChange={(v) => setRoleFilter((v ?? 'all') as RoleFilter)}
              >
                <ToggleButton value="all" label="All" />
                <ToggleButton value="admin" label="Admin" />
                <ToggleButton value="viewer" label="Viewer" />
              </ToggleButtonGroup>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground" aria-hidden>
              Provider
            </span>
            <div className={togglePillClasses}>
              <ToggleButtonGroup
                label="Filter by provider"
                type="single"
                size="sm"
                value={providerFilter}
                onChange={(v) => setProviderFilter((v ?? 'all') as ProviderFilter)}
              >
                <ToggleButton value="all" label="All" />
                <ToggleButton value="local" label="Local" />
                <ToggleButton value="oidc" label="OIDC" />
              </ToggleButtonGroup>
            </div>
          </div>
          {hasActiveFilter ? (
            <Button
              variant="ghost"
              size="sm"
              label="Clear"
              onClick={() => {
                setEmailQuery('');
                setRoleFilter('all');
                setProviderFilter('all');
              }}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <Button variant="primary" size="sm" label="Add user" onClick={() => setAddOpen(true)} />
          </div>
        </div>

        {sortedUsers.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground" role="status">
            {users === null && 'Loading users…'}
            {users !== null && users.length === 0 && 'No users yet.'}
            {users !== null && users.length !== 0 && 'No users match the current filters.'}
          </div>
        ) : (
          <Table
            data={sortedUsers}
            columns={columns}
            idKey="id"
            plugins={{ sort: sortable }}
            density="compact"
            aria-label="Users, sortable and filterable."
          />
        )}
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} onCreated={onAdded} />
      <ResetPasswordDialog
        open={resetTarget !== null}
        onOpenChange={(v) => !v && setResetTarget(null)}
        user={resetTarget}
      />
      <DeleteUserDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        user={deleteTarget}
        onDeleted={onDeleted}
      />
    </Card>
  );
}
