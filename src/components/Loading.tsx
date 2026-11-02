export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {text}
    </div>
  );
}
