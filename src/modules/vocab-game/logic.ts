import type { Level, LevelId, VocabItem } from '../../content/types';
import { findGap } from '../practice/generators';

/**
 * Vocab Boss Game: lógica del juego (sin React), basada en Logic Boss Game de Santiago
 * (github.com/As-Yung/Logic-Boss-Game). Se conservan su combate, personajes, experiencia,
 * rachas con golpe crítico y 10 bosses; las operaciones matemáticas se cambian por
 * preguntas de vocabulario del nivel elegido (A1–C2). La interfaz solo pinta el estado.
 */

export type Rng = () => number;

export const NIVEL_FINAL = 10;
export const RACHA_CRITICO = 3;
export const MULTIPLICADOR_CRITICO = 1.5;
export const CURACION_AL_VENCER = 0.6;
export const VIDA_POR_PUNTO = 3;

export type PersonajeId = 'paladin' | 'asesino' | 'mago' | 'arquero' | 'hacker' | 'ia';

export interface PersonajeBase {
  id: PersonajeId;
  nombre: string;
  vida: number;
  ataque: number;
  velocidad: number;
  esquiva: number;
  secreto: boolean;
  lema: string;
}

export const PERSONAJES: Record<PersonajeId, PersonajeBase> = {
  paladin: { id: 'paladin', nombre: 'Paladín', vida: 34, ataque: 10, velocidad: 9, esquiva: 9, secreto: false, lema: 'Aguanta muchos golpes.' },
  asesino: { id: 'asesino', nombre: 'Asesino', vida: 26, ataque: 10, velocidad: 13, esquiva: 13, secreto: false, lema: 'Rápido y difícil de golpear.' },
  mago: { id: 'mago', nombre: 'Mago', vida: 28, ataque: 15, velocidad: 7, esquiva: 11, secreto: false, lema: 'Golpes muy fuertes.' },
  arquero: { id: 'arquero', nombre: 'Arquero', vida: 28, ataque: 12, velocidad: 11, esquiva: 9, secreto: false, lema: 'Equilibrado en todo.' },
  hacker: { id: 'hacker', nombre: 'Hacker', vida: 40, ataque: 40, velocidad: 8, esquiva: 8, secreto: true, lema: 'Un solo exploit.' },
  ia: { id: 'ia', nombre: 'Robot IA', vida: 34, ataque: 14, velocidad: 22, esquiva: 18, secreto: true, lema: 'Siempre hace doble jugada.' },
};

export const PERSONAJES_NORMALES: PersonajeId[] = ['paladin', 'asesino', 'mago', 'arquero'];

export type Forma = 'blob' | 'robot' | 'murcielago' | 'fantasma' | 'dragon';

export const BOSSES: { nombre: string; forma: Forma; corona?: boolean }[] = [
  { nombre: 'Bug Blob', forma: 'blob' },
  { nombre: 'King Bug', forma: 'blob', corona: true },
  { nombre: 'Robo-Lag', forma: 'robot' },
  { nombre: 'Mega Robo-Lag', forma: 'robot', corona: true },
  { nombre: 'Malware Bat', forma: 'murcielago' },
  { nombre: 'Vampire Malware', forma: 'murcielago', corona: true },
  { nombre: 'Ghost Packet', forma: 'fantasma' },
  { nombre: 'Phantom Packet', forma: 'fantasma', corona: true },
  { nombre: 'Firewall Dragon', forma: 'dragon' },
  { nombre: 'Kernel Dragon', forma: 'dragon', corona: true },
];

/** Adivinanzas bonus en inglés: aciertas una y desbloqueas un personaje secreto. */
export const ADIVINANZAS: { en: string; es: string }[] = [
  { en: 'What has many keys but can’t open a single lock?', es: '¿Qué tiene muchas teclas (keys) pero no abre ninguna cerradura?' },
  { en: 'I have a mouse, but I’m not afraid of it. What am I?', es: 'Tengo un ratón (mouse), pero no le tengo miedo. ¿Qué soy?' },
];

