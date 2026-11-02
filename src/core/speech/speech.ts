/**
 * Voz con la Web Speech API del navegador.
 * - Síntesis (TTS): usa las voces del navegador/sistema. Se eligen automáticamente las más
 *   naturales (neuronales). Las voces "Online/Natural" de Edge y las de Google envían el
 *   texto (frases del curso, nunca datos personales) a los servidores del navegador.
 * - Reconocimiento: en Chrome el audio se procesa en servidores del navegador; se pide
 *   permiso de micrófono y solo se usa cuando el usuario pulsa "Hablar".
 */
import { readJson, writeJson } from '../security/storage';
import { normalizeSpeechText } from './catalog';

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Hay alguna forma de reproducir voz (audio pregenerado o síntesis del navegador). */
export function canPlayAudio(): boolean {
  return typeof window !== 'undefined' && (typeof Audio !== 'undefined' || canSpeak());
}

/* ------------------------------------------------------------------ */
/* Elección de voz: se prefieren las voces neuronales/naturales.       */
/* ------------------------------------------------------------------ */

const PREF_KEY = 'aprender-ingles.voice';

export interface VoicePrefs {
  /** 'natural' = audios pregenerados con la voz neuronal libre Kokoro; 'browser' = voces del dispositivo. */
  engine: 'natural' | 'browser';
  /** voiceURI elegida por el usuario (vacío = automática). */
  voiceURI: string;
  /** voiceURI de la segunda voz para diálogos (vacío = automática). */
  partnerURI: string;
  /** Velocidad base (1 = natural). */
  rate: number;
}

export function getVoicePrefs(): VoicePrefs {
  const p = readJson<Partial<VoicePrefs>>('local', PREF_KEY, {});
  const rate = typeof p.rate === 'number' && p.rate >= 0.5 && p.rate <= 1.5 ? p.rate : 1;
  return {
    engine: p.engine === 'browser' ? 'browser' : 'natural',
    voiceURI: typeof p.voiceURI === 'string' ? p.voiceURI : '',
    partnerURI: typeof p.partnerURI === 'string' ? p.partnerURI : '',
    rate,
  };
}

export function setVoicePrefs(p: Partial<VoicePrefs>): VoicePrefs {
  const next = { ...getVoicePrefs(), ...p };
  writeJson('local', PREF_KEY, next);
  return next;
}

/** Voces de "efectos" o muy robóticas que nunca se eligen automáticamente. */
const NOVELTY =
  /espeak|compact|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|pipe organ|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;

/**
 * Puntúa una voz según lo natural que suele sonar. Las voces "Natural"/"Online" de
 * Microsoft Edge, las "Premium/Enhanced" de Apple y las de Google son neuronales.
 */
export function scoreVoice(v: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -1000;
  let s = 0;
  if (lang === 'en-us') s += 20;
  else if (lang === 'en-gb' || lang === 'en-ca' || lang === 'en-au') s += 12;
  else s += 5;
  const n = v.name.toLowerCase();
  if (/natural|neural/.test(n)) s += 60;
  if (/online/.test(n)) s += 15;
  if (/premium|enhanced|mejorad|siri/.test(n)) s += 50;
  if (/google/.test(n)) s += 35;
  if (/\b(aria|jenny|guy|ava|andrew|emma|brian|michelle|christopher|eric|steffan|samantha|alex|allison|zoe|evan|nathan|tom|susan|daniel|serena|libby|sonia|ryan)\b/.test(n)) s += 10;
  if (NOVELTY.test(n)) s -= 200;
  return s;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Las voces se cargan de forma asíncrona (sobre todo en Chrome): esperamos a que estén. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  let pending = voicesPromise;
  if (!pending) {
    pending = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const done = () => {
        const list = window.speechSynthesis.getVoices();
        if (list.length) {
          window.speechSynthesis.removeEventListener('voiceschanged', done);
          resolve(list);
        }
      };
      window.speechSynthesis.addEventListener('voiceschanged', done);
      // Algunos navegadores nunca disparan el evento: no bloqueamos más de 1,5 s.
      setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', done);
        resolve(window.speechSynthesis.getVoices());
      }, 1500);
    }).then((list) => {
      if (!list.length) voicesPromise = null;
      return list;
    });
    voicesPromise = pending;
  }
  return pending;
}

/** Voces en inglés ordenadas de más a menos natural. */
export async function englishVoices(): Promise<SpeechSynthesisVoice[]> {
  const list = await loadVoices();
  return list
    .filter((v) => scoreVoice(v) > -1000)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
}

export function isNaturalVoice(v: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>): boolean {
  return scoreVoice(v) >= 50;
}

/** Devuelve la voz principal (0) o la del segundo interlocutor (1). */
async function pickVoice(speaker: 0 | 1): Promise<SpeechSynthesisVoice | undefined> {
  const voices = await englishVoices();
  if (!voices.length) return undefined;
  const prefs = getVoicePrefs();
  const main = voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0];
  if (speaker === 0) return main;
  const partner = voices.find((v) => v.voiceURI === prefs.partnerURI && v !== main);
  if (partner) return partner;
  // Segunda mejor voz distinta, preferiblemente del mismo "tipo" (natural) y acento.
  return voices.find((v) => v !== main && v.lang === main?.lang) ?? voices.find((v) => v !== main) ?? main;
}

