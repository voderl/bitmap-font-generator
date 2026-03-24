import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    platform: 'node',
    external: ['@napi-rs/canvas', 'opentype.js'],
  },
  {
    entry: { 'runtime/index': 'runtime/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    platform: 'browser',
    external: ['pixi.js'],
  },
]);
