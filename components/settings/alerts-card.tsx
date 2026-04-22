'use client';

import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { parseApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type Configured = {
  webhook: boolean;
  ntfy: boolean;
  discord: boolean;
  slack: boolean;
  smtp: boolean;
};

type Rules = {
  enabled: boolean;
  thresholds: {
    downloadMbps: number | null;
    uploadMbps: number | null;
    latencyMs: number | null;
    bufferBloatMs: number | null;
  };
  failureStreak: number | null;
  destinations: Configured;
  destinationsConfigured: Configured;
};

const DESTS: { key: keyof Configured; label: string }[] = [
  { key: 'webhook', label: 'Webhook' },
  { key: 'ntfy', label: 'ntfy' },
  { key: 'discord', label: 'Discord' },
  { key: 'slack', label: 'Slack' },
  { key: 'smtp', label: 'SMTP' },
];

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type TestState = { ok: boolean; message: string } | 'pending';

export function AlertsCard() {
  const { data: session } = useSession();
  const readOnly = session?.user?.role !== 'admin';
  const [rules, setRules] = useState<Rules | null>(null);
  const [savedRules, setSavedRules] = useState<Rules | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestState>>({});

  const dirty = useMemo(() => {
    if (!savedRules || !rules) return false;
    return JSON.stringify(rules) !== JSON.stringify(savedRules);
  }, [rules, savedRules]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/alerts/rules')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Rules) => {
        if (!cancelled) {
          setRules(data);
          setSavedRules(data);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load failed');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rules) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Load failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const setThreshold = (k: keyof Rules['thresholds'], v: number | null) =>
    setRules({ ...rules, thresholds: { ...rules.thresholds, [k]: v } });
  const setDest = (k: keyof Configured, v: boolean) =>
    setRules({ ...rules, destinations: { ...rules.destinations, [k]: v } });

  const save = async () => {
    setSaving(true);
    setError(null);
    setStatus('Saving...');
    try {
      const res = await fetch('/api/alerts/rules', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: rules.enabled,
          thresholds: rules.thresholds,
          failureStreak: rules.failureStreak,
          destinations: rules.destinations,
        }),
      });
      if (!res.ok) {
        const apiErr = await parseApiError(res);
        setStatus(null);
        if (res.status >= 500) {
          toast.error(apiErr.message);
        } else {
          setError(apiErr.message);
        }
        return;
      }
      const updated = (await res.json()) as Rules;
      setRules(updated);
      setSavedRules(updated);
      setStatus('Saved');
      toast.success('Alerts saved');
    } catch (err) {
      setStatus(null);
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const test = async (destination: keyof Configured) => {
    setTestResult((prev) => ({ ...prev, [destination]: 'pending' }));
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        results?: Record<string, { ok: boolean; error?: string }>;
      };
      const r = body.results?.[destination];
      setTestResult((prev) => ({
        ...prev,
        [destination]: r
          ? r.ok
            ? { ok: true, message: 'Delivered' }
            : { ok: false, message: r.error ?? 'unknown' }
          : { ok: false, message: 'No result' },
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [destination]: {
          ok: false,
          message: err instanceof Error ? err.message : 'unknown',
        },
      }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alerts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Switch
            id="alerts-enabled"
            checked={rules.enabled}
            disabled={readOnly}
            onCheckedChange={(v) => setRules({ ...rules, enabled: v })}
          />
          <Label htmlFor="alerts-enabled">Enable alerts</Label>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Thresholds</h3>
          <p className="text-xs text-muted-foreground">
            Leave empty to disable a rule. Values must be positive.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="th-download">Download below (Mbps)</Label>
              <Input
                id="th-download"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={rules.thresholds.downloadMbps ?? ''}
                onChange={(e) => setThreshold('downloadMbps', numOrNull(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="th-upload">Upload below (Mbps)</Label>
              <Input
                id="th-upload"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={rules.thresholds.uploadMbps ?? ''}
                onChange={(e) => setThreshold('uploadMbps', numOrNull(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="th-latency">Latency above (ms)</Label>
              <Input
                id="th-latency"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={rules.thresholds.latencyMs ?? ''}
                onChange={(e) => setThreshold('latencyMs', numOrNull(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="th-bufferbloat">Bufferbloat above (ms)</Label>
              <Input
                id="th-bufferbloat"
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={rules.thresholds.bufferBloatMs ?? ''}
                onChange={(e) => setThreshold('bufferBloatMs', numOrNull(e.target.value))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="th-failure">Failure streak</Label>
              <Input
                id="th-failure"
                type="number"
                min={1}
                step={1}
                disabled={readOnly}
                value={rules.failureStreak ?? ''}
                onChange={(e) => setRules({ ...rules, failureStreak: numOrNull(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Destinations</h3>
          <div className="flex flex-col gap-2">
            {DESTS.map(({ key, label }) => {
              const configured = rules.destinationsConfigured[key];
              const result = testResult[key];
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 rounded-md border bg-card/50 px-3 py-2"
                >
                  <Switch
                    id={`dest-${key}`}
                    checked={rules.destinations[key]}
                    disabled={!configured || readOnly}
                    onCheckedChange={(v) => setDest(key, v)}
                  />
                  <Label htmlFor={`dest-${key}`} className="w-24">
                    {label}
                  </Label>
                  <Badge variant={configured ? 'secondary' : 'outline'}>
                    {configured ? 'configured in env' : 'missing env var'}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!configured || readOnly}
                    onClick={() => test(key)}
                  >
                    Send test
                  </Button>
                  {result ? <TestResultPill state={result} /> : null}
                </div>
              );
            })}
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
          <Button onClick={save} disabled={saving || readOnly || !dirty}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (savedRules) setRules(savedRules);
              setError(null);
              setStatus(null);
            }}
            disabled={saving || readOnly || !dirty}
          >
            Cancel
          </Button>
          {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TestResultPill({ state }: { state: TestState }) {
  if (state === 'pending') {
    return <span className="text-xs text-muted-foreground">Sending…</span>;
  }
  const Icon = state.ok ? CheckCircle2 : XCircle;
  return (
    <span
      className={cn(
        'inline-flex max-w-[32ch] items-center gap-1 truncate text-xs',
        state.ok ? 'text-latency-ok' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{state.message}</span>
    </span>
  );
}
