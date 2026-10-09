import { defineConfig } from 'vite';
export default defineConfig({ root: 'web', server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' }, build: { outDir: '../web-dist', emptyOutDir: true, sourcemap: false } });
