import { QuizRunner } from '../../components/QuizRunner';
import type { SectionProps } from '../types';

export default function QuizSection({ topic, onComplete }: SectionProps) {
  return <QuizRunner key={topic.id} title={`Self-check: ${topic.title}`} questions={topic.quiz} onFinish={onComplete} />;
}
