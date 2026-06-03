import { useEffect, useRef } from 'react';
import { useDirty, type EditorHandlers } from '../lib/stores';

/**
 * Register an editor's dirty state + save/discard handlers with the global
 * store so the SaveBar and navigation guard can drive it. Handlers are kept in
 * a ref so the registration is stable across renders.
 */
export function useDirtyRegistration(key: string, dirty: boolean, handlers: EditorHandlers): void {
  const setDirty = useDirty((s) => s.setDirty);
  const clear = useDirty((s) => s.clear);
  const register = useDirty((s) => s.registerHandlers);
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    setDirty(key, dirty);
  }, [key, dirty, setDirty]);

  useEffect(() => {
    register(key, {
      save: () => ref.current.save(),
      discard: () => ref.current.discard(),
    });
    return () => {
      register(key, null);
      clear(key);
    };
  }, [key, register, clear]);
}
