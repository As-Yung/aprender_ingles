import type { ReactNode } from 'react';
import type { Forma, PersonajeId } from './logic';

/**
 * Dibujos con tiza (SVG 120x120) portados de Logic Boss Game.
 * Las clases c-* dan el color de la tiza y están en vocab-game.css.
 */

let k = 0;
const g = (cls: string, ...children: ReactNode[]) => (
  <g key={k++} className={cls}>
    {children}
  </g>
);
const p = (d: string) => <path key={k++} d={d} />;
const c = (cx: number, cy: number, r: number) => <circle key={k++} cx={cx} cy={cy} r={r} />;
const el = (cx: number, cy: number, rx: number, ry: number) => <ellipse key={k++} cx={cx} cy={cy} rx={rx} ry={ry} />;
const rect = (x: number, y: number, w: number, h: number, rx: number) => <rect key={k++} x={x} y={y} width={w} height={h} rx={rx} />;

/* ---------- Personajes (miran a la derecha) ---------- */

const PERSONAJES: Record<PersonajeId, () => ReactNode[]> = {
  paladin: () => [
    g('c-blanca sin-relleno', p('M50 112v-12M66 112v-12')),
    g('c-azul', p('M40 100q0-32 18-34q18 2 18 34z')),
    g('c-blanca', p('M42 54q0-24 16-24t16 24v8H42z')),
    g('c-blanca sin-relleno fino', p('M48 50h20M58 42v8')),
    g('c-roja', p('M58 30q-4-16 12-20q-4 10-8 20z')),
    g('c-blanca sin-relleno', p('M80 92l20-44')),
    g('c-amarilla sin-relleno', p('M74 86l12 8')),
    g('c-amarilla', p('M24 70h24v16q0 14-12 20q-12-6-12-20z')),
    g('c-blanca sin-relleno fino', p('M36 74v26M28 85h16')),
  ],
  asesino: () => [
    g('c-morada', p('M38 112q2-46 20-48q18 2 20 48z')),
    g('c-morada', p('M36 64q0-42 22-42t22 42q-8-10-22-10t-22 10z')),
    g('c-blanca sin-relleno fino', p('M44 60h28')),
    g('c-amarilla lleno', c(51, 54, 2.6), c(65, 54, 2.6)),
    g('c-blanca sin-relleno', p('M84 82l16-22M30 86l-12-18')),
    g('c-amarilla sin-relleno', p('M80 82l8 6M34 86l-8 4')),
  ],
  mago: () => [
    g('c-azul', p('M36 112q4-46 22-48q18 2 22 48z')),
    g('c-blanca', c(58, 54, 12)),
    g('c-blanca lleno', c(54, 52, 1.6), c(63, 52, 1.6)),
    g('c-blanca', p('M47 60q11 26 22 0q-11 6-22 0z')),
    g('c-morada', p('M32 46h52M42 46l18-38l16 38z')),
    g('c-amarilla lleno', p('M60 26l2 4l4 1l-3 3l1 4l-4-2l-4 2l1-4l-3-3l4-1z')),
    g('c-naranja sin-relleno', p('M94 112V42')),
    g('c-amarilla', c(94, 34, 7)),
    g('c-amarilla sin-relleno fino brillo', p('M94 20v-6M106 34h6M103 23l4-4M85 23l-4-4')),
  ],
  arquero: () => [
    g('c-naranja', p('M30 66h10v30H30z')),
    g('c-verde', p('M40 112q2-44 18-46q16 2 18 46z')),
    g('c-blanca', c(58, 52, 12)),
    g('c-blanca lleno', c(55, 51, 1.6), c(64, 51, 1.6)),
    g('c-verde', p('M44 48q14-22 30-4z')),
    g('c-roja', p('M70 40q10-16 18-12q-8 2-18 12z')),
    g('c-naranja sin-relleno', p('M92 34q22 34 0 68')),
    g('c-blanca sin-relleno fino', p('M92 34v68')),
    g('c-blanca sin-relleno', p('M66 68h36M98 64l6 4l-6 4')),
  ],
  hacker: () => [
    g('c-verde', p('M34 112q4-46 24-50q20 4 24 50z')),
    g('c-verde', p('M34 64q0-44 24-44t24 44q-8-12-24-12t-24 12z')),
    g('c-blanca', el(58, 58, 11, 10)),
    g('c-verde lleno', p('M50 56h6M60 56h6')),
    g('c-blanca sin-relleno fino', p('M53 64q5 3 10 0')),
    g('c-blanca', p('M70 84h36l-6 20H64z')),
    g('c-verde sin-relleno fino brillo', p('M76 90l4 3l-4 3M84 96h8')),
    g('c-blanca sin-relleno', p('M62 106h46')),
  ],
  ia: () => [
    g('c-amarilla sin-relleno', p('M58 22V12')),
    g('c-amarilla lleno brillo', c(58, 10, 4)),
    g('c-azul', rect(34, 22, 48, 36, 8)),
    g('c-amarilla lleno', c(48, 38, 4), c(68, 38, 4)),
    g('c-blanca sin-relleno fino', p('M48 50q10 6 20 0')),
    g('c-azul', rect(36, 62, 44, 40, 7)),
    g('c-blanca sin-relleno fino', p('M46 72h24M46 80h16M46 88h20')),
    g('c-blanca sin-relleno', p('M80 72l16-12M36 72l-14 14M46 102v10M70 102v10')),
    g('c-blanca', c(98, 56, 6)),
  ],
};

/* ---------- Bosses (miran a la izquierda) ---------- */

