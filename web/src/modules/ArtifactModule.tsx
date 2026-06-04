import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bot, SquareSlash, Sparkles, Plus, Trash2, ChevronRight, FileText } from 'lucide-react';
import type { ArtifactType, Subagent, SlashCommand, Skill } from '@ccm/shared';
import { useArtifact, useArtifacts, useDeleteArtifact, useUpsertArtifact } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { splitFrontmatter, joinFrontmatter } from '../lib/frontmatter';
import { Button, Card, Badge, Field, Input, Textarea, EmptyState, SegmentedControl, Spinner } from '../components/ui';
import { PageHeader, EditorFrame } from '../components/Editor';
import { ConfirmDialog } from '../components/Dialog';
import { TransferButton } from '../components/TransferButton';
import { CodeMirror, type CodeIssue } from '../components/CodeMirror';

const META: Record<ArtifactType, { singular: string; title: string; icon: typeof Bot; bodyLabel: string; bodyHint: string }> = {
  agents: { singular: 'subagent', title: 'Subagents', icon: Bot, bodyLabel: 'System prompt', bodyHint: 'The agent’s instructions (markdown).' },
  commands: { singular: 'command', title: 'Slash commands', icon: SquareSlash, bodyLabel: 'Command', bodyHint: 'What this command tells Claude to do (markdown).' },
  skills: { singular: 'skill', title: 'Skills', icon: Sparkles, bodyLabel: 'Skill', bodyHint: 'SKILL.md body (markdown).' },
};

export function ArtifactModule({ type, create }: { type: ArtifactType; create?: boolean }) {
  const { name } = useParams();
  if (create) return <ArtifactEditor type={type} create />;
  if (name) return <ArtifactEditor type={type} name={name} />;
  return <ArtifactList type={type} />;
}

