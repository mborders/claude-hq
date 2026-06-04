import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { History, Code2, LayoutPanelLeft, EyeOff } from 'lucide-react';
import { Badge, Button, CopyButton, SegmentedControl } from './ui';
import { useDirtyRegistration } from '../hooks/useDirtyRegistration';
import { BackupsModal } from './BackupsModal';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div>
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PathChip({ path }: { path: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
      {path}
      <CopyButton value={path} className="h-4 w-4" />
    </span>
  );
}

export interface EditorFrameProps {
  regKey: string;
  title: ReactNode;
  relPath?: string;
  dirty: boolean;
  saving?: boolean;
  issuesCount?: number;
  readOnly?: boolean;
  redactedFields?: string[];
  mode?: 'form' | 'raw';
  onModeChange?: (m: 'form' | 'raw') => void;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function EditorFrame({
  regKey,
  title,
  relPath,
  dirty,
  saving,
  issuesCount = 0,
  readOnly,
  redactedFields,
  mode,
  onModeChange,
  onSave,
  onDiscard,
  headerExtra,
  children,
}: EditorFrameProps) {
  useDirtyRegistration(regKey, dirty, { save: onSave, discard: onDiscard });
  const { scopeId = 'global' } = useParams();
  const [backupsOpen, setBackupsOpen] = useState(false);

  return (
    <>
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl text-ink">{title}</h1>
            {readOnly && (
              <Badge tone="neutral">
                <EyeOff className="h-3 w-3" /> read-only
              </Badge>
            )}
          </div>
          {relPath && (
            <div className="mt-1">
              <PathChip path={relPath} />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {redactedFields && redactedFields.length > 0 && (
            <Badge tone="warning">
              <EyeOff className="h-3 w-3" /> {redactedFields.length} secret{redactedFields.length === 1 ? '' : 's'} hidden
            </Badge>
          )}
          {issuesCount > 0 && <Badge tone="danger">{issuesCount} issue{issuesCount === 1 ? '' : 's'}</Badge>}
          {dirty && issuesCount === 0 && <Badge tone="clay">unsaved</Badge>}
          {headerExtra}
          {mode && onModeChange && (
            <SegmentedControl
              value={mode}
              onChange={onModeChange}
              options={[
                { value: 'form', label: <span className="flex items-center gap-1"><LayoutPanelLeft className="h-3.5 w-3.5" /> Form</span> },
                { value: 'raw', label: <span className="flex items-center gap-1"><Code2 className="h-3.5 w-3.5" /> Raw</span> },
              ]}
            />
          )}
          {relPath && (
            <Button size="sm" variant="ghost" onClick={() => setBackupsOpen(true)}>
              <History className="h-4 w-4" /> Backups
            </Button>
          )}
          {!readOnly && (
            <>
              <Button size="sm" variant="ghost" onClick={onDiscard} disabled={!dirty}>
                Discard
              </Button>
              <Button size="sm" variant="primary" onClick={() => void onSave()} disabled={!dirty || issuesCount > 0} loading={saving}>
                Save
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
      {relPath && (
        <BackupsModal scopeId={scopeId} relPath={relPath} open={backupsOpen} onOpenChange={setBackupsOpen} />
      )}
    </>
  );
}
