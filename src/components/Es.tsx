import { useState } from 'react';
import { showSpanishFor, useSpanishHelp } from '../core/i18n/spanishHelp';

/**
 * Spanish translation shown according to the "Spanish help" setting.
 * When hidden, the learner can tap to reveal it (English-first immersion).
 */
export function Es({ text, level, className = 'es', block }: { text: string; level?: string; className?: string; block?: boolean }) {
  const mode = useSpanishHelp();
  const [revealed, setRevealed] = useState(false);
  if (!text) return null;
  const Tag = block ? 'p' : 'span';
  if (showSpanishFor(mode, level) || revealed) {
    return (
      <Tag className={className} lang="es">
        {text}
      </Tag>
    );
  }
  return (
    <button
      type="button"
      className="es-reveal"
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      title="Show the Spanish translation"
    >
      🇪🇸 Show translation
    </button>
  );
}
