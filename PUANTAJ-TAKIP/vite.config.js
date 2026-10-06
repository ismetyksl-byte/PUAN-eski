import { defineConfig } from 'vite';

// Vite yapılandırması — Vanilla JS proje.
// base: './' -> Vercel dahil herhangi bir statik host'ta (alt dizin veya
// kök dizin farketmeksizin) doğru çalışan göreli asset yolları üretir.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    port: 4173,
  },
});
