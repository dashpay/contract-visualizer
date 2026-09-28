import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server reads `?url` as its asset-import query and refuses a page
// request carrying it (403, outside the serving allow list). Serve the app for
// such requests; the browser keeps the query, which the app reads (?url=<link
// to a contract JSON file>). Static hosting (Pages, `vite preview`) is unaffected.
const pageUrlParam: Plugin = {
  name: 'page-url-param',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/(?:index\.html)?\?(?:[^#]*&)?url=/.test(req.url)) req.url = '/';
      next();
    });
  },
};

// GitHub Pages serves a project site under /<repo>/, but that subpath only
// matters for the production build. Local dev/preview serve from "/". Override
// the build base with VITE_BASE (e.g. "/" for a custom domain or Vercel).
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/contract-visualizer/') : '/',
  plugins: [react(), pageUrlParam],
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
