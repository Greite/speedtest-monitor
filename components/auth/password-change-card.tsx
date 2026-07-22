'use client';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { useState } from 'react';

import { parseApiError } from '@/lib/api-client';
import type { NativeInputAttrs } from '@/lib/native-input-attrs';

export function PasswordChangeCard() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    let res: Response;
    try {
      res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Network error.', type: 'error' });
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const apiErr = await parseApiError(res);
      if (res.status >= 500) {
        toast({ body: apiErr.message, type: 'error' });
      } else if (apiErr.code === 'validation_failed' && apiErr.fields) {
        setFieldErrors(apiErr.fields);
        setError(apiErr.message);
      } else {
        setError(apiErr.message);
      }
      setSaving(false);
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setSaving(false);
    toast({ body: 'Password updated' });
  }

  return (
    <Card id="account" padding={0} className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Account
        </Heading>
      </div>
      <div className="px-6">
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
          <TextInput
            label="Current password"
            type="password"
            value={current}
            onChange={setCurrent}
            isRequired
            status={
              fieldErrors.currentPassword
                ? { type: 'error', message: fieldErrors.currentPassword.join(' ') }
                : undefined
            }
            {...({ autoComplete: 'current-password', required: true } satisfies NativeInputAttrs)}
          />
          <TextInput
            label="New password"
            type="password"
            value={next}
            onChange={setNext}
            isRequired
            status={fieldErrors.newPassword ? { type: 'error', message: fieldErrors.newPassword.join(' ') } : undefined}
            {...({ autoComplete: 'new-password', required: true } satisfies NativeInputAttrs)}
          />
          <TextInput
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            isRequired
            {...({ autoComplete: 'new-password', required: true } satisfies NativeInputAttrs)}
          />
          {error ? <Banner status="error" title={error} /> : null}
          <div>
            <Button type="submit" label="Change password" isLoading={saving} variant="primary" />
          </div>
        </form>
      </div>
    </Card>
  );
}
