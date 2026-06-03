import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { KnownSettings, SettingsFile } from '@ccm/shared';
import { useSettings, useWriteSettings } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Field, Input, Switch, Spinner } from '../components/ui';
import { EditorFrame } from '../components/Editor';
import { KeyValueEditor } from '../components/KeyValueEditor';
import { CodeMirror, type CodeIssue } from '../components/CodeMirror';

const KNOWN_KEYS = new Set([
  'enabledPlugins', 'extraKnownMarketplaces', 'alwaysThinkingEnabled', 'skipWorkflowUsageWarning',
  'preferredNotifChannel', 'fastMode', 'permissions', 'env', 'hooks', 'model', 'statusLine',
  'apiKeyHelper', 'includeCoAuthoredBy', 'cleanupPeriodDays', 'outputStyle',
]);

const TOGGLES: { key: keyof KnownSettings; label: string; hint: string }[] = [
  { key: 'alwaysThinkingEnabled', label: 'Always thinking', hint: 'Enable extended thinking by default.' },
  { key: 'fastMode', label: 'Fast mode', hint: 'Faster Opus output in Claude Code.' },
  { key: 'skipWorkflowUsageWarning', label: 'Skip workflow usage warning', hint: 'Suppress the workflow cost warning.' },
  { key: 'includeCoAuthoredBy', label: 'Co-authored-by trailer', hint: 'Add the Claude co-author trailer to commits.' },
];

function splitKnown(obj: Record<string, unknown>) {
  const known: Record<string, unknown> = {};
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) (KNOWN_KEYS.has(k) ? known : unknown)[k] = v;
  return { known, unknown };
}

/** Order-insensitive canonical JSON, so re-serializing (form<->raw) isn't "dirty". */
function canon(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as object)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}
function canonRaw(raw: string): string {
  try {
    return canon(JSON.parse(raw));
  } catch {
    return `__invalid__${raw}`;
  }
}

export function SettingsModule() {
  const { scopeId = 'global' } = useParams();
  const query = useSettings(scopeId);
  const file = query.data?.files[0];
  const variant = (file?.structured?.variant ?? 'settings') as 'settings' | 'local';
  const write = useWriteSettings(scopeId, variant);

  const [known, setKnown] = useState<KnownSettings | null>(null);
  const [unknown, setUnknown] = useState<Record<string, unknown>>({});
  const [baseline, setBaseline] = useState('');
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [raw, setRaw] = useState('');
  const [issues, setIssues] = useState<CodeIssue[]>([]);

  if (file && known === null) {
    const s = file.structured;
    setKnown((s?.known as KnownSettings) ?? {});
    setUnknown(s?.unknown ?? {});
    const b = canon({ ...(s?.known ?? {}), ...(s?.unknown ?? {}) });
    setBaseline(b);
    setRaw(file.raw || JSON.stringify({ ...(s?.known ?? {}), ...(s?.unknown ?? {}) }, null, 2));
  }

  const merged = { ...(known ?? {}), ...unknown };
  const dirty =
    known !== null && (mode === 'raw' ? canonRaw(raw) !== baseline : canon(merged) !== baseline);

  const set = (key: keyof KnownSettings, value: unknown) =>
    setKnown((k) => {
      const next = { ...(k ?? {}) };
      if (value === '' || value === undefined) delete next[key];
      else (next as Record<string, unknown>)[key] = value;
      return next;
    });

  const switchMode = (next: 'form' | 'raw') => {
    if (next === 'raw') setRaw(JSON.stringify(merged, null, 2));
    else {
      try {
        const parsed = JSON.parse(raw);
        const sp = splitKnown(parsed);
        setKnown(sp.known as KnownSettings);
        setUnknown(sp.unknown);
        setIssues([]);
      } catch (e) {
        setIssues([{ message: `Invalid JSON: ${(e as Error).message}` }]);
        return;
      }
    }
    setMode(next);
  };

  const save = async () => {
    setIssues([]);
    let payload: SettingsFile;
    if (mode === 'raw') {
      try {
        payload = { known: JSON.parse(raw), unknown: {}, variant };
      } catch (e) {
        setIssues([{ message: `Invalid JSON: ${(e as Error).message}` }]);
        return;
      }
    } else {
      payload = { known: known ?? {}, unknown, variant };
    }
    try {
      await write.mutateAsync({ structured: payload, expectedSha256: file?.meta.sha256 });
      toast.success('Settings saved');
      const b = canon({ ...payload.known, ...payload.unknown });
      setBaseline(b);
      if (mode === 'raw') {
        const sp = splitKnown(payload.known as Record<string, unknown>);
        setKnown(sp.known as KnownSettings);
        setUnknown(sp.unknown);
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.isValidation) {
        setIssues((e.issues ?? []).map((i) => ({ message: `${i.path}: ${i.message}` })));
        toast.error('Validation failed');
      } else {
        toast.error(e instanceof Error ? e.message : 'Save failed');
      }
    }
  };

  const discard = () => {
    if (!file) return;
    setKnown((file.structured?.known as KnownSettings) ?? {});
    setUnknown(file.structured?.unknown ?? {});
    setRaw(file.raw || '');
    setIssues([]);
  };

  if (query.isLoading || known === null) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  return (
    <EditorFrame
      regKey={`${scopeId}:settings`}
      title="Settings"
      relPath={file?.meta.relPath}
      dirty={dirty}
      saving={write.isPending}
      issuesCount={issues.length}
      redactedFields={file?.redactedFields}
      mode={mode}
      onModeChange={switchMode}
      onSave={save}
      onDiscard={discard}
    >
      <div className="mx-auto max-w-2xl px-6 py-6">
        {mode === 'raw' ? (
          <CodeMirror value={raw} language="json" onChange={setRaw} diagnostics={issues} minHeight="460px" />
        ) : (
          <div className="space-y-6">
            <Field label="Model" hint="Override the default model (e.g. claude-opus-4-8).">
              <Input mono value={(known.model as string) ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="default" />
            </Field>
            <Field label="Preferred notification channel" hint="e.g. kitty, terminal.">
              <Input value={(known.preferredNotifChannel as string) ?? ''} onChange={(e) => set('preferredNotifChannel', e.target.value)} placeholder="none" />
            </Field>

            <div className="space-y-3 rounded-md border border-border bg-surface p-4">
              {TOGGLES.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-ink">{t.label}</div>
                    <div className="text-xs text-ink-subtle">{t.hint}</div>
                  </div>
                  <Switch checked={!!known[t.key]} onCheckedChange={(v) => set(t.key, v)} />
                </div>
              ))}
            </div>

            <Field label="Environment variables" hint="Injected into Claude Code sessions. Values are hidden until revealed.">
              <KeyValueEditor value={(known.env as Record<string, string>) ?? {}} onChange={(env) => set('env', Object.keys(env).length ? env : undefined)} masked />
            </Field>
          </div>
        )}
      </div>
    </EditorFrame>
  );
}
