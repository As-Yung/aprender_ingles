import { lazy } from 'react';
import type { LearningModule } from './types';

/**
 * Registro de secciones de aprendizaje. Para añadir una nueva funcionalidad:
 *   1. Crea src/modules/<id>/<Nombre>Section.tsx que reciba SectionProps.
 *   2. Añádela aquí. El enrutado, la navegación y el progreso se generan solos.
 */
export const MODULES: LearningModule[] = [
  {
    id: 'tarjetas',
    label: 'Visual cards',
    emoji: '🖼️',
    description: 'Vocabulary infographics and a topic recap, ready to print.',
    component: lazy(() => import('./visual-cards/VisualCardsSection')),
  },
  {
    id: 'apuntes',
    label: 'Notes & summary',
    emoji: '📒',
    description: 'Notebook-style notes with formulas, tables, tips and common mistakes.',
    component: lazy(() => import('./notes/NotesSection')),
  },
  {
    id: 'vocabulario',
    label: 'Vocabulary',
    emoji: '🧠',
    description: 'Learn, review with spaced repetition and practice.',
    component: lazy(() => import('./vocabulary/VocabularySection')),
  },
  {
    id: 'practica',
    label: 'Visual practice',
    emoji: '🎮',
    description: 'Mini-games: match, listen & pick, fill the gap, build sentences and sort.',
    component: lazy(() => import('./practice/PracticeSection')),
    isAvailable: (t) => t.vocabulary.length >= 4,
  },
  {
    id: 'lab',
    label: 'Hands-on Lab',
    emoji: '🧪',
    description: 'Real tech situations: team chats, spot the mistake, flow diagrams, screens to read, memory, spelling bee and speed run.',
    component: lazy(() => import('./lab/LabSection')),
    isAvailable: (t) => t.vocabulary.length >= 4,
  },
  {
    id: 'conversacion',
    label: 'Conversation',
    emoji: '💬',
    description: 'Dialogue with audio, plus role-play speaking out loud.',
    component: lazy(() => import('./conversation/ConversationSection')),
  },
  {
    id: 'lectura',
    label: 'Guided reading',
    emoji: '📖',
    description: 'Tap any word to see its meaning and listen to the text.',
    component: lazy(() => import('./reading/ReadingSection')),
  },
  {
    id: 'dictado',
    label: 'Dictation',
    emoji: '🎧',
    description: 'Listen and type to train your ear.',
    component: lazy(() => import('./dictation/DictationSection')),
  },
  {
    id: 'evaluacion',
    label: 'Self-check',
    emoji: '✅',
    description: 'Check what you learned with explained answers.',
    component: lazy(() => import('./quiz/QuizSection')),
    isAvailable: (t) => t.quiz.length > 0,
  },
];

export function findModule(id: string | undefined): LearningModule | undefined {
  return MODULES.find((m) => m.id === id);
}
