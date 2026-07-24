'use client';

import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Switch } from '@astryxdesign/core/Switch';
import { Heading } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { Token } from '@astryxdesign/core/Token';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { parseApiError } from '@/lib/api-client';
import { authClient } from '@/lib/auth/client';
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

// NumberInput's onChange only fires with finite numbers (or null on clear),
// so this only has to keep the original "must be positive" business rule -
// zero or negative values disable the rule instead of committing. Emptied
// fields commit on blur/Enter/clear, not per keystroke (see table-filters).
function positiveOrNull(v: number | null): number | null {
  return v != null && v > 0 ? v : null;
}

type TestState = { ok: boolean; message: string } | 'pending';

export function AlertsCard() {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const readOnly = (session?.user as { role?: 'admin' | 'viewer' } | undefined)?.role !== 'admin';
  const [rules, setRules] = useState<Rules | null>(null);
  const [savedRules, setSavedRules] = useState<Rules | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestState>>({});

  const dirty = useMemo(() => {
    if (!savedRules || !rules) {
      return false;
    }
    return JSON.stringify(rules) !== JSON.stringify(savedRules);
  }, [rules, savedRules]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/alerts/rules')
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: Rules) => {
        if (!cancelled) {
          setRules(data);
          setSavedRules(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'load failed');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rules) {
    return (
      <Card padding={0} className="flex flex-col gap-6 py-6">
        <div className="px-6">
          <Heading level={2} className="label-eyebrow flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Alerts
          </Heading>
        </div>
        <div className="flex flex-col gap-4 px-6">
          {error ? (
            <Banner status="error" title="Load failed" description={error} />
          ) : (
            <>
              <Skeleton height={32} width={160} />
              <Skeleton height={96} width="100%" />
              <Skeleton height={160} width="100%" />
            </>
          )}
        </div>
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
        if (res.status >= 500) {
          toast({ body: apiErr.message, type: 'error' });
        } else {
          setError(apiErr.message);
        }
        return;
      }
      const updated = (await res.json()) as Rules;
      setRules(updated);
      setSavedRules(updated);
      toast({ body: 'Alerts saved' });
    } catch (err) {
      toast({ body: err instanceof Error ? err.message : 'Save failed', type: 'error' });
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
      let result: { ok: boolean; message: string };
      if (!r) {
        result = { ok: false, message: 'No result' };
      } else if (r.ok) {
        result = { ok: true, message: 'Delivered' };
      } else {
        result = { ok: false, message: r.error ?? 'unknown' };
      }
      setTestResult((prev) => ({
        ...prev,
        [destination]: result,
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
    <Card padding={0} className="flex flex-col gap-6 py-6">
      <div className="px-6">
        <Heading level={2} className="label-eyebrow flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Alerts
        </Heading>
      </div>
      <div className="flex flex-col gap-6 px-6">
        {/* Switch's track is a fixed 40x24 box and the actual hit target - its
            invisible <input> - matches that size exactly (see Switch.tsx). Both
            dimensions sit under the 44px mobile touch floor (WCAG 2.5.5), so the
            wrapper enlarges the rendered input on mobile only, same idiom as the
            ToggleButton wrapper in table-filters.tsx. min-w-10/min-h-6 restore
            the native 40x24 size at md and up. */}
        <div className="[&_input]:min-h-11 [&_input]:min-w-11 md:[&_input]:min-h-6 md:[&_input]:min-w-10">
          <Switch
            label="Enable alerts"
            value={rules.enabled}
            isDisabled={readOnly}
            onChange={(v) => setRules({ ...rules, enabled: v })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Thresholds</h3>
          <p className="text-xs text-muted-foreground">Leave empty to disable a rule. Values must be positive.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberInput
              label="Download below (Mbps)"
              hasClear
              value={rules.thresholds.downloadMbps}
              onChange={(v) => setThreshold('downloadMbps', positiveOrNull(v))}
              isDisabled={readOnly}
              className="tabular-nums"
            />
            <NumberInput
              label="Upload below (Mbps)"
              hasClear
              value={rules.thresholds.uploadMbps}
              onChange={(v) => setThreshold('uploadMbps', positiveOrNull(v))}
              isDisabled={readOnly}
              className="tabular-nums"
            />
            <NumberInput
              label="Latency above (ms)"
              hasClear
              value={rules.thresholds.latencyMs}
              onChange={(v) => setThreshold('latencyMs', positiveOrNull(v))}
              isDisabled={readOnly}
              className="tabular-nums"
            />
            <NumberInput
              label="Bufferbloat above (ms)"
              hasClear
              value={rules.thresholds.bufferBloatMs}
              onChange={(v) => setThreshold('bufferBloatMs', positiveOrNull(v))}
              isDisabled={readOnly}
              className="tabular-nums"
            />
            <NumberInput
              label="Failure streak"
              hasClear
              isIntegerOnly
              value={rules.failureStreak}
              onChange={(v) => setRules({ ...rules, failureStreak: positiveOrNull(v) })}
              isDisabled={readOnly}
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Destinations</h3>
          <div className="flex flex-col gap-2">
            {DESTS.map(({ key, label }) => {
              const configured = rules.destinationsConfigured[key];
              const result = testResult[key];
              return (
                <div key={key} className="flex flex-wrap items-center gap-3 rounded-md border bg-card/50 px-3 py-2">
                  <div className="[&_input]:min-h-11 [&_input]:min-w-11 md:[&_input]:min-h-6 md:[&_input]:min-w-10">
                    <Switch
                      label={label}
                      value={rules.destinations[key]}
                      isDisabled={!configured || readOnly}
                      onChange={(v) => setDest(key, v)}
                      width={140}
                    />
                  </div>
                  <Token
                    label={configured ? 'configured in env' : 'missing env var'}
                    color={configured ? 'green' : 'gray'}
                  />
                  <Button
                    label="Send test"
                    variant="secondary"
                    size="sm"
                    isDisabled={!configured || readOnly}
                    onClick={() => test(key)}
                  />
                  {result ? <TestResultPill state={result} /> : null}
                </div>
              );
            })}
          </div>
        </div>

        {error ? <Banner status="error" title="Save failed" description={error} /> : null}

        <div className="flex items-center gap-2">
          <Button
            label={saving ? 'Saving…' : 'Save'}
            onClick={save}
            isDisabled={saving || readOnly || !dirty}
            isLoading={saving}
            variant="primary"
          />
          <Button
            label="Cancel"
            variant="secondary"
            onClick={() => {
              if (savedRules) {
                setRules(savedRules);
              }
              setError(null);
            }}
            isDisabled={saving || readOnly || !dirty}
          />
        </div>
      </div>
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
