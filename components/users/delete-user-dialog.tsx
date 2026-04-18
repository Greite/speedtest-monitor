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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: number; email: string } | null;
  onDeleted: () => void | Promise<void>;
};

export function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setError(null);
      setPending(false);
    }
  }

  async function onConfirm() {
    if (!user) return;
    setError(null);
    setPending(true);
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const body = await res.json().catch(() => ({}));
      const msg =
        body.error === 'last admin'
          ? 'This is the last admin account and cannot be deleted.'
          : (body.error?.message ?? body.error ?? `HTTP ${res.status}`);
      setError(typeof msg === 'string' ? msg : `HTTP ${res.status}`);
      setPending(false);
      return;
    }
    await onDeleted();
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>
            {user ? (
              <>
                This permanently removes <span className="font-medium">{user.email}</span>. Their
                sessions are immediately invalidated. This cannot be undone.
              </>
            ) : (
              'This cannot be undone.'
            )}
          </DialogDescription>
        </DialogHeader>
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
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
