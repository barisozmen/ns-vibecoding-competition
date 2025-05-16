import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true,
    host: true,
    allowedHosts: [
      'game2.bozmen.xyz',
      // You can add other domains here if needed
    ]
  }
}); 