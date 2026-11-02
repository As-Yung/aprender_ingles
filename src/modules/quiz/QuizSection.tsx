import { QuizRunner } from '../../components/QuizRunner';
import type { SectionProps } from '../types';

export default function QuizSection({ topic, onComplete }: SectionProps) {
  return <QuizRunner key={topic.id} title={`Autoevaluación: ${topic.titleEs}`} questions={topic.quiz} onFinish={onComplete} />;
}
