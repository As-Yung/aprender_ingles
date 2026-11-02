import { describe, expect, it } from 'vitest';
import { buildTotp, createTotpSecret, validateTotp } from '../core/auth/totp';
import { checkPassword, generateTemporaryPassword, randomInt, validateUsername } from '../core/auth/validation';
import { hashPassword, verifyPassword } from '../core/security/crypto';
import { review } from '../core/srs/leitner';
import { audioId, scoreVoice, similarity, splitForSpeech } from '../core/speech/speech';
import { collectSpeech } from '../core/speech/catalog';
import { loadAllLevels } from '../content';
import { tokenize } from '../modules/reading/ReadingSection';

describe('política de contraseñas', () => {
  it('acepta una contraseña robusta', () => {
    expect(checkPassword('Vocab-Cards-2026!').ok).toBe(true);
  });
  it('rechaza contraseñas débiles', () => {
    expect(checkPassword('password').ok).toBe(false);
    expect(checkPassword('Short1-').ok).toBe(false);
    expect(checkPassword('NoSymbols12345').ok).toBe(false);
  });
  it('rechaza contraseñas que contienen el usuario', () => {
    expect(checkPassword('Maria.lopez-2025', 'maria.lopez').ok).toBe(false);
  });
  it('las contraseñas temporales cumplen la política', () => {
    for (let i = 0; i < 50; i++) expect(checkPassword(generateTemporaryPassword()).ok).toBe(true);
  });
});

describe('nombres de usuario', () => {
  it('valida el formato', () => {
    expect(validateUsername('admin')).toBeNull();
    expect(validateUsername('maria.lopez')).toBeNull();
    expect(validateUsername('a')).not.toBeNull();
    expect(validateUsername('<script>')).not.toBeNull();
    expect(validateUsername('user@mail.com')).not.toBeNull();
  });
});

describe('hash PBKDF2', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('Correct-Horse-9', undefined, 1000);
    expect(await verifyPassword('Correct-Horse-9', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
});

describe('TOTP', () => {
  it('valida el código actual y rechaza su reutilización', () => {
    const secret = createTotpSecret();
    const code = buildTotp(secret, 'test').generate();
    const counter = validateTotp(secret, code);
    expect(counter).not.toBeNull();
    expect(validateTotp(secret, code, counter!)).toBeNull();
    expect(validateTotp(secret, '000000'.replace(/./g, (_, i) => String((Number(code[i]) + 1) % 10)))).toBeNull();
  });
});

describe('repetición espaciada', () => {
  it('sube de caja al acertar y vuelve a la 1 al fallar', () => {
    const c1 = review(undefined, true, 0);
    expect(c1.box).toBe(2);
    const c2 = review(c1, true, 0);
    expect(c2.box).toBe(3);
    expect(review(c2, false, 0).box).toBe(1);
  });
});

describe('similitud de frases', () => {
  it('ignora mayúsculas y puntuación', () => {
    expect(similarity('Hello, my name is Ana.', 'hello my name is ana')).toBe(1);
    expect(similarity('I am from Colombia', 'I from Colombia')).toBeGreaterThan(0.7);
  });
});

describe('lectura asistida', () => {
  it('agrupa expresiones de varias palabras del glosario', () => {
    const gloss = new Map([['brother and sister', 'hermanos']]);
    const tokens = tokenize('They are brother and sister.', gloss);
    expect(tokens.some((t) => t.key === 'brother and sister')).toBe(true);
  });
});

describe('elección de voz', () => {
  const voice = (name: string, lang = 'en-US') => ({ name, lang, localService: true });
  it('prefiere voces neuronales/naturales sobre las robóticas', () => {
    const natural = scoreVoice(voice('Microsoft Aria Online (Natural) - English (United States)'));
    const google = scoreVoice(voice('Google US English'));
    const basic = scoreVoice(voice('Microsoft David - English (United States)'));
    const robot = scoreVoice(voice('eSpeak English'));
    expect(natural).toBeGreaterThan(google);
    expect(google).toBeGreaterThan(basic);
    expect(basic).toBeGreaterThan(robot);
    expect(scoreVoice(voice('Paulina', 'es-MX'))).toBeLessThan(robot);
  });
  it('trocea textos largos por frases', () => {
    const long = 'First sentence here. '.repeat(20);
    const parts = splitForSpeech(long);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(200));
    expect(splitForSpeech('Hello there')).toEqual(['Hello there']);
  });
});

describe('randomInt', () => {
  it('devuelve valores en rango y cubre todos', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const r = randomInt(7);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(7);
      seen.add(r);
    }
    expect(seen.size).toBe(7);
  });
});

describe('audios pregenerados', () => {
  it('audioId coincide con scripts/generate-audio.py', async () => {
    expect(await audioId('af_heart', '  I’m a systems engineer. ')).toBe('520135ee0f4189cc');
  });
  it('el catálogo incluye vocabulario y diálogos con dos voces', async () => {
    const levels = await loadAllLevels();
    const items = collectSpeech(levels);
    const texts = new Set(items.map((i) => `${i.voice}|${i.text}`));
    const t = levels[0]!.topics[0]!;
    expect(texts.has(`0|${t.vocabulary[0]!.term}`)).toBe(true);
    expect(items.some((i) => i.voice === 1)).toBe(true);
  });
});
