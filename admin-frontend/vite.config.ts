import 'dotenv/config';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backendPort = process.env.PORT ?? '5174';
const backendUrl = `http://127.0.0.1:${backendPort}`;

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
      '/api': backendUrl,
      '/media': backendUrl,
    },
  },
});