/**
 * Trocea textos largos por frases: algunas voces de Chrome se cortan a los ~15 s y,
 * además, las pausas entre frases suenan más naturales.
 */
export function splitForSpeech(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + p).length > 180 && buf) {
      out.push(buf.trim());
      buf = '';
    }
    buf += p;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [text];
}

/* ------------------------------------------------------------------ */
/* Voz natural: audios pregenerados (Kokoro) servidos con la web.       */
/* ------------------------------------------------------------------ */

interface AudioManifest {
  voices: Record<string, string>;
  ids: Set<string>;
}
let manifestPromise: Promise<AudioManifest | null> | null = null;

function audioBase(): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}audio/`;
}

export function loadAudioManifest(): Promise<AudioManifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${audioBase()}manifest.json`, { cache: 'no-cache' })
      .then(async (r) => {
        if (!r.ok) return null;
        const m = (await r.json()) as { voices?: Record<string, string>; files?: string[] };
        if (!m.voices || !Array.isArray(m.files)) return null;
        return { voices: m.voices, ids: new Set(m.files) };
      })
      .catch(() => null);
  }
  return manifestPromise;
}

/** Mismo nombre de archivo que scripts/generate-audio.py: sha256(voz + "\n" + texto)[:16]. */
export async function audioId(voice: string, text: string): Promise<string> {
  const data = new TextEncoder().encode(`${voice}\n${normalizeSpeechText(text)}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let audioEl: HTMLAudioElement | null = null;

/** Devuelve true si se reprodujo (o se canceló) con la voz natural; false si hay que usar el navegador. */
async function playNatural(text: string, slot: 0 | 1, rate: number, token: number): Promise<boolean> {
  try {
    const m = await loadAudioManifest();
    const voice = m?.voices[String(slot)];
    if (!m || !voice) return false;
    const id = await audioId(voice, text);
    if (!m.ids.has(id)) return false;
    if (token !== speakToken) return true;
    const a = (audioEl ??= new Audio());
    a.pause();
    a.src = `${audioBase()}${id}.mp3`;
    a.preservesPitch = true;
    a.playbackRate = rate;
    return await new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        a.onended = a.onerror = a.onpause = null;
        resolve(ok);
      };
      a.onended = () => done(true);
      a.onpause = () => done(true);
      a.onerror = () => done(false);
      a.play().catch(() => done(false));
    });
  } catch {
    return false;
  }
}

let speakToken = 0;

export interface SpeakOptions {
  /** Multiplicador sobre la velocidad elegida por el usuario (p. ej. 0.75 = despacio). */
  rate?: number;
  /** 0 = voz principal, 1 = segunda voz (para el otro personaje de un diálogo). */
  speaker?: 0 | 1;
  /** Fuerza una voz concreta (para probar voces en Ajustes). */
  voiceURI?: string;
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!text.trim()) return;
  const token = ++speakToken;
  audioEl?.pause();
  if (canSpeak()) window.speechSynthesis.cancel();
  const prefs0 = getVoicePrefs();
  if (prefs0.engine === 'natural' && !opts.voiceURI) {
    const r = Math.min(1.5, Math.max(0.5, prefs0.rate * (opts.rate ?? 1)));
    if (await playNatural(text, opts.speaker ?? 0, r, token)) return;
    if (token !== speakToken) return;
  }
  if (!canSpeak()) return;
  const voices = opts.voiceURI ? await englishVoices() : [];
  const voice = voices.find((v) => v.voiceURI === opts.voiceURI) ?? (await pickVoice(opts.speaker ?? 0));
  if (token !== speakToken) return; // otra llamada más reciente tomó el control
  const prefs = getVoicePrefs();
  const rate = Math.min(1.5, Math.max(0.5, prefs.rate * (opts.rate ?? 1)));
  for (const chunk of splitForSpeech(text)) {
    if (token !== speakToken) return;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = voice?.lang ?? 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }
}

export function stopSpeaking(): void {
  speakToken++;
  audioEl?.pause();
  if (canSpeak()) window.speechSynthesis.cancel();
}

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function getRecognition(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function canListen(): boolean {
  return typeof window !== 'undefined' && Boolean(getRecognition());
}

export function listenOnce(lang = 'en-US'): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getRecognition();
    if (!Ctor) return reject(new Error('Reconocimiento de voz no disponible en este navegador.'));
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    let done = false;
    r.onresult = (e) => {
      done = true;
      resolve(e.results[0]?.[0]?.transcript ?? '');
    };
    r.onerror = () => {
      if (!done) reject(new Error('No se pudo reconocer la voz. Revisa el permiso del micrófono.'));
    };
    r.onend = () => {
      if (!done) resolve('');
    };
    r.start();
  });
}

/** Normaliza para comparar frases (minúsculas, sin puntuación). */
export function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud por palabras (0..1) para evaluar pronunciación/dictado de forma tolerante. */
export function similarity(expected: string, actual: string): number {
  const a = normalizeSentence(expected).split(' ').filter(Boolean);
  const b = normalizeSentence(actual).split(' ').filter(Boolean);
  if (a.length === 0) return b.length === 0 ? 1 : 0;
  // distancia de Levenshtein por palabras
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const dist = dp[a.length]![b.length]!;
  return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}
