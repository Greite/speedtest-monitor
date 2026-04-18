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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: number; email: string } | null;
  onDone: (message: string) => void;
};

const MIN_PASSWORD_LEN = 10;

export function ResetPasswordDialog({ open, onOpenChange, user, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setPassword('');
    setConfirm('');
    setError(null);
    setPending(false);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    const res = await fetch(`/api/users/${user.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error?.message ?? body.error ?? `HTTP ${res.status}`;
      setError(typeof msg === 'string' ? msg : `HTTP ${res.status}`);
      setPending(false);
      return;
    }
    onDone(`Password reset for ${user.email}`);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                Set a new password for <span className="font-medium">{user.email}</span>. Share it
                with them out-of-band; they can change it after logging in.
              </>
            ) : (
              'Set a new password.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-pw-new">New password</Label>
            <Input
              id="reset-pw-new"
              type="password"
              required
              autoComplete="new-password"
              autoFocus
              minLength={MIN_PASSWORD_LEN}
              placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-pw-confirm">Confirm password</Label>
            <Input
              id="reset-pw-confirm"
              type="password"
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
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
              {pending ? 'Saving…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
