import { defineConfig } from 'vitest/config';

// base: './' — чтобы сборка работала и на GitHub Pages (в подпапке), и на itch.io, и из zip.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    // Phaser весит ~1,2 МБ в минифицированном виде — это ожидаемо, предупреждение не нужно.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
