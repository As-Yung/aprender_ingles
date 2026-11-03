import type { LevelId, Question } from '../types';

/**
 * Hands-on Lab: practical, visual activities written by hand for every topic.
 * All learner-facing text is in English (immersive). Kept apart from the level
 * files so each level's lab loads on demand and can grow without touching topics.
 */

export interface ChatReply {
  text: string;
  ok: boolean;
  /** Short explanation shown after answering. */
  why: string;
}

/** 💬 Team chat: a teammate's message and three possible replies (one is natural and correct). */
export interface ChatTask {
  from: string;
  avatar: string;
  message: string;
  replies: ChatReply[];
}

/** 🔍 Spot the mistake: tap the wrong word, then choose the fix. */
export interface FixTask {
  /** Sentence containing exactly one wrong word (`wrong`, as a whole token). */
  sentence: string;
  wrong: string;
  /** The correct word; an empty string means “remove the word”. */
  right: string;
  /** Other (incorrect) fixes offered next to `right`. */
  alts: string[];
  why: string;
}

/** 🧭 Build the flow: steps of a real process, in the correct order. */
export interface FlowTask {
  title: string;
  steps: { emoji: string; text: string }[];
}

/** 🖥️ Read the screen: a terminal, dashboard, email or chat log with questions. */
export interface ScreenTask {
  kind: 'terminal' | 'dashboard' | 'email' | 'chat';
  title: string;
  lines: string[];
  questions: Question[];
}

export interface TopicLab {
  chats: ChatTask[];
  fixes: FixTask[];
  flow: FlowTask;
  screen: ScreenTask;
}

export type LevelLabs = Record<string, TopicLab>;
export type { LevelId };
