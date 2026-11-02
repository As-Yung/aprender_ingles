/**
 * Voz con la Web Speech API del navegador.
 * - Síntesis (TTS): local en el dispositivo, sin enviar datos.
 * - Reconocimiento: en Chrome el audio se procesa en servidores del navegador; se pide
 *   permiso de micrófono y solo se usa cuando el usuario pulsa "Hablar".
 */
export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === lang && /google|natural|samantha|daniel/i.test(v.name)) ??
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.startsWith(lang.slice(0, 2)))
  );
}

export function speak(text: string, opts: { rate?: number; lang?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang ?? 'en-US';
    u.rate = opts.rate ?? 0.95;
    const voice = pickVoice(u.lang);
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking(): void {
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
