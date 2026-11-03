/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Inyecta una Content-Security-Policy estricta SOLO en el build de producción.
 * (En desarrollo Vite necesita scripts inline para el hot-reload.)
 * GitHub Pages no permite cabeceras HTTP personalizadas, por eso se usa <meta>.
 */
function securityHeadersPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // AI tutor: the learner's own key goes straight to these three providers (never to our servers).
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    name: 'security-headers',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig({
  // En GitHub Pages el sitio vive en /<repo>/ ; el workflow define BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), securityHeadersPlugin()],
  server: { host: true, port: 5173 },
  build: {
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
