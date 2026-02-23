import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    chunkSizeWarningLimit: 800,
    target: 'es2017',
  },
});
