'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
};

const MIN_PASSWORD_LEN = 10;

export function AddUserDialog({ open, onOpenChange, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setEmail('');
    setPassword('');
    setRole('viewer');
    setError(null);
    setPending(false);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    setPending(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        res.status === 409
          ? 'An account with this email already exists.'
          : (body.error?.message ?? body.error ?? `HTTP ${res.status}`);
      setError(typeof msg === 'string' ? msg : `HTTP ${res.status}`);
      setPending(false);
      return;
    }
    await onCreated();
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a local account. The user can change their password after logging in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-user-email">Email</Label>
            <Input
              id="add-user-email"
              type="email"
              required
              autoComplete="off"
              autoFocus
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-user-password">Temporary password</Label>
            <Input
              id="add-user-password"
              type="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-user-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'viewer')}>
              <SelectTrigger id="add-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                <SelectItem value="admin">Admin (full access)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
