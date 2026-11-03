#!/usr/bin/env node
/**
 * Escribe en un JSON todas las frases que la app puede pronunciar (para generar los audios).
 * Uso: node scripts/collect-speech.mjs build/speech.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';

const outFile = process.argv[2] ?? 'build/speech.json';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { loadAllLevels } = await server.ssrLoadModule('/src/content/index.ts');
  const { loadAllLabs } = await server.ssrLoadModule('/src/content/labs/index.ts');
  const { collectSpeech } = await server.ssrLoadModule('/src/core/speech/catalog.ts');
  const items = collectSpeech(await loadAllLevels(), await loadAllLabs());
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(items, null, 0));
  console.log(`✔ ${items.length} frases → ${outFile}`);
} finally {
  await server.close();
}
