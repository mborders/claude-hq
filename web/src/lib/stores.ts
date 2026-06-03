import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'ccm-theme' },
  ),
);

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

interface UiState {
  scopeFilter: 'all' | 'configured' | 'unconfigured';
  setScopeFilter: (f: UiState['scopeFilter']) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  scopeFilter: 'all',
  setScopeFilter: (scopeFilter) => set({ scopeFilter }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));

/**
 * App-wide dirty tracking. Each editor registers under a key (its route); the
 * SaveBar reads the aggregate to show "N unsaved" and gate navigation.
 */
export interface EditorHandlers {
  save: () => Promise<void> | void;
  discard: () => void;
}

interface DirtyState {
  dirty: Record<string, boolean>;
  setDirty: (key: string, value: boolean) => void;
  clear: (key: string) => void;
  handlers: Record<string, EditorHandlers>;
  registerHandlers: (key: string, handlers: EditorHandlers | null) => void;
}

export const useDirty = create<DirtyState>((set) => ({
  dirty: {},
  setDirty: (key, value) =>
    set((s) => {
      if (!!s.dirty[key] === value) return s;
      return { dirty: { ...s.dirty, [key]: value } };
    }),
  clear: (key) =>
    set((s) => {
      if (!(key in s.dirty)) return s;
      const next = { ...s.dirty };
      delete next[key];
      return { dirty: next };
    }),
  handlers: {},
  registerHandlers: (key, handlers) =>
    set((s) => {
      const next = { ...s.handlers };
      if (handlers) next[key] = handlers;
      else delete next[key];
      return { handlers: next };
    }),
}));

export function useAnyDirty(): { count: number; keys: string[] } {
  const dirty = useDirty((s) => s.dirty);
  const keys = Object.keys(dirty).filter((k) => dirty[k]);
  return { count: keys.length, keys };
}
