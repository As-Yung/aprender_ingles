import type { Level } from '../../content/types';

/**
 * Catálogo de todo lo que la app puede leer en voz alta. Con él se generan por adelantado
 * los audios de la voz neuronal libre (Kokoro) en GitHub Actions: scripts/generate-audio.py.
 * Si añades un sitio nuevo que llama a speak(), añade aquí su texto.
 */

export const VOICE_SAMPLE =
  'Hey! So, the sensor sends data to the cloud every five seconds. If the connection drops, the device keeps the readings and syncs them later. Pretty cool, right?';
export const PARTNER_SAMPLE = "Got it. I'll check the MQTT broker logs and ping you in a sec.";

/** Voz 0 = principal; voz 1 = segundo personaje de los diálogos. */
export type VoiceSlot = 0 | 1;

export interface SpeechItem {
  voice: VoiceSlot;
  text: string;
}

export const normalizeSpeechText = (t: string) => t.normalize('NFC').trim();

export function collectSpeech(levels: Level[]): SpeechItem[] {
  const out = new Map<string, SpeechItem>();
  const add = (voice: VoiceSlot, text: string | undefined) => {
    if (!text) return;
    const t = normalizeSpeechText(text);
    if (t) out.set(`${voice}\n${t}`, { voice, text: t });
  };
  add(0, VOICE_SAMPLE);
  add(1, PARTNER_SAMPLE);
  for (const level of levels) {
    for (const topic of level.topics) {
      topic.vocabulary.forEach((v) => {
        add(0, v.term);
        add(0, v.example);
      });
      const speakers = [...new Set(topic.conversation.lines.map((l) => l.speaker))];
      topic.conversation.lines.forEach((l) => {
        add(0, l.en); // juego de roles y "ordena la frase" usan la voz principal
        if (speakers.indexOf(l.speaker) % 2) add(1, l.en);
      });
      topic.conversation.usefulPhrases.forEach((p) => add(0, p.en));
      topic.reading.paragraphs.forEach((p) => add(0, p));
      (topic.dictation ?? []).forEach((d) => add(0, d));
      topic.notes.forEach((n) => {
        if (n.kind === 'examples') n.items.forEach((e) => add(0, e.en));
      });
    }
  }
  return [...out.values()];
}
