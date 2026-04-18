'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseApiError } from '@/lib/api-client';

export function PasswordChangeCard() {
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
      toast.error(err instanceof Error ? err.message : 'Network error.');
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const apiErr = await parseApiError(res);
      if (res.status >= 500) {
        toast.error(apiErr.message);
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
    toast.success('Password updated');
  }

  return (
    <Card id="account">
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-current">Current password</Label>
            <Input
              id="pwd-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              aria-invalid={fieldErrors.currentPassword ? true : undefined}
            />
            {fieldErrors.currentPassword ? (
              <p className="text-xs text-destructive">{fieldErrors.currentPassword.join(' ')}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-new">New password</Label>
            <Input
              id="pwd-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              aria-invalid={fieldErrors.newPassword ? true : undefined}
            />
            {fieldErrors.newPassword ? (
              <p className="text-xs text-destructive">{fieldErrors.newPassword.join(' ')}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pwd-confirm">Confirm new password</Label>
            <Input
              id="pwd-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Change password'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
