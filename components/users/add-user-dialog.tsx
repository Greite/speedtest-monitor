'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { useId, useState } from 'react';

import { useDialogRequest } from './use-dialog-request';

import type { NativeInputAttrs } from '@/lib/native-input-attrs';

const DIALOG_TITLE = 'Add user';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void | Promise<void>;
};

const MIN_PASSWORD_LEN = 10;

const ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer (read-only)' },
  { value: 'admin', label: 'Admin (full access)' },
];

export function AddUserDialog({ open, onOpenChange, onCreated }: Props) {
  const toast = useToast();
  // See reset-password-dialog.tsx: DialogHeader focuses its title on mount
  // but does not set the Dialog's own accessible name or expose an id for
  // it, so aria-label duplicates the title string here instead of
  // aria-labelledby. The description keeps its own id for aria-describedby.
  const descriptionId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');
  const { pending, error, fieldErrors, setError, reset, run } = useDialogRequest();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setEmail('');
      setPassword('');
      setRole('viewer');
      reset();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    const ok = await run('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, role }),
    });
    if (!ok) {
      return;
    }
    toast({ body: 'User created' });
    await onCreated();
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
          Create a local account. The user can change their password after logging in.
        </Text>
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          isRequired
          hasAutoFocus
          placeholder="jane@example.com"
          status={fieldErrors.email ? { type: 'error', message: fieldErrors.email.join(' ') } : undefined}
          {...({ autoComplete: 'off', required: true } satisfies NativeInputAttrs)}
        />
        <TextInput
          label="Temporary password"
          type="password"
          value={password}
          onChange={setPassword}
          isRequired
          placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
          status={fieldErrors.password ? { type: 'error', message: fieldErrors.password.join(' ') } : undefined}
          {...({
            autoComplete: 'new-password',
            required: true,
            minLength: MIN_PASSWORD_LEN,
          } satisfies NativeInputAttrs)}
        />
        <Selector label="Role" options={ROLE_OPTIONS} value={role} onChange={(v) => setRole(v as 'admin' | 'viewer')} />
        {error ? <Banner status="error" title={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" label="Cancel" isDisabled={pending} onClick={() => handleOpenChange(false)} />
          <Button type="submit" variant="primary" label={pending ? 'Creating…' : 'Create user'} isLoading={pending} />
        </div>
      </form>
    </Dialog>
  );
}