/** Respuestas de las adivinanzas (en inglés, como pide el juego). */
export function seleccionarSecreto(texto: string): PersonajeId | null {
  const t = texto.trim().toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/[.!¡¿?]/g, '').trim();
  if (t === 'keyboard' || t === 'a keyboard') return 'hacker';
  if (t === 'computer' || t === 'pc' || t === 'laptop') return 'ia';
  return null;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const limitar = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));
const entero = (rnd: Rng, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const elegir = <T>(rnd: Rng, lista: readonly T[]): T => lista[Math.floor(rnd() * lista.length)]!;

export function barajar<T>(rnd: Rng, lista: readonly T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* Personaje, boss y experiencia                                       */
/* ------------------------------------------------------------------ */

export interface Personaje {
  id: PersonajeId;
  nombre: string;
  secreto: boolean;
  nivel: number;
  vidaMax: number;
  vida: number;
  ataque: number;
  velocidad: number;
  esquiva: number;
}

function crearPersonaje(id: PersonajeId): Personaje {
  const b = PERSONAJES[id];
  return { id, nombre: b.nombre, secreto: b.secreto, nivel: 1, vidaMax: b.vida, vida: b.vida, ataque: b.ataque, velocidad: b.velocidad, esquiva: b.esquiva };
}

export interface Boss {
  nivel: number;
  nombre: string;
  forma: Forma;
  corona: boolean;
  vidaMax: number;
  vida: number;
  ataque: number;
  velocidad: number;
  esquiva: number;
}

export function crearBoss(nivel: number): Boss {
  const info = BOSSES[nivel - 1]!;
  const vidaMax = 28 + 13 * (nivel - 1);
  return {
    nivel,
    nombre: info.nombre,
    forma: info.forma,
    corona: !!info.corona,
    vidaMax,
    vida: vidaMax,
    ataque: 2 + nivel,
    velocidad: 5 + nivel,
    esquiva: 4 + nivel,
  };
}

/** Probabilidad de que el defensor esquive: crece con la diferencia de esquiva. */
export function probEsquiva(defensor: { esquiva: number }, atacante: { esquiva: number }, base: number): number {
  return limitar(base + (defensor.esquiva - atacante.esquiva) * 0.02, 0.05, 0.5);
}

/** Probabilidad de golpear dos veces: crece con la diferencia de velocidad. */
export function probDoble(atacante: { velocidad: number }, defensor: { velocidad: number }): number {
  return limitar(0.15 + (atacante.velocidad - defensor.velocidad) * 0.03, 0.05, 0.6);
}

/* ------------------------------------------------------------------ */
/* Preguntas de vocabulario                                            */
/* ------------------------------------------------------------------ */

export interface PalabraJuego {
  item: VocabItem;
  topicId: string;
  topicTitle: string;
}

export type TipoPregunta = 'significado' | 'traduce' | 'escucha' | 'completa';

export const NOMBRE_TIPO: Record<TipoPregunta, string> = {
  significado: '¿Qué significa?',
  traduce: '¿Cómo se dice en inglés?',
  escucha: 'Escucha y elige',
  completa: 'Completa la frase',
};

export interface Pregunta {
  tipo: TipoPregunta;
  tramo: number;
  palabra: PalabraJuego;
  /** Texto grande de la pregunta (término, traducción o frase con hueco). */
  enunciado: string;
  /** Para "completa": partes de la frase alrededor del hueco. */
  antes?: string;
  despues?: string;
  /** Texto en inglés que se lee en voz alta (término o frase completa). */
  audio: string;
  opciones: string[];
  respuesta: string;
}

/**
 * Quita las aclaraciones entre paréntesis de la traducción, p. ej. "visto (see)" → "visto",
 * para que la opción correcta no se delate con la palabra en inglés.
 */
export function limpiarEs(es: string): string {
  return es.replace(/\s*\([^)]*\)/g, '').trim() || es;
}

/** Tramo de dificultad según el boss: sube cada dos bosses (1..5). */
export function tramoPregunta(nivelBoss: number): number {
  return limitar(Math.ceil(nivelBoss / 2), 1, 5);
}

const TIPOS_POR_TRAMO: Record<number, TipoPregunta[]> = {
  1: ['significado', 'significado', 'traduce'],
  2: ['significado', 'traduce', 'escucha'],
  3: ['significado', 'traduce', 'escucha', 'completa'],
  4: ['traduce', 'escucha', 'completa', 'completa'],
  5: ['traduce', 'escucha', 'completa', 'completa', 'significado'],
};

/** Junta el vocabulario de todos los temas del nivel (sin términos repetidos). */
export function palabrasDelNivel(level: Level): PalabraJuego[] {
  const vistas = new Set<string>();
  const out: PalabraJuego[] = [];
  for (const t of level.topics) {
    for (const item of t.vocabulary) {
      const k = item.term.toLowerCase();
      if (vistas.has(k)) continue;
      vistas.add(k);
      out.push({ item, topicId: t.id, topicTitle: t.titleEs });
    }
  }
  return out;
}

/** Distractores parecidos: primero de la misma categoría, luego del mismo tema y luego del resto. */
function distractores(rnd: Rng, todas: PalabraJuego[], correcta: PalabraJuego, campo: (p: PalabraJuego) => string, valorCorrecto: string): string[] {
  const otras = todas.filter((p) => p.item.term !== correcta.item.term);
  const misma = barajar(rnd, otras.filter((p) => p.item.category === correcta.item.category && p.topicId === correcta.topicId));
  const tema = barajar(rnd, otras.filter((p) => p.topicId === correcta.topicId && p.item.category !== correcta.item.category));
  const resto = barajar(rnd, otras.filter((p) => p.topicId !== correcta.topicId));
  const vistas = new Set([valorCorrecto.toLowerCase()]);
  const out: string[] = [];
  for (const p of [...misma, ...tema, ...resto]) {
    const v = campo(p);
    if (vistas.has(v.toLowerCase())) continue;
    vistas.add(v.toLowerCase());
    out.push(v);
    if (out.length === 3) break;
  }
  return out;
}

export function crearPregunta(rnd: Rng, todas: PalabraJuego[], palabra: PalabraJuego, tramo: number): Pregunta {
  let tipo = elegir(rnd, TIPOS_POR_TRAMO[tramo] ?? TIPOS_POR_TRAMO[1]!);
  const { item } = palabra;
  const hueco = tipo === 'completa' ? findGap(item.example, item.term) : null;
  if (tipo === 'completa' && !hueco) tipo = 'traduce';

  if (tipo === 'completa' && hueco) {
    const malas = distractores(rnd, todas, palabra, (p) => p.item.term, hueco.match);
    return {
      tipo,
      tramo,
      palabra,
      enunciado: `${hueco.before}____${hueco.after}`,
      antes: hueco.before,
      despues: hueco.after,
      audio: item.example,
      opciones: barajar(rnd, [hueco.match, ...malas]),
      respuesta: hueco.match,
    };
  }
  if (tipo === 'traduce') {
    const malas = distractores(rnd, todas, palabra, (p) => p.item.term, item.term);
    return { tipo, tramo, palabra, enunciado: limpiarEs(item.es), audio: item.term, opciones: barajar(rnd, [item.term, ...malas]), respuesta: item.term };
  }
  // significado y escucha: se elige la traducción al español.
  const es = limpiarEs(item.es);
  const malas = distractores(rnd, todas, palabra, (p) => limpiarEs(p.item.es), es);
  return { tipo, tramo, palabra, enunciado: item.term, audio: item.term, opciones: barajar(rnd, [es, ...malas]), respuesta: es };
}

/* ------------------------------------------------------------------ */
/* Partida                                                             */
/* ------------------------------------------------------------------ */

export type Evento =
  | { tipo: 'acierto' | 'error'; respuesta: string }
  | { tipo: 'golpeJugador'; danio: number; golpe: number; critico: boolean; exp: number; texto: string }
  | { tipo: 'bossEsquiva'; texto: string }
  | { tipo: 'golpeBoss'; danio: number; golpe: number; texto: string }
  | { tipo: 'jugadorEsquiva'; texto: string }
  | { tipo: 'bossDerrotado'; nivel: number; nombre: string; texto: string }
  | { tipo: 'nuevoBoss'; nivel: number; nombre: string; curado: number; texto: string }
  | { tipo: 'subeNivel'; nivel: number; puntos: number; texto: string };

export type Fin = 'victoria' | 'derrota' | null;
export type Stat = 'vida' | 'ataque' | 'velocidad' | 'esquiva';

export interface Fallo {
  palabra: PalabraJuego;
  pregunta: Pregunta;
}

export class Juego {
  readonly rnd: Rng;
  readonly nivelIngles: LevelId;
  readonly palabras: PalabraJuego[];
  pj: Personaje;
  bs: Boss;
  exp = { actual: 0, necesaria: 40 };
  puntosPorNivel: number;
  puntosPendientes = 0;
  racha = 0;
  mejorRacha = 0;
  aciertos = 0;
  turno = 0;
  fin: Fin = null;
  pregunta: Pregunta | null;
  /** Palabras falladas (para repasarlas al final). */
  fallos: Fallo[] = [];
  private mazo: PalabraJuego[] = [];
  /** Veces que cada palabra fallada se ha vuelto a poner al frente del mazo. */
  private repeticiones = new Map<string, number>();

  constructor(personaje: PersonajeId, level: Level, rnd: Rng = Math.random) {
    if (!PERSONAJES[personaje]) throw new Error(`Personaje desconocido: ${personaje}`);
    this.rnd = rnd;
    this.nivelIngles = level.id;
    this.palabras = palabrasDelNivel(level);
    if (this.palabras.length < 4) throw new Error('El nivel necesita al menos 4 palabras');
    this.pj = crearPersonaje(personaje);
    this.bs = crearBoss(1);
    this.puntosPorNivel = this.pj.secreto ? 4 : 2;
    this.pregunta = this.nuevaPregunta();
  }

  /** Saca la siguiente palabra del mazo; se baraja de nuevo al terminarlo. */
  private siguientePalabra(): PalabraJuego {
    if (this.mazo.length === 0) this.mazo = barajar(this.rnd, this.palabras);
    return this.mazo.shift()!;
  }

  private nuevaPregunta(): Pregunta {
    return crearPregunta(this.rnd, this.palabras, this.siguientePalabra(), tramoPregunta(this.bs.nivel));
  }

  private danioBoss(): number {
    return Math.max(1, this.bs.ataque);
  }

  private ganarExp(): number {
    const cantidad = 8 + this.bs.nivel + entero(this.rnd, 0, 4);
    this.exp.actual += cantidad;
    return cantidad;
  }

  /** Resuelve un turno completo con la respuesta del jugador y devuelve sus eventos. */
  responder(valor: string): { eventos: Evento[]; fin: Fin } {
    if (this.fin || this.puntosPendientes > 0 || !this.pregunta) throw new Error('No se puede responder ahora');
    const { pj, bs, rnd } = this;
    const pregunta = this.pregunta;
    const eventos: Evento[] = [];
    const acierto = valor === pregunta.respuesta;

    this.turno += 1;
    eventos.push({ tipo: acierto ? 'acierto' : 'error', respuesta: pregunta.respuesta });

    if (acierto) {
      this.aciertos += 1;
      this.racha += 1;
      this.mejorRacha = Math.max(this.mejorRacha, this.racha);
      const critico = this.racha >= RACHA_CRITICO;
      const danio = Math.round(pj.ataque * (critico ? MULTIPLICADOR_CRITICO : 1));
      let golpes = 0;
      if (rnd() < probEsquiva(bs, pj, 0.1)) {
        eventos.push({ tipo: 'bossEsquiva', texto: `${bs.nombre} esquivó tu ataque.` });
      } else {
        golpes = 1;
        // El Robot IA siempre hace doble jugada; el resto depende de la velocidad.
        if (pj.id === 'ia' || rnd() < probDoble(pj, bs)) golpes = 2;
      }
      for (let g = 1; g <= golpes && bs.vida > 0; g++) {
        bs.vida = Math.max(0, bs.vida - danio);
        const ganada = this.ganarExp();
        eventos.push({
          tipo: 'golpeJugador',
          danio,
          golpe: g,
          critico,
          exp: ganada,
          texto: `${critico ? '¡Golpe crítico! ' : ''}${g === 2 ? '¡Segundo golpe! ' : '¡Le diste! '}${bs.nombre} pierde ${danio} de vida.`,
        });
      }
    } else {
      this.racha = 0;
      this.fallos.push({ palabra: pregunta.palabra, pregunta });
      // La palabra fallada vuelve a salir pronto para reforzarla (como mucho 2 veces por partida).
      const veces = this.repeticiones.get(pregunta.palabra.item.term) ?? 0;
      if (veces < 2) {
        this.repeticiones.set(pregunta.palabra.item.term, veces + 1);
        this.mazo.splice(Math.min(3 + veces * 3, this.mazo.length), 0, pregunta.palabra);
      }
      if (rnd() < probEsquiva(pj, bs, 0.25)) {
        eventos.push({ tipo: 'jugadorEsquiva', texto: `¡Esquivaste el ataque de ${bs.nombre}!` });
      } else {
        const golpesBoss = rnd() < probDoble(bs, pj) ? 2 : 1;
        const danioBoss = this.danioBoss();
        for (let h = 1; h <= golpesBoss && pj.vida > 0; h++) {
          pj.vida = Math.max(0, pj.vida - danioBoss);
          eventos.push({ tipo: 'golpeBoss', danio: danioBoss, golpe: h, texto: `${h === 2 ? '¡Otra vez! ' : ''}${bs.nombre} te quita ${danioBoss} de vida.` });
        }
      }
    }

    if (bs.vida <= 0) {
      eventos.push({ tipo: 'bossDerrotado', nivel: bs.nivel, nombre: bs.nombre, texto: `¡Venciste a ${bs.nombre}!` });
      if (bs.nivel >= NIVEL_FINAL) return this.terminar('victoria', eventos);
      const antes = pj.vida;
      pj.vida = Math.min(pj.vidaMax, pj.vida + Math.round(pj.vidaMax * CURACION_AL_VENCER));
      const curado = pj.vida - antes;
      this.bs = crearBoss(bs.nivel + 1);
      eventos.push({
        tipo: 'nuevoBoss',
        nivel: this.bs.nivel,
        nombre: this.bs.nombre,
        curado,
        texto: `¡Aparece ${this.bs.nombre}!${curado > 0 ? ` Recuperas ${curado} de vida.` : ''}`,
      });
    }

    if (pj.vida <= 0) return this.terminar('derrota', eventos);

    if (this.exp.actual >= this.exp.necesaria) {
      pj.nivel += 1;
      this.exp.actual -= this.exp.necesaria;
      this.exp.necesaria += 20;
      this.puntosPendientes = this.puntosPorNivel;
      eventos.push({ tipo: 'subeNivel', nivel: pj.nivel, puntos: this.puntosPorNivel, texto: `¡Subiste a nivel ${pj.nivel}! Tienes ${this.puntosPorNivel} puntos para mejorar.` });
      return { eventos, fin: null };
    }

    this.pregunta = this.nuevaPregunta();
    return { eventos, fin: null };
  }

  asignarPunto(stat: Stat): void {
    if (this.puntosPendientes <= 0) throw new Error('No hay puntos por asignar');
    const pj = this.pj;
    if (stat === 'vida') {
      pj.vidaMax += VIDA_POR_PUNTO;
      pj.vida += VIDA_POR_PUNTO;
    } else {
      pj[stat] += 1;
    }
    this.puntosPendientes -= 1;
    if (this.puntosPendientes === 0) this.pregunta = this.nuevaPregunta();
  }

  private terminar(resultado: Exclude<Fin, null>, eventos: Evento[]): { eventos: Evento[]; fin: Fin } {
    this.fin = resultado;
    this.pregunta = null;
    return { eventos, fin: resultado };
  }
}
