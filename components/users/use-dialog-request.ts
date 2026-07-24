'use client';

import { useState } from 'react';

import { parseApiError } from '@/lib/api-client';

// Shared submit state for the users dialogs. Errors land in the in-dialog
// Banner (not a toast): ToastViewport enters the top layer at mount, then
// dialog.showModal() stacks above it, so toasts render beneath open dialogs.
export function useDialogRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setPending(false);
    setError(null);
    setFieldErrors({});
  }

  async function run(url: string, init?: RequestInit): Promise<boolean> {
    setError(null);
    setFieldErrors({});
    setPending(true);
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
      setPending(false);
      return false;
    }
    if (!res.ok) {
      const apiErr = await parseApiError(res);
      if (apiErr.code === 'validation_failed' && apiErr.fields) {
        setFieldErrors(apiErr.fields);
      }
      setError(apiErr.message);
      setPending(false);
      return false;
    }
    return true;
  }

  return { pending, error, fieldErrors, setError, reset, run };
}
