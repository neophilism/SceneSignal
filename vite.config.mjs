import { defineConfig } from 'vite';

// Public browser drafts have no backend. GitHub Pages is a project subpath;
// other hosts (including Render) continue using '/'.
const requestedBase = process.env.SCENESIGNAL_STATIC_BASE_PATH ?? '/';
if (!['/', '/SceneSignal/'].includes(requestedBase)) throw new Error('INVALID_STATIC_BASE_PATH');
export default defineConfig({
  root: 'web',
  base: requestedBase,
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { outDir: '../web-dist', emptyOutDir: true, sourcemap: false }
});
