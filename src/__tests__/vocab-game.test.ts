import { describe, expect, it } from 'vitest';
import { loadAllLevels } from '../content';
import {
  crearPregunta,
  Juego,
  palabrasDelNivel,
  PERSONAJES_NORMALES,
  seleccionarSecreto,
  type PersonajeId,
} from '../modules/vocab-game/logic';

/** Generador pseudoaleatorio con semilla (mulberry32) para pruebas reproducibles. */
function semilla(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Juega una partida respondiendo bien con la probabilidad dada; reparte puntos en rotación. */
function jugar(juego: Juego, precision: number, rnd: () => number) {
  const stats = ['vida', 'ataque', 'velocidad', 'esquiva'] as const;
  let i = 0;
  while (!juego.fin && juego.turno < 2000) {
    while (juego.puntosPendientes > 0) juego.asignarPunto(stats[i++ % 4]!);
    const p = juego.pregunta!;
    const valor = rnd() < precision ? p.respuesta : p.opciones.find((o) => o !== p.respuesta)!;
    juego.responder(valor);
  }
  return juego;
}

describe('Vocab Boss Game', async () => {
  const levels = await loadAllLevels();

  it('las adivinanzas desbloquean los personajes secretos', () => {
    expect(seleccionarSecreto(' A Keyboard ')).toBe('hacker');
    expect(seleccionarSecreto('computer!')).toBe('ia');
    expect(seleccionarSecreto('teclado')).toBeNull();
  });

  for (const level of levels) {
    it(`${level.id}: genera preguntas válidas de todos los tipos`, () => {
      const palabras = palabrasDelNivel(level);
      expect(palabras.length).toBeGreaterThanOrEqual(20);
      const rnd = semilla(7);
      const tipos = new Set<string>();
      for (let tramo = 1; tramo <= 5; tramo++) {
        for (const palabra of palabras) {
          const p = crearPregunta(rnd, palabras, palabra, tramo);
          tipos.add(p.tipo);
          expect(p.opciones).toHaveLength(4);
          expect(new Set(p.opciones.map((o) => o.toLowerCase())).size).toBe(4);
          expect(p.opciones.filter((o) => o === p.respuesta)).toHaveLength(1);
          expect(p.audio.trim()).not.toBe('');
          if (p.tipo === 'completa') expect(`${p.antes}${p.respuesta}${p.despues}`).toBe(palabra.item.example);
        }
      }
      expect([...tipos].sort()).toEqual(['completa', 'escucha', 'significado', 'traduce']);
    });
  }

  it('balance: quien domina el vocabulario gana y quien adivina al azar pierde', () => {
    const level = levels[0]!;
    const personajes: PersonajeId[] = [...PERSONAJES_NORMALES, 'hacker', 'ia'];
    const tasa = (precision: number) => {
      let ganadas = 0;
      let total = 0;
      for (const id of personajes) {
        for (let s = 1; s <= 60; s++) {
          const rnd = semilla(s * 31 + precision * 1000);
          if (jugar(new Juego(id, level, rnd), precision, rnd).fin === 'victoria') ganadas++;
          total++;
        }
      }
      return ganadas / total;
    };
    const alto = tasa(0.9);
    const medio = tasa(0.75);
    const azar = tasa(0.25);
    console.log({ alto, medio, azar });
    expect(alto).toBeGreaterThan(0.85);
    expect(azar).toBeLessThan(0.05);
  });

  it('las palabras falladas vuelven a salir pronto', () => {
    const rnd = semilla(3);
    const juego = new Juego('paladin', levels[2]!, rnd);
    const p = juego.pregunta!;
    juego.responder(p.opciones.find((o) => o !== p.respuesta)!);
    expect(juego.fallos).toHaveLength(1);
    const siguientes: string[] = [];
    for (let i = 0; i < 4 && !juego.fin; i++) {
      while (juego.puntosPendientes > 0) juego.asignarPunto('vida');
      siguientes.push(juego.pregunta!.palabra.item.term);
      juego.responder(juego.pregunta!.respuesta);
    }
    expect(siguientes).toContain(p.palabra.item.term);
  });
});

describe('Duelos: preguntas compartidas', async () => {
  const { preguntaDuelo } = await import('../modules/vocab-duel/questions');
  const levels = await loadAllLevels();
  it('las dos personas reciben la misma secuencia de preguntas', () => {
    for (const level of levels) {
      const palabras = palabrasDelNivel(level);
      const a = Array.from({ length: 60 }, (_, i) => preguntaDuelo(palabras, 123456, i));
      const b = Array.from({ length: 60 }, (_, i) => preguntaDuelo(palabras, 123456, i));
      expect(a).toEqual(b);
      a.forEach((p) => expect(p.opciones).toContain(p.respuesta));
      // Las primeras preguntas no repiten palabra.
      const primeras = a.slice(0, Math.min(30, palabras.length)).map((p) => p.palabra.item.term);
      expect(new Set(primeras).size).toBe(primeras.length);
    }
    const otra = preguntaDuelo(palabrasDelNivel(levels[0]!), 999, 0);
    expect(otra).toBeDefined();
  });
});
