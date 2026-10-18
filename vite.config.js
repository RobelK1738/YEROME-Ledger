import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the React SPA. The `api/` directory is deployed as
// Vercel serverless functions and is intentionally excluded from the client bundle.
//
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
