import { useLocation, useParams } from 'react-router-dom';
import { Command, Moon, Sun, Monitor, ChevronRight } from 'lucide-react';
import { useScopes } from '../lib/queries';
import { useTheme, useUi, applyTheme } from '../lib/stores';
import { MODULES } from './modules';
import { Kbd } from '../components/ui';
import { SaveBar } from './SaveBar';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function TopBar() {
  const { scopeId = 'global' } = useParams();
  const { data } = useScopes();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  const scopeLabel = scopeId === 'global' ? 'Global' : data?.projects.find((p) => p.id === scopeId)?.name ?? 'Project';
  const moduleSeg = location.pathname.split('/').pop();
  const moduleLabel = MODULES.find((m) => m.path === moduleSeg)?.label;

  const ThemeIcon = THEME_ICON[theme];
  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="font-medium text-ink">{scopeLabel}</span>
        {moduleLabel && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-ink-subtle" />
            <span className="text-ink-muted">{moduleLabel}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={() => setPaletteOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink-subtle transition-colors hover:border-border-strong hover:text-ink-muted focus-ring"
      >
        <Command className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Jump to…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <SaveBar />

      <button
        onClick={cycleTheme}
        className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-clay-soft hover:text-clay focus-ring"
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
      >
        <ThemeIcon className="h-4 w-4" />
      </button>
    </header>
  );
}