function ArtifactList({ type }: { type: ArtifactType }) {
  const { scopeId = 'global' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useArtifacts(scopeId, type);
  const meta = META[type];
  const Icon = meta.icon;
  const goNew = () => navigate(`/scope/${scopeId}/${type}/new`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={meta.title}
        subtitle={`Manage ${meta.singular}s for this scope.`}
        actions={
          <Button variant="primary" onClick={goNew}>
            <Plus className="h-4 w-4" /> New {meta.singular}
          </Button>
        }
      />
      <div className="px-6 py-5">
        {isLoading && <div className="flex justify-center py-10"><Spinner /></div>}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <EmptyState
            icon={<Icon className="h-8 w-8" />}
            title={`No ${meta.singular}s yet`}
            description={`Create your first ${meta.singular} for this scope.`}
            action={
              <Button variant="primary" onClick={goNew}>
                <Plus className="h-4 w-4" /> New {meta.singular}
              </Button>
            }
          />
        )}
        <div className="space-y-2">
          {data?.items.map((item) => (
            <Link key={item.name} to={`/scope/${scopeId}/${type}/${encodeURIComponent(item.name)}`}>
              <Card className="group flex items-center gap-3 px-4 py-3 transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-sm">
                <FileText className="h-4 w-4 shrink-0 text-ink-subtle" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm text-ink">{item.name}</span>
                    {item.badge && <Badge tone="clay">{item.badge}</Badge>}
                  </div>
                  {item.description && <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted">{item.description}</p>}
                </div>
                <TransferButton type={type} label={item.name} identity={{ name: item.name }} fromScopeId={scopeId} />
                <ChevronRight className="h-4 w-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const MODEL_OPTIONS = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

function ArtifactEditor({ type, name, create }: { type: ArtifactType; name?: string; create?: boolean }) {
  const { scopeId = 'global' } = useParams();
  const navigate = useNavigate();
  const meta = META[type];
  const loaded = useArtifact(scopeId, type, name ?? '', !create && !!name);
  const upsert = useUpsertArtifact(scopeId, type);
  const del = useDeleteArtifact(scopeId, type);

  const [initialized, setInitialized] = useState(false);
  const [slug, setSlug] = useState(name ?? '');
  const [fm, setFm] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState('');
  const [hasFm, setHasFm] = useState(type !== 'commands');
  const [baseline, setBaseline] = useState('');
  const [mode, setMode] = useState<'form' | 'raw'>('form');
  const [rawDraft, setRawDraft] = useState('');
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initialize from the loaded artifact once.
  if (!create && loaded.data && !initialized) {
    const env = loaded.data;
    const s = env.structured as Subagent | SlashCommand | Skill | null;
    const fmData = (s && 'frontmatter' in s ? (s.frontmatter as Record<string, unknown>) : {}) ?? {};
    setFm(fmData);
    setBody((s as any)?.body ?? '');
    setHasFm(env.raw.startsWith('---'));
    setBaseline(env.raw);
    setRawDraft(env.raw);
    setInitialized(true);
  }

  const currentRaw = mode === 'raw' ? rawDraft : joinFrontmatter({ ...fm }, body, hasFm || Object.keys(fm).length > 0);
  const dirty = create ? currentRaw.trim().length > 0 || slug.trim().length > 0 : currentRaw !== baseline;

  const setField = (key: string, value: unknown) => setFm((f) => ({ ...f, [key]: value }));

  const switchMode = (next: 'form' | 'raw') => {
    if (next === 'raw') {
      setRawDraft(joinFrontmatter({ ...fm }, body, hasFm || Object.keys(fm).length > 0));
    } else {
      const split = splitFrontmatter(rawDraft);
      setFm(split.data);
      setBody(split.body);
      setHasFm(split.hasFrontmatter);
    }
    setMode(next);
  };

  const discard = () => {
    if (create) {
      navigate(`/scope/${scopeId}/${type}`);
      return;
    }
    const split = splitFrontmatter(baseline);
    setFm(split.data);
    setBody(split.body);
    setHasFm(split.hasFrontmatter);
    setRawDraft(baseline);
    setIssues([]);
  };

  const save = async () => {
    setIssues([]);
    const finalName = (create ? slug : name)!.trim();
    if (!finalName) {
      toast.error('A name is required.');
      return;
    }
    try {
      const payload =
        mode === 'raw'
          ? { name: finalName, create: !!create, raw: rawDraft }
          : { name: finalName, create: !!create, structured: { frontmatter: hasFm || Object.keys(fm).length ? fm : null, body } };
      await upsert.mutateAsync(payload);
      toast.success(`${meta.singular} saved`);
      setBaseline(mode === 'raw' ? rawDraft : joinFrontmatter({ ...fm }, body, hasFm || Object.keys(fm).length > 0));
      if (create) navigate(`/scope/${scopeId}/${type}/${encodeURIComponent(finalName)}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.isValidation) {
        setIssues((e.issues ?? []).map((i) => ({ message: `${i.path}: ${i.message}` })));
        toast.error('Validation failed');
      } else {
        toast.error(e instanceof Error ? e.message : 'Save failed');
      }
    }
  };

  if (!create && loaded.isLoading) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }

  const title = create ? `New ${meta.singular}` : name;
  const relPath = !create ? loaded.data?.meta.relPath : undefined;

  return (
    <>
      <EditorFrame
        regKey={`${scopeId}:${type}:${name ?? 'new'}`}
        title={title}
        relPath={relPath}
        dirty={dirty}
        saving={upsert.isPending}
        issuesCount={issues.length}
        mode={mode}
        onModeChange={switchMode}
        onSave={save}
        onDiscard={discard}
        headerExtra={
          !create &&
          name && (
            <div className="flex items-center gap-1">
              <TransferButton type={type} label={name} identity={{ name }} fromScopeId={scopeId} />
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        }
      >
        <div className="mx-auto max-w-3xl px-6 py-5">
          {mode === 'raw' ? (
            <CodeMirror value={rawDraft} language="markdown" onChange={setRawDraft} diagnostics={issues} minHeight="420px" />
          ) : (
            <div className="space-y-5">
              {create && (
                <Field label="Name" hint={`Saved as ${type === 'skills' ? `skills/${slug || 'name'}/SKILL.md` : `${type}/${slug || 'name'}.md`}`}>
                  <Input mono value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^A-Za-z0-9._-]/g, '-'))} placeholder="my-agent" autoFocus />
                </Field>
              )}
              {type !== 'commands' && (
                <Field label="Description" hint="How Claude decides when to use this.">
                  <Textarea
                    rows={6}
                    className="min-h-[8rem] resize-y"
                    value={(fm.description as string) ?? ''}
                    onChange={(e) => setField('description', e.target.value)}
                    placeholder="What it does and when to use it…"
                  />
                </Field>
              )}
              {type === 'agents' && (
                <div className="flex flex-wrap gap-6">
                  <Field label="Model" hint="Which model the subagent runs on.">
                    <SegmentedControl
                      value={(fm.model as string) ?? 'sonnet'}
                      onChange={(v) => setField('model', v)}
                      options={MODEL_OPTIONS}
                    />
                  </Field>
                  <Field label="Color" hint="UI accent (optional).">
                    <Input value={(fm.color as string) ?? ''} onChange={(e) => setField('color', e.target.value)} placeholder="cyan" className="w-36" />
                  </Field>
                </div>
              )}
              {type === 'commands' && (
                <Field label="Description" hint="Optional one-liner shown in the command list.">
                  <Input value={(fm.description as string) ?? ''} onChange={(e) => setField('description', e.target.value)} placeholder="Commit staged changes" />
                </Field>
              )}
              <Field label={meta.bodyLabel} hint={meta.bodyHint}>
                <CodeMirror value={body} language="markdown" onChange={setBody} diagnostics={issues} minHeight="320px" />
              </Field>
            </div>
          )}
        </div>
      </EditorFrame>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${meta.singular}?`}
        description={`This deletes "${name}". A backup is kept and can be restored.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          try {
            await del.mutateAsync(name!);
            toast.success(`${meta.singular} deleted`);
            navigate(`/scope/${scopeId}/${type}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Delete failed');
          }
        }}
      />
    </>
  );
}
