import type { ComponentType, LazyExoticComponent } from 'react';
import type { Level, Topic } from '../content/types';

export interface SectionProps {
  level: Level;
  topic: Topic;
  /** `${levelId}/${topicId}` */
  topicKey: string;
  /** Marca la sección como completada (score opcional 0..100). */
  onComplete: (score?: number) => void;
}

export interface LearningModule {
  id: string;
  label: string;
  emoji: string;
  description: string;
  component: LazyExoticComponent<ComponentType<SectionProps>>;
  /** Permite ocultar el módulo en temas que no tienen el contenido necesario. */
  isAvailable?: (topic: Topic) => boolean;
}
