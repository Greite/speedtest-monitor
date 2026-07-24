'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { useId } from 'react';

import { useDialogRequest } from './use-dialog-request';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email: string } | null;
  onDeleted: () => void | Promise<void>;
};

export function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: Props) {
  const toast = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const { pending, error, reset, run } = useDialogRequest();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      reset();
    }
  }

  async function onConfirm() {
    if (!user) {
      return;
    }
    const ok = await run(`/api/users/${user.id}`, { method: 'DELETE' });
    if (!ok) {
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
