import { canSpeak, speak } from '../core/speech/speech';

export function SpeakButton({ text, rate, label = 'Escuchar', small }: { text: string; rate?: number; label?: string; small?: boolean }) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      className={small ? 'icon-btn icon-btn--small' : 'icon-btn'}
      onClick={(e) => {
        e.stopPropagation();
        void speak(text, { rate });
      }}
      aria-label={`${label}: ${text}`}
      title={label}
    >
      🔊
    </button>
  );
}
