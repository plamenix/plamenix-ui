import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      rollupTypes: false,
      tsconfigPath: './tsconfig.json',
    }),
  ],
  build: {
    lib: {
      // Multi-entry library: the main shell + the standalone plugin-
      // author SDK live as separate ESM bundles so plugin authors do
      // not pull in the full UI surface when they only need the React
      // SDK. Both are produced from the same `src/` tree to defer the
      // workspace split per `CLAUDE.md` guidance.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'plugin-react': resolve(__dirname, 'src/plugin-react/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.mjs`,
    },
    rollupOptions: {
      // Externalised in both entry bundles. The shell edition wires
      // host-provided modules to these specifiers via an import map
      // at boot so plugin bundles share the host's React + icon
      // instances (Hooks rules + Context only work when React is
      // shared by identity). The recipe is documented in
      // `plamenix/docs/plugin-authoring.md`.
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react'],
      output: {
        preserveModules: false,
      },
    },
    sourcemap: true,
    target: 'es2022',
    minify: false,
  },
});
