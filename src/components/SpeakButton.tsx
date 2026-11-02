import { canPlayAudio, speak } from '../core/speech/speech';

export function SpeakButton({
  text,
  rate,
  label = 'Escuchar',
  small,
  speaker,
}: {
  text: string;
  rate?: number;
  label?: string;
  small?: boolean;
  /** 0 = voz principal, 1 = segunda voz (otro personaje). */
  speaker?: 0 | 1;
}) {
  if (!canPlayAudio()) return null;
  return (
    <button
      type="button"
      className={small ? 'icon-btn icon-btn--small' : 'icon-btn'}
      onClick={(e) => {
        e.stopPropagation();
        void speak(text, { rate, speaker });
      }}
      aria-label={`${label}: ${text}`}
      title={label}
    >
      🔊
    </button>
  );
}
