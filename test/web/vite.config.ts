import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/demo/bitmap-font-generator/',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      'bitmap-font-generator/runtime': resolve(__dirname, '../../runtime/index.ts'),
      'bitmap-font-generator': resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        bench: resolve(__dirname, 'bench.html'),
      },
    },
  },
});
