// A tiny in-process mutex keyed by absolute path, so concurrent writes to the
// same file from this server serialize. External (out-of-band) edits are caught
// separately by the sha256 concurrency check.
const tails = new Map<string, Promise<void>>();

export async function withFileLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  tails.set(key, mine);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === mine) tails.delete(key);
  }
}
