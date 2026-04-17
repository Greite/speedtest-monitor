'use client';

import { AlertCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
      <RetentionCard
        initialRetentionDays={initialRetentionDays}
        envDefault={envDefaultRetentionDays}
      />
    </div>
  );
}

function IntervalCard({
  initialMinutes,
  envDefault,
}: {
  initialMinutes: number;
  envDefault: number;
}) {
  const { data: session } = useSession();
  const readOnly = session?.user?.role !== 'admin';
  const [value, setValue] = useState(String(initialMinutes));
  const [saved, setSaved] = useState(initialMinutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440;
  const dirty = parsed !== saved;

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: parsed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { intervalMinutes: number };
      setSaved(body.intervalMinutes);
      setValue(String(body.intervalMinutes));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Measurement interval</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="interval">Interval (minutes)</Label>
          <Input
            id="interval"
            type="number"
            min={1}
            max={1440}
            disabled={readOnly}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">env default: {envDefault}</Badge>
            between 1 and 1440 - changes apply immediately
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={!valid || !dirty || saving || readOnly}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setValue(String(saved));
              setError(null);
            }}
            disabled={!dirty || saving || readOnly}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RetentionCard({
  initialRetentionDays,
  envDefault,
}: {
  initialRetentionDays: number;
  envDefault: number;
}) {
  const { data: session } = useSession();
  const readOnly = session?.user?.role !== 'admin';
  const [value, setValue] = useState(String(initialRetentionDays));
  const [saved, setSaved] = useState(initialRetentionDays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650;
  const dirty = parsed !== saved;

  const onSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ retentionDays: parsed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { retentionDays: number };
      setSaved(body.retentionDays);
      setValue(String(body.retentionDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data retention</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="retention">Keep measurements (days)</Label>
          <Input
            id="retention"
            type="number"
            min={1}
            max={3650}
            disabled={readOnly}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">env default: {envDefault}</Badge>
            between 1 and 3650 - purge runs daily at 03:00
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Save failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex items-center gap-2">
          <Button onClick={onSave} disabled={!valid || !dirty || saving || readOnly}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setValue(String(saved));
              setError(null);
            }}
            disabled={!dirty || saving || readOnly}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
