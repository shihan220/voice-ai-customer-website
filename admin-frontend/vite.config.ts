import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    emptyOutDir: true,
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5174',
      '/media': 'http://127.0.0.1:5174',
    },
  },
});
