import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dashboard talks to the Node API. In dev we proxy /health and /api to it
// so the browser avoids CORS and we can use relative URLs in the app.
// The API target defaults to :3000 (the documented default) but can be
// overridden when the API runs elsewhere, e.g. VITE_API_PROXY=http://localhost:3100.
const API_TARGET = process.env.VITE_API_PROXY || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API_TARGET,
      '/health': API_TARGET,
    },
  },
});
