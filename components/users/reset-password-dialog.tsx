'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { useId, useState } from 'react';

import { useDialogRequest } from './use-dialog-request';

import type { NativeInputAttrs } from '@/lib/native-input-attrs';

const DIALOG_TITLE = 'Reset password';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email: string } | null;
};

const MIN_PASSWORD_LEN = 10;

export function ResetPasswordDialog({ open, onOpenChange, user }: Props) {
  const toast = useToast();
  // DialogHeader focuses its title on mount (own accessibility mechanism) but
  // does not set the Dialog's own accessible name or expose an id for it
  // (verified in DialogHeader.tsx: no DialogContext write-back, and no
  // per-title id prop - `id` passed in would land on the whole header
  // container, including the close button's label). aria-label duplicates
  // the title string instead of aria-labelledby to avoid that. The
  // description remains a separate Text block (DialogHeader's `subtitle` is
  // string-only, but this description needs the bold user email), so it
  // keeps its own id wired to aria-describedby.
  const descriptionId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const { pending, error, fieldErrors, setError, reset, run } = useDialogRequest();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setPassword('');
      setConfirm('');
      reset();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    const ok = await run(`/api/users/${user.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: password }),
    });
    if (!ok) {
      return;
    }
    toast({ body: `Password reset for ${user.email}` });
    handleOpenChange(false);
  }

  return (
    <Dialog
      isOpen={open}
      onOpenChange={handleOpenChange}
      purpose="form"
      width={480}
      aria-label={DIALOG_TITLE}
      aria-describedby={descriptionId}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogHeader title={DIALOG_TITLE} onOpenChange={handleOpenChange} />
        <Text type="body" color="secondary" id={descriptionId}>
          {user ? (
            <>
              Set a new password for <span className="font-medium">{user.email}</span>. Share it with them out-of-band;
              they can change it after logging in.
            </>
          ) : (
            'Set a new password.'
          )}
        </Text>
        <TextInput
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          isRequired
          hasAutoFocus
          placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
          status={fieldErrors.newPassword ? { type: 'error', message: fieldErrors.newPassword.join(' ') } : undefined}
          {...({
            autoComplete: 'new-password',
            required: true,
            minLength: MIN_PASSWORD_LEN,
          } satisfies NativeInputAttrs)}
        />
        <TextInput
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          isRequired
          {...({
            autoComplete: 'new-password',
            required: true,
            minLength: MIN_PASSWORD_LEN,
          } satisfies NativeInputAttrs)}
        />
        {error ? <Banner status="error" title={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" isDisabled={pending} onClick={() => handleOpenChange(false)} />
          <Button type="submit" variant="primary" label={pending ? 'Saving…' : 'Reset password'} isLoading={pending} />
        </div>
      </form>
    </Dialog>
  );
}
