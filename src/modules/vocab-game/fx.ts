/**
 * Efectos del Vocab Boss Game (animaciones, sonido y confeti), portados de la interfaz
 * de Logic Boss Game. Trabajan sobre elementos del DOM que React no pinta por dentro.
 */

export const reducido = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, reducido ? Math.min(ms, 120) : ms));
}

export function animar(el: Element | null, frames: Keyframe[], opciones: KeyframeAnimationOptions): Promise<void> {
  if (reducido || !el || !('animate' in el)) return Promise.resolve();
  return el
    .animate(frames, opciones)
    .finished.then(() => undefined)
    .catch(() => undefined);
}

function centro(escenario: Element, el: Element) {
  const caja = escenario.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - caja.left + r.width / 2, y: r.top - caja.top + r.height / 2 };
}

export function color(nombre: string, raiz: Element): string {
  return getComputedStyle(raiz).getPropertyValue(nombre).trim();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function estrella(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'estrella');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 2l3 6.5l7 .8l-5.2 4.8l1.4 7L12 17.6L5.8 21.1l1.4-7L2 9.3l7-.8z');
  svg.appendChild(path);
  return svg;
}

export class Efectos {
  constructor(
    private escenario: HTMLElement,
    private capa: HTMLElement,
  ) {}

  flotante(sobre: Element, texto: string, clase = ''): void {
    const c = centro(this.escenario, sobre);
    const el = document.createElement('span');
    el.className = `flotante ${clase}`;
    el.textContent = texto;
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y - 20}px`;
    this.capa.appendChild(el);
    void animar(
      el,
      [
        { opacity: 0, transform: 'translate(-50%, -30%) scale(0.7)' },
        { opacity: 1, transform: 'translate(-50%, -60%) scale(1.1)', offset: 0.2 },
        { opacity: 0, transform: 'translate(-50%, -180%) scale(1)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    ).then(() => (reducido ? setTimeout(() => el.remove(), 900) : el.remove()));
  }

  particulas(sobre: Element, tinta: string, cantidad: number): void {
    if (reducido) return;
    const c = centro(this.escenario, sobre);
    for (let i = 0; i < cantidad; i++) {
      const el = document.createElement('span');
      el.className = 'particula';
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
      el.style.background = tinta;
      this.capa.appendChild(el);
      const ang = (Math.PI * 2 * i) / cantidad + Math.random() * 0.5;
      const dist = 40 + Math.random() * 50;
      void animar(
        el,
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(ang) * dist - 4}px, ${Math.sin(ang) * dist - 4}px) scale(0.3)`, opacity: 0 },
        ],
        { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).then(() => el.remove());
    }
  }

  proyectil(desde: Element, hasta: Element, clase = ''): Promise<void> {
    const a = centro(this.escenario, desde);
    const b = centro(this.escenario, hasta);
    const el = document.createElement('span');
    el.className = `proyectil ${clase}`;
    el.appendChild(estrella());
    this.capa.appendChild(el);
    const tam = clase.includes('critico') ? 54 : 34;
    return animar(
      el,
      [
        { transform: `translate(${a.x - tam / 2}px,${a.y - tam / 2}px) rotate(0deg) scale(0.6)` },
        { transform: `translate(${(a.x + b.x) / 2 - tam / 2}px,${Math.min(a.y, b.y) - 50}px) rotate(200deg) scale(1)`, offset: 0.5 },
        { transform: `translate(${b.x - tam / 2}px,${b.y - tam / 2}px) rotate(400deg) scale(0.9)` },
      ],
      { duration: 420, easing: 'ease-in' },
    ).then(() => el.remove());
  }

  limpiar(): void {
    this.capa.replaceChildren();
  }
}

/* ---------- Sonido (Web Audio, se activa con el primer clic) ---------- */

let audio: AudioContext | null = null;

function tono(freq: number, inicio: number, dur: number, tipo: OscillatorType = 'triangle', vol = 0.12, freqFinal?: number) {
  if (!audio) return;
  const t = audio.currentTime + inicio;
  const osc = audio.createOscillator();
  const gan = audio.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t);
  if (freqFinal) osc.frequency.exponentialRampToValueAtTime(freqFinal, t + dur);
  gan.gain.setValueAtTime(0.0001, t);
  gan.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gan).connect(audio.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SONIDOS = {
  acierto: () => {
    tono(523, 0, 0.12);
    tono(659, 0.09, 0.12);
    tono(784, 0.18, 0.2);
  },
  error: () => {
    tono(247, 0, 0.18, 'sine');
    tono(185, 0.15, 0.28, 'sine');
  },
  golpe: () => tono(180, 0, 0.12, 'square', 0.08, 70),
  critico: () => {
    tono(300, 0, 0.18, 'square', 0.09, 60);
    tono(900, 0, 0.12, 'triangle', 0.06, 1400);
  },
  dolor: () => tono(140, 0, 0.22, 'sawtooth', 0.07, 60),
  esquiva: () => tono(700, 0, 0.16, 'sine', 0.08, 1400),
  victoria: () => [523, 659, 784, 1047].forEach((f, i) => tono(f, i * 0.12, 0.25)),
  nivel: () => [392, 523, 659, 784].forEach((f, i) => tono(f, i * 0.08, 0.16)),
  derrota: () => [392, 330, 262, 196].forEach((f, i) => tono(f, i * 0.18, 0.3, 'sine')),
};

export type Sonido = keyof typeof SONIDOS;

export function sonar(nombre: Sonido, activo: boolean): void {
  if (!activo) return;
  try {
    if (!audio) {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctx = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
    }
    if (audio.state === 'suspended') void audio.resume();
    SONIDOS[nombre]();
  } catch {
    /* sin audio */
  }
}

/* ---------- Confeti ---------- */

export function confeti(lienzo: HTMLCanvasElement | null, raiz: Element, cantidad: number, duracion: number): void {
  if (reducido || !lienzo) return;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  lienzo.width = window.innerWidth * dpr;
  lienzo.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colores = ['--tiza-amarilla', '--tiza-roja', '--tiza-azul', '--tiza-verde', '--tiza-morada', '--tiza-naranja'].map((c) => color(c, raiz));
  const trozos = Array.from({ length: cantidad }, (_, i) => ({
    x: Math.random() * window.innerWidth,
    y: -20 - Math.random() * window.innerHeight * 0.5,
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    giro: Math.random() * Math.PI,
    vgiro: (Math.random() - 0.5) * 0.2,
    tam: 6 + Math.random() * 6,
    color: colores[i % colores.length]!,
  }));
  const inicio = performance.now();
  const paso = (ahora: number) => {
    const t = ahora - inicio;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalAlpha = t > duracion - 500 ? Math.max(0, (duracion - t) / 500) : 1;
    for (const c of trozos) {
      c.x += c.vx;
      c.y += c.vy;
      c.giro += c.vgiro;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.giro);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.tam / 2, -c.tam / 4, c.tam, c.tam / 2);
      ctx.restore();
    }
    if (t < duracion) requestAnimationFrame(paso);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
  requestAnimationFrame(paso);
}
