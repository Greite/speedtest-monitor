'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import { parseApiError } from '@/lib/api-client';

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
    let res: Response;
    try {
      res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
      setPending(false);
      return;
    }
    if (!res.ok && res.status !== 204) {
      const apiErr = await parseApiError(res);
      if (res.status >= 500) {
        toast.error(apiErr.message);
      } else {
        setError(apiErr.message);
      }
      setPending(false);
      return;
    }
    toast.success('User deleted');
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