const FORMAS: Record<Forma, (color: string) => ReactNode[]> = {
  blob: (col) => [
    g(col, p('M12 110q-4-62 48-66q52 4 48 66q-8-6-14 0q-6-8-14 0q-6-6-14 0q-6-8-14 0q-6-6-14 0q-6-8-14 0q-6-6-12 0z')),
    g('c-blanca', c(44, 74, 9), c(74, 74, 9)),
    g('pupila', c(41, 75, 4), c(71, 75, 4)),
    g('c-blanca sin-relleno', p('M46 94q14 10 28 0')),
  ],
  robot: (col) => [
    g('c-amarilla sin-relleno', p('M60 20V10')),
    g('c-amarilla lleno', c(60, 8, 4)),
    g(col, rect(30, 20, 60, 40, 7)),
    g('c-roja lleno', rect(38, 32, 14, 10, 2), rect(66, 32, 14, 10, 2)),
    g('c-blanca sin-relleno fino', p('M44 50h32M50 46v8M60 46v8M70 46v8')),
    g(col, rect(26, 64, 68, 44, 6)),
    g('c-amarilla lleno', c(44, 80, 3), c(56, 80, 3)),
    g('c-blanca sin-relleno', p('M26 76l-16 18M94 76l16 18M40 108v8M80 108v8')),
    g('c-blanca sin-relleno fino', p('M66 78h20M66 86h20M66 94h20')),
  ],
  murcielago: (col) => [
    g(col, p('M50 62q-26-34-48-12q10 2 12 14q8-6 14 2q8-6 14 4zM70 62q26-34 48-12q-10 2-12 14q-8-6-14 2q-8-6-14 4z')),
    g(col, el(60, 72, 17, 24)),
    g(col, p('M48 54l-6-18l14 10zM72 54l6-18l-14 10z')),
    g('c-roja lleno', c(53, 64, 3.2), c(67, 64, 3.2)),
    g('c-blanca', p('M54 78l2 6l2-6zM62 78l2 6l2-6z')),
    g('c-blanca sin-relleno fino', p('M52 96l-4 12M68 96l4 12')),
  ],
  fantasma: (col) => [
    g(col, p('M30 108V56q0-38 30-38t30 38v52l-10-8l-10 8l-10-8l-10 8l-10-8z')),
    g('pupila', el(48, 56, 5, 8), el(68, 56, 5, 8)),
    g('pupila', el(58, 80, 6, 8)),
    g(col, p('M30 70q-14-4-18-16M90 70q14-4 18-16')),
  ],
  dragon: (col) => [
    g(col, p('M74 56q26-44 44-14q-12-2-16 8q-8-6-14 4q-6-6-12 6z')),
    g(col, p('M42 112q0-42 30-52q26 6 28 52z')),
    g('c-amarilla sin-relleno fino', p('M66 76q8 4 16 0M64 88q10 4 20 0M64 100q10 4 20 0')),
    g(col, p('M60 66q-4-28 8-38q-22-2-40 8q-10 8-2 16q16 2 28 14z')),
    g('c-amarilla', p('M54 30l2-18l8 16zM64 30l8-14l0 16z')),
    g('c-amarilla lleno', c(42, 40, 3.4)),
    g('c-blanca sin-relleno fino', p('M30 48l3-2M44 54l-12-2')),
    g('c-naranja fuego', p('M24 50q-12-4-20 4q8 0 10 6q-6 2-10 10q10-4 18-12z')),
    g(col, p('M98 104q16-2 18-18q-8 6-14 4')),
  ],
};

const COLORES: Record<Forma, [string, string]> = {
  blob: ['c-verde', 'c-naranja'],
  robot: ['c-azul', 'c-roja'],
  murcielago: ['c-morada', 'c-roja'],
  fantasma: ['c-blanca', 'c-azul'],
  dragon: ['c-roja', 'c-morada'],
};

const CORONA_Y: Record<Forma, number> = { blob: 30, robot: -4, murcielago: 24, fantasma: 4, dragon: 8 };

function Svg({ children, className }: { children: ReactNode; className: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`dibujo ${className}`} aria-hidden="true" focusable="false">
      <g filter="url(#vbg-tiza)">{children}</g>
    </svg>
  );
}

export function PersonajeDibujo({ id }: { id: PersonajeId }) {
  return <Svg className="dibujo-personaje">{PERSONAJES[id]()}</Svg>;
}

export function BossDibujo({ forma, corona }: { forma: Forma; corona?: boolean }) {
  const color = COLORES[forma][corona ? 1 : 0];
  return (
    <Svg className="dibujo-boss">
      {FORMAS[forma](color)}
      {corona && (
        <g transform={`translate(${forma === 'dragon' ? -16 : 0} ${CORONA_Y[forma]})`}>
          {g('c-amarilla', p('M44 14l4-12l7 8l5-10l5 10l7-8l4 12z'))}
        </g>
      )}
    </Svg>
  );
}

export function Estrella({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`estrella ${className}`} aria-hidden="true" focusable="false">
      <path d="M12 2l3 6.5l7 .8l-5.2 4.8l1.4 7L12 17.6L5.8 21.1l1.4-7L2 9.3l7-.8z" />
    </svg>
  );
}

/** Filtro SVG que da textura de tiza a todos los dibujos (se pinta una vez por página). */
export function FiltroTiza() {
  return (
    <svg className="vbg-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="vbg-tiza" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} result="ruido" />
          <feDisplacementMap in="SourceGraphic" in2="ruido" scale={2.2} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
