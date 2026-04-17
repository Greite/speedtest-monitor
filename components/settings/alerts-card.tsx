'use client';

import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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

export function AlertsCard() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/alerts/rules')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Rules) => {
        if (!cancelled) setRules(data);
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
            <p className="text-sm text-muted-foreground">Loading...</p>
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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as Rules;
      setRules(updated);
      setStatus('Saved');
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const test = async (destination: keyof Configured) => {
    setTestResult({ ...testResult, [destination]: 'Sending...' });
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
        [destination]: r ? (r.ok ? 'OK' : `Failed: ${r.error ?? 'unknown'}`) : 'No result',
      }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [destination]: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
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
                    disabled={!configured}
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
                    disabled={!configured}
                    onClick={() => test(key)}
                  >
                    Send test
                  </Button>
                  {result ? <span className="text-xs text-muted-foreground">{result}</span> : null}
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
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
