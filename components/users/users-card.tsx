'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AddUserDialog } from './add-user-dialog';
import { DeleteUserDialog } from './delete-user-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

type UserRow = {
  id: number;
  email: string;
  role: 'admin' | 'viewer';
  provider: 'local' | 'oidc';
  name: string | null;
  createdAt: number;
  lastLoginAt: number | null;
};

type RoleFilter = 'all' | 'admin' | 'viewer';
type ProviderFilter = 'all' | 'local' | 'oidc';

function formatLastLogin(ts: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('sv-SE').replace('T', ' ').slice(0, 16);
}

export function UsersCard() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[] | null>(null);

  const [emailQuery, setEmailQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'email', desc: false }]);

  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: number; email: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/users');
    if (!res.ok) {
      const err = await parseApiError(res);
      toast.error(`Load failed: ${err.message}`);
      return;
    }
    const body = await res.json();
    setUsers(body.users);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setRole = useCallback(
    async (id: number, role: 'admin' | 'viewer') => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        toast.error(err.message);
        return;
      }
      await refresh();
      toast.success('Role updated');
    },
    [refresh],
  );

  const onAdded = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const onDeleted = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="font-medium">{row.original.email}</span>,
        filterFn: (row, _id, value: string) =>
          row.original.email.toLowerCase().includes(value.toLowerCase()),
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Select
            value={row.original.role}
            onValueChange={(v) => setRole(row.original.id, v as 'admin' | 'viewer')}
          >
            <SelectTrigger size="sm" className="w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="viewer">viewer</SelectItem>
            </SelectContent>
          </Select>
        ),
        filterFn: (row, _id, value: RoleFilter) =>
          value === 'all' ? true : row.original.role === value,
      },
      {
        id: 'provider',
        accessorKey: 'provider',
        header: 'Provider',
        cell: ({ row }) => (
          <Badge variant="secondary" className="uppercase">
            {row.original.provider}
          </Badge>
        ),
        filterFn: (row, _id, value: ProviderFilter) =>
          value === 'all' ? true : row.original.provider === value,
      },
      {
        id: 'lastLoginAt',
        accessorFn: (row) => row.lastLoginAt ?? 0,
        header: 'Last login',
        sortingFn: 'basic',
        sortUndefined: 'last',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatLastLogin(row.original.lastLoginAt)}
          </span>
        ),
        enableColumnFilter: false,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2 py-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetTarget({ id: row.original.id, email: row.original.email })}
            >
              Reset pw
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteTarget({ id: row.original.id, email: row.original.email })}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [setRole],
  );

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const out: ColumnFiltersState = [];
    if (emailQuery.trim()) out.push({ id: 'email', value: emailQuery.trim() });
    if (roleFilter !== 'all') out.push({ id: 'role', value: roleFilter });
    if (providerFilter !== 'all') out.push({ id: 'provider', value: providerFilter });
    return out;
  }, [emailQuery, roleFilter, providerFilter]);

  const table = useReactTable({
    data: users ?? [],
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (session?.user?.role !== 'admin') return null;

  const totalFiltered = table.getFilteredRowModel().rows.length;
  const hasActiveFilter =
    emailQuery.trim() !== '' || roleFilter !== 'all' || providerFilter !== 'all';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="users-email-filter" className="text-xs">
              Search email
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="users-email-filter"
                value={emailQuery}
                onChange={(e) => setEmailQuery(e.target.value)}
                placeholder="jane@example.com"
                className="h-8 w-56 pl-7 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Role</Label>
            <Segmented<RoleFilter>
              value={roleFilter}
              onChange={setRoleFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'admin', label: 'Admin' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Provider</Label>
            <Segmented<ProviderFilter>
              value={providerFilter}
              onChange={setProviderFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'local', label: 'Local' },
                { value: 'oidc', label: 'OIDC' },
              ]}
            />
          </div>
          {hasActiveFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEmailQuery('');
                setRoleFilter('all');
                setProviderFilter('all');
              }}
            >
              Clear
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <Button onClick={() => setAddOpen(true)}>Add user</Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 text-left font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : sortDir === 'desc' ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {users === null ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-6 text-center text-muted-foreground"
                >
                  Loading users…
                </TableCell>
              </TableRow>
            ) : totalFiltered === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-6 text-center text-muted-foreground"
                >
                  {users.length === 0 ? 'No users yet.' : 'No users match the current filters.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

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

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'h-7 rounded-sm px-2 text-xs font-medium transition-colors',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
