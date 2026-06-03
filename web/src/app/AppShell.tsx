import { useEffect } from 'react';
import { Outlet, useBlocker } from 'react-router-dom';
import { ScopeSidebar } from './ScopeSidebar';
import { ModuleNav } from './ModuleNav';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { applyTheme, useTheme, useAnyDirty, useDirty } from '../lib/stores';
import { Modal } from '../components/Dialog';
import { Button } from '../components/ui';

export function AppShell() {
  const theme = useTheme((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(useTheme.getState().theme);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-ink">
      <ScopeSidebar />
      <ModuleNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <UnsavedGuard />
    </div>
  );
}

function UnsavedGuard() {
  const { count, keys } = useAnyDirty();
  const handlers = useDirty((s) => s.handlers);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => count > 0 && currentLocation.pathname !== nextLocation.pathname,
  );
  const open = blocker.state === 'blocked';

  const saveAndGo = async () => {
    for (const k of keys) {
      try {
        await handlers[k]?.save();
      } catch {
        return; // keep blocking on failure
      }
    }
    blocker.proceed?.();
  };
  const discardAndGo = () => {
    for (const k of keys) handlers[k]?.discard();
    blocker.proceed?.();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) blocker.reset?.();
      }}
      title="Unsaved changes"
      description={`You have ${count} unsaved change${count === 1 ? '' : 's'} here.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            Cancel
          </Button>
          <Button variant="danger" onClick={discardAndGo}>
            Discard
          </Button>
          <Button variant="primary" onClick={() => void saveAndGo()}>
            Save &amp; continue
          </Button>
        </>
      }
    />
  );
}
