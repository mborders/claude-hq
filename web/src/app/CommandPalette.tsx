import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Command } from 'cmdk';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Search, Globe, FolderGit2 } from 'lucide-react';
import { useScopes } from '../lib/queries';
import { useUi, useTheme, applyTheme } from '../lib/stores';
import { MODULES } from './modules';

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const { data } = useScopes();
  const navigate = useNavigate();
  const { scopeId = 'global' } = useParams();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/30 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className="fixed inset-x-0 top-0 z-50 mx-auto mt-[18vh] w-[92vw] max-w-xl animate-scale-in overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          aria-label="Command palette"
        >
          <Command label="Command palette" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-subtle">
            <div className="flex items-center gap-2 border-b border-border px-3.5">
              <Search className="h-4 w-4 text-ink-subtle" />
              <Command.Input
                autoFocus
                placeholder="Jump to a scope or module…"
                className="h-12 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-subtle"
              />
            </div>
            <Command.List className="max-h-80 overflow-auto p-2">
              <Command.Empty className="px-2 py-6 text-center text-sm text-ink-subtle">No results.</Command.Empty>

              <Command.Group heading="Scopes">
                <PaletteItem onSelect={() => run(() => navigate('/scope/global/overview'))}>
                  <Globe className="h-4 w-4 text-ink-subtle" /> Global · ~/.claude
                </PaletteItem>
                {(data?.projects ?? []).map((p) => (
                  <PaletteItem key={p.id} value={`project ${p.name} ${p.path}`} onSelect={() => run(() => navigate(`/scope/${p.id}/overview`))}>
                    <FolderGit2 className="h-4 w-4 text-ink-subtle" /> {p.name}
                  </PaletteItem>
                ))}
              </Command.Group>

              <Command.Group heading="Modules (current scope)">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <PaletteItem key={m.id} value={`module ${m.label}`} onSelect={() => run(() => navigate(`/scope/${scopeId}/${m.path}`))}>
                      <Icon className="h-4 w-4 text-ink-subtle" /> {m.label}
                    </PaletteItem>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Actions">
                <PaletteItem
                  value="toggle theme dark light"
                  onSelect={() =>
                    run(() => {
                      const next = theme === 'dark' ? 'light' : 'dark';
                      setTheme(next);
                      applyTheme(next);
                    })
                  }
                >
                  Toggle theme
                </PaletteItem>
              </Command.Group>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function PaletteItem({ children, onSelect, value }: { children: React.ReactNode; onSelect: () => void; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm text-ink data-[selected=true]:bg-clay-soft data-[selected=true]:text-clay"
    >
      {children}
    </Command.Item>
  );
}
