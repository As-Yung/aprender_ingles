#!/usr/bin/env node
/**
 * Prepara .env.local para desarrollo (Codespaces o local) en MODO LOCAL.
 * Toma la contraseña inicial del admin del secreto de Codespaces ADMIN_INITIAL_PASSWORD.
 * .env.local está en .gitignore: nunca se sube al repositorio.
 */
import { existsSync, writeFileSync } from 'node:fs';

const file = '.env.local';
if (existsSync(file) && !process.argv.includes('--force')) {
  console.log(`ℹ ${file} ya existe; no se modifica (usa --force para regenerarlo).`);
  process.exit(0);
}
const pw = process.env.ADMIN_INITIAL_PASSWORD ?? '';
const lines = [
  '# Generado por scripts/setup-local-env.mjs — NO subir al repositorio',
  'VITE_AUTH_MODE=local',
  `VITE_LOCAL_ADMIN_PASSWORD=${pw}`,
];
writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log(
  pw
    ? '✔ .env.local creado con la contraseña del secreto ADMIN_INITIAL_PASSWORD.'
    : '⚠ .env.local creado SIN contraseña de admin. Edítalo y rellena VITE_LOCAL_ADMIN_PASSWORD (o crea el secreto de Codespaces ADMIN_INITIAL_PASSWORD).',
);
