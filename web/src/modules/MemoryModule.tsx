import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useMemoryDoc, useMemoryList, useWriteMemory } from '../lib/queries';
import { ApiClientError } from '../lib/api';
import { Spinner, EmptyState } from '../components/ui';
import { EditorFrame } from '../components/Editor';
import { CodeMirror } from '../components/CodeMirror';
import { cn } from '../lib/cn';
import { BookText } from 'lucide-react';

export function MemoryModule() {
  const { scopeId = 'global' } = useParams();
  const list = useMemoryList(scopeId);
  const docs = list.data?.docs ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const relPath = selected ?? docs[0]?.relPath ?? null;

  const doc = useMemoryDoc(scopeId, relPath ?? '', !!relPath);
  const write = useWriteMemory(scopeId);

  const [text, setText] = useState('');
  const [baseline, setBaseline] = useState('');
  const [loadedKey, setLoadedKey] = useState('');

  useEffect(() => {
    if (doc.data && relPath && loadedKey !== relPath) {
      setText(doc.data.raw);
      setBaseline(doc.data.raw);
      setLoadedKey(relPath);
    }
  }, [doc.data, relPath, loadedKey]);

  const dirty = text !== baseline && loadedKey === relPath;

  const save = async () => {
    if (!relPath) return;
    try {
      await write.mutateAsync({ relPath, raw: text, expectedSha256: doc.data?.meta.sha256 });
      toast.success('Memory saved');
      setBaseline(text);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : 'Save failed');
    }
  };

  if (list.isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (docs.length === 0) {
    return (
      <div className="px-6 py-10">
        <EmptyState icon={<BookText className="h-8 w-8" />} title="No memory file" description="Create a CLAUDE.md to give Claude persistent project context." />
      </div>
    );
  }

  return (
    <EditorFrame
      regKey={`${scopeId}:memory:${relPath}`}
      title="Memory"
      relPath={relPath ?? undefined}
      dirty={dirty}
      saving={write.isPending}
      onSave={save}
      onDiscard={() => setText(baseline)}
      headerExtra={
        docs.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {docs.map((d) => (
              <button
                key={d.relPath}
                onClick={() => setSelected(d.relPath)}
                className={cn(
                  'rounded-sm px-2 py-1 font-mono text-[11px] transition-colors',
                  d.relPath === relPath ? 'bg-clay-soft text-clay' : 'bg-bg-subtle text-ink-muted hover:text-ink',
                )}
                title={d.relPath}
              >
                {d.relPath.split('/').pop()}
              </button>
            ))}
          </div>
        )
      }
    >
      <div className="mx-auto h-full max-w-3xl px-6 py-5">
        {doc.isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <CodeMirror value={text} language="markdown" onChange={setText} minHeight="60vh" />
        )}
      </div>
    </EditorFrame>
  );
}
