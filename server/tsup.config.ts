import { defineConfig } from 'tsup';

// Bundle the server to a single CJS file so the runtime stage only needs
// production node_modules + this artifact. @claude-hq/shared is workspace TS source,
// so it must be bundled in (noExternal); everything else stays external and is
// resolved from node_modules at runtime.
export default defineConfig({
  entry: { server: 'src/main.ts' },
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  minify: false,
  noExternal: [/@claude-hq\//],
  outExtension() {
    return { js: '.cjs' };
  },
});
