import { barajar, crearPregunta, type PalabraJuego, type Pregunta, type Rng } from '../vocab-game/logic';

/**
 * Preguntas del duelo: las dos personas reciben exactamente la misma secuencia,
 * calculada a partir de la semilla que guarda el servidor al aceptar el desafío.
 */

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function rngConSemilla(semilla: number): Rng {
  let s = semilla | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dificultad que sube poco a poco: cada 5 preguntas un tramo más (máximo 5). */
export const tramoDuelo = (indice: number) => Math.min(5, 1 + Math.floor(indice / 5));

export function preguntaDuelo(palabras: PalabraJuego[], semilla: number, indice: number): Pregunta {
  const vuelta = Math.floor(indice / palabras.length);
  const mazo = barajar(rngConSemilla(semilla + vuelta * 7919), palabras);
  const palabra = mazo[indice % palabras.length]!;
  return crearPregunta(rngConSemilla(semilla ^ ((indice + 1) * 2654435761)), palabras, palabra, tramoDuelo(indice));
}
