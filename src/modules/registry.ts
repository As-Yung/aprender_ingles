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
    label: 'Tarjetas visuales',
    emoji: '🖼️',
    description: 'Infografías de vocabulario y repaso del tema, listas para imprimir.',
    component: lazy(() => import('./visual-cards/VisualCardsSection')),
  },
  {
    id: 'apuntes',
    label: 'Apuntes y resumen',
    emoji: '📒',
    description: 'Apuntes tipo cuaderno con fórmulas, tablas, trucos y errores comunes.',
    component: lazy(() => import('./notes/NotesSection')),
  },
  {
    id: 'vocabulario',
    label: 'Vocabulario',
    emoji: '🧠',
    description: 'Aprende, repasa con repetición espaciada y practica.',
    component: lazy(() => import('./vocabulary/VocabularySection')),
  },
  {
    id: 'practica',
    label: 'Práctica visual',
    emoji: '🎮',
    description: 'Mini‑juegos: emparejar, escuchar y elegir, completar, ordenar frases y clasificar.',
    component: lazy(() => import('./practice/PracticeSection')),
    isAvailable: (t) => t.vocabulary.length >= 4,
  },
  {
    id: 'conversacion',
    label: 'Conversación',
    emoji: '💬',
    description: 'Diálogo con audio y juego de roles hablando en voz alta.',
    component: lazy(() => import('./conversation/ConversationSection')),
  },
  {
    id: 'lectura',
    label: 'Lectura asistida',
    emoji: '📖',
    description: 'Toca cualquier palabra para ver su significado y escucha el texto.',
    component: lazy(() => import('./reading/ReadingSection')),
  },
  {
    id: 'dictado',
    label: 'Dictado',
    emoji: '🎧',
    description: 'Escucha y escribe para entrenar el oído.',
    component: lazy(() => import('./dictation/DictationSection')),
  },
  {
    id: 'evaluacion',
    label: 'Autoevaluación',
    emoji: '✅',
    description: 'Comprueba lo aprendido con preguntas explicadas.',
    component: lazy(() => import('./quiz/QuizSection')),
    isAvailable: (t) => t.quiz.length > 0,
  },
];

export function findModule(id: string | undefined): LearningModule | undefined {
  return MODULES.find((m) => m.id === id);
}
