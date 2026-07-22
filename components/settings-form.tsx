'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { Token } from '@astryxdesign/core/Token';
import { useState } from 'react';

import { parseApiError } from '@/lib/api-client';
import { authClient } from '@/lib/auth/client';
import type { NativeInputAttrs } from '@/lib/native-input-attrs';

// Server-side error (from a failed PATCH) always wins and carries its own
// message. Otherwise, a dirty field that's out of range client-side gets an
// error status too - but with no message, since the range is already stated
// in the field's `description` and duplicating it in the status box would
// render the same text twice. `status.type === 'error'` alone still drives
// TextInput's aria-invalid, so the field is correctly flagged either way.
function fieldStatus(
  error: string | null,
  dirty: boolean,
  valid: boolean,
): { type: 'error'; message?: string } | undefined {
  if (error) {
    return { type: 'error', message: error };
  }
  if (dirty && !valid) {
    return { type: 'error' };
  }
  return undefined;
}

type Props = {
  initialMinutes: number;
  envDefaultMinutes: number;
  initialRetentionDays: number;
  envDefaultRetentionDays: number;
};

export function SettingsForm({
  initialMinutes,
  envDefaultMinutes,
  initialRetentionDays,
  envDefaultRetentionDays,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <IntervalCard initialMinutes={initialMinutes} envDefault={envDefaultMinutes} />
      <RetentionCard initialRetentionDays={initialRetentionDays} envDefault={envDefaultRetentionDays} />
    </div>
  );
}

function IntervalCard({ initialMinutes, envDefault }: { initialMinutes: number; envDefault: number }) {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const readOnly = (session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role !== 'admin';
  const [value, setValue] = useState(String(initialMinutes));
  const [saved, setSaved] = useState(initialMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440;
  const dirty = parsed !== saved;

  const onSave = async () => {
    if (!valid) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: parsed }),
      });
      if (!res.ok) {
        const apiErr = await parseApiError(res);
        if (res.status >= 500) {
          toast({ body: apiErr.message, type: 'error' });
        } else {
          setError(apiErr.message);
        }
        return;
      }
      const body = (await res.json()) as { intervalMinutes: number };
      setSaved(body.intervalMinutes);
      setValue(String(body.intervalMinutes));
      toast({ body: 'Interval saved' });
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding={0} className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Measurement interval
        </Heading>
      </div>
      <div className="flex flex-col gap-4 px-6">
        <TextInput
          label="Interval (minutes)"
          value={value}
          onChange={setValue}
          isDisabled={readOnly}
          description={`env default: ${envDefault} - between 1 and 1440 - changes apply immediately`}
          status={fieldStatus(error, dirty, valid)}
          className="tabular-nums"
          {...({ inputMode: 'numeric', pattern: '[0-9]*' } satisfies NativeInputAttrs)}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Decorative: the env-default value is already in the field's
              description above (wired to the input via TextInput's own
              aria-describedby), so the pill is hidden from the a11y tree to
              avoid a redundant, unlinked announcement - Token drops raw
              aria-* props (no ...rest in Token.tsx), so aria-hidden is
              applied on a wrapping span instead (same pattern as the
              "Current" token in app/changelog/page.tsx). */}
          <span aria-hidden>
            <Token label={`env default: ${envDefault}`} size="sm" className="font-mono text-[10px] tracking-wide" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onClick={onSave}
            isDisabled={!valid || !dirty || readOnly}
            isLoading={saving}
            variant="primary"
          />
          <Button
            label="Cancel"
            variant="secondary"
            isDisabled={!dirty || saving || readOnly}
            onClick={() => {
              setValue(String(saved));
              setError(null);
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function RetentionCard({ initialRetentionDays, envDefault }: { initialRetentionDays: number; envDefault: number }) {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const readOnly = (session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role !== 'admin';
  const [value, setValue] = useState(String(initialRetentionDays));
  const [saved, setSaved] = useState(initialRetentionDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650;
  const dirty = parsed !== saved;

  const onSave = async () => {
    if (!valid) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retentionDays: parsed }),
      });
      if (!res.ok) {
        const apiErr = await parseApiError(res);
        if (res.status >= 500) {
          toast({ body: apiErr.message, type: 'error' });
        } else {
          setError(apiErr.message);
        }
        return;
      }
      const body = (await res.json()) as { retentionDays: number };
      setSaved(body.retentionDays);
      setValue(String(body.retentionDays));
      toast({ body: 'Retention saved' });
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding={0} className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Data retention
        </Heading>
      </div>
      <div className="flex flex-col gap-4 px-6">
        <TextInput
          label="Keep measurements (days)"
          value={value}
          onChange={setValue}
          isDisabled={readOnly}
          description={`env default: ${envDefault} - between 1 and 3650 - purge runs daily at 03:00`}
          status={fieldStatus(error, dirty, valid)}
          className="tabular-nums"
          {...({ inputMode: 'numeric', pattern: '[0-9]*' } satisfies NativeInputAttrs)}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Decorative - see IntervalCard above for why this is aria-hidden. */}
          <span aria-hidden>
            <Token label={`env default: ${envDefault}`} size="sm" className="font-mono text-[10px] tracking-wide" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onClick={onSave}
            isDisabled={!valid || !dirty || readOnly}
            isLoading={saving}
            variant="primary"
          />
          <Button
            label="Cancel"
            variant="secondary"
            isDisabled={!dirty || saving || readOnly}
            onClick={() => {
              setValue(String(saved));
              setError(null);
            }}
          />
        </div>
      </div>
    </Card>
  );
}
