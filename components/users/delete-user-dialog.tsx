'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { useState } from 'react';

import { useDialogA11yIds } from '@/components/use-dialog-a11y-ids';
import { parseApiError } from '@/lib/api-client';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email: string } | null;
  onDeleted: () => void | Promise<void>;
};

export function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: Props) {
  const toast = useToast();
  const { labelId: titleId, descriptionId } = useDialogA11yIds();
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
    if (!user) {
      return;
    }
    setError(null);
    setPending(true);
    let res: Response;
    try {
      res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    } catch (err) {
      // Toasts render beneath open dialogs (ToastViewport enters the top layer at
      // mount; dialog.showModal() stacks above it later), so route errors raised
      // while this dialog is open to the in-dialog Banner instead.
      setError(err instanceof Error ? err.message : 'Network error.');
      setPending(false);
      return;
    }
    if (!res.ok && res.status !== 204) {
      const apiErr = await parseApiError(res);
      setError(apiErr.message);
      setPending(false);
      return;
    }
    toast({ body: 'User deleted' });
    await onDeleted();
    handleOpenChange(false);
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={handleOpenChange}
      purpose="form"
      role="alertdialog"
      width={400}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading level={2} id={titleId}>
            Delete user?
          </Heading>
          <Text type="body" color="secondary" id={descriptionId}>
            {user ? (
              <>
                This permanently removes <span className="font-medium">{user.email}</span>. Their sessions are
                immediately invalidated. This cannot be undone.
              </>
            ) : (
              'This cannot be undone.'
            )}
          </Text>
        </div>
        {error ? <Banner status="error" title={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" isDisabled={pending} onClick={() => handleOpenChange(false)} />
          <Button
            variant="destructive"
            label={pending ? 'Deleting…' : 'Delete user'}
            isLoading={pending}
            onClick={onConfirm}
          />
        </div>
      </div>
    </Dialog>
  );
}
