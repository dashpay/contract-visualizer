import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project site under /<repo>/, but that subpath only
// matters for the production build. Local dev/preview serve from "/". Override
// the build base with VITE_BASE (e.g. "/" for a custom domain or Vercel).
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/contract-visualizer/') : '/',
  plugins: [react()],
  // The Evo SDK is a single large ESM module with the Dash Platform WASM
  // inlined (via @dashevo/wasm-sdk/compressed). Pre-bundling it with esbuild
  // is slow and unnecessary, and esbuild must allow top-level await + BigInt.
  optimizeDeps: {
    exclude: ['@dashevo/evo-sdk', '@dashevo/wasm-sdk'],
    esbuildOptions: { target: 'esnext' },
  },
  build: {
    target: 'esnext',
    // The SDK chunk carries the inlined WASM payload (about 13 MB); it is
    // loaded on the first network fetch only. Raise the warning ceiling so CI
    // logs stay readable.
    chunkSizeWarningLimit: 16000,
  },
}));
