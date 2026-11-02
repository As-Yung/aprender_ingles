/**
 * Modelo de contenido. Añadir un tema = añadir un objeto Topic en src/content/levels/<nivel>.ts.
 * Las secciones de la app (src/modules) leen de este modelo; no hay HTML en el contenido
 * (todo se renderiza como texto, lo que evita inyección de HTML/XSS desde el contenido).
 */
export type LevelId = 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2';

export interface VocabItem {
  term: string;
  es: string;
  emoji: string;
  ipa?: string;
  /** Agrupa las tarjetas visuales (p. ej. "Saludos", "Despedidas"). */
  category: string;
  example: string;
  exampleEs: string;
}

export type NoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'formula'; label?: string; parts: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'examples'; items: { en: string; es: string }[] }
  | { kind: 'tip'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'list'; items: string[] };

export interface DialogueLine {
  speaker: string;
  en: string;
  es: string;
}

export interface Conversation {
  title: string;
  context: string;
  lines: DialogueLine[];
  usefulPhrases: { en: string; es: string }[];
}

export interface Question {
  prompt: string;
  options: string[];
  answer: number;
  explanation?: string;
}

export interface Reading {
  title: string;
  paragraphs: string[];
  translation: string[];
  /** Palabras o expresiones (en minúsculas) con su glosa en español. */
  glossary: Record<string, string>;
  questions: Question[];
}

export interface Topic {
  id: string;
  title: string;
  titleEs: string;
  emoji: string;
  grammarFocus: string;
  summary: string;
  /** Puntos clave para la tarjeta de repaso y el resumen. */
  keyPoints: string[];
  vocabulary: VocabItem[];
  notes: NoteBlock[];
  conversation: Conversation;
  reading: Reading;
  quiz: Question[];
  /** Frases para dictado (comprensión auditiva). Si falta, se usan los ejemplos del vocabulario. */
  dictation?: string[];
}

export interface Level {
  id: LevelId;
  name: string;
  label: string;
  description: string;
  color: string;
  canDo: string[];
  topics: Topic[];
}

export interface LevelMeta {
  id: LevelId;
  name: string;
  label: string;
  description: string;
  color: string;
}
