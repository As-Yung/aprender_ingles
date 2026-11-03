import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS, loadLevel } from '../../content';
import type { LevelId } from '../../content/types';
import { useProgress } from '../../core/progress/ProgressContext';
import { readJson, writeJson } from '../../core/security/storage';
import { speak, stopSpeaking } from '../../core/speech/speech';
import { BossDibujo, Estrella, FiltroTiza, PersonajeDibujo } from './drawings';
import { animar, color, confeti, Efectos, esperar, sonar, type Sonido } from './fx';
import {
  ADIVINANZAS,
  BOSSES,
  Juego,
  NIVEL_FINAL,
  NOMBRE_TIPO,
  PERSONAJES,
  PERSONAJES_NORMALES,
  RACHA_CRITICO,
  seleccionarSecreto,
  VIDA_POR_PUNTO,
  limpiarEs,
  type Evento,
  type Fin,
  type PersonajeId,
  type Personaje,
  type Pregunta,
  type Stat,
} from './logic';
import { useServerRun } from '../arcade/api';
import { Leaderboard } from '../arcade/Leaderboard';
import { Es } from '../../components/Es';
import './vocab-game.css';

const PREFS_KEY = 'aprender-ingles.vocab-game';

interface Prefs {
  nivel: LevelId;
  sonido: boolean;
  voz: boolean;
  secretos: PersonajeId[];
  /** Mejor número de bosses vencidos por nivel. */
  record: Partial<Record<LevelId, number>>;
}

function leerPrefs(): Prefs {
  const p = readJson<Partial<Prefs>>('local', PREFS_KEY, {});
  return {
    nivel: LEVELS.some((l) => l.id === p.nivel) ? p.nivel! : 'a1',
    sonido: p.sonido !== false,
    voz: p.voz !== false,
    secretos: Array.isArray(p.secretos) ? p.secretos.filter((s): s is PersonajeId => s === 'hacker' || s === 'ia') : [],
    record: p.record && typeof p.record === 'object' ? p.record : {},
  };
}

const NUM = new Intl.NumberFormat('es');
const n = (x: number) => NUM.format(x);
const ELOGIOS = ['Well done!', 'Great!', 'Correct!', 'That’s it!', 'Excellent!', 'Bravo!', 'Nice!', 'Great job!'];

const MEJORAS: { stat: Stat; nombre: string; ayuda: string; valor: (pj: Personaje) => number; suma: number }[] = [
  { stat: 'vida', nombre: 'HP', ayuda: 'Take more hits', valor: (pj) => pj.vidaMax, suma: VIDA_POR_PUNTO },
  { stat: 'ataque', nombre: 'Attack', ayuda: 'Deal more damage', valor: (pj) => pj.ataque, suma: 1 },
  { stat: 'velocidad', nombre: 'Speed', ayuda: 'More double hits', valor: (pj) => pj.velocidad, suma: 1 },
  { stat: 'esquiva', nombre: 'Dodge', ayuda: 'Avoid more hits', valor: (pj) => pj.esquiva, suma: 1 },
];

type Linea = { texto: string; clase?: string };

export default function VocabGamePage() {
  const { reviewWord } = useProgress();
  const server = useServerRun();
  const [boardKey, setBoardKey] = useState(0);
  const [prefs, setPrefsState] = useState<Prefs>(leerPrefs);
  const setPrefs = (cambio: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...cambio };
      writeJson('local', PREFS_KEY, next);
      return next;
    });

  const juegoRef = useRef<Juego | null>(null);
  const [, repintar] = useReducer((x: number) => x + 1, 0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [respondida, setRespondida] = useState<{ elegida: string; acierto: boolean } | null>(null);
  const [mensaje, setMensaje] = useState<Linea | null>(null);
  const [registro, setRegistro] = useState<Linea[]>([]);
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>(null);
  const [capa, setCapa] = useState<'nivel' | 'fin' | 'rendirse' | null>(null);
  const [fin, setFin] = useState<Fin>(null);
  const [bossVisible, setBossVisible] = useState(true);
  const [preguntaN, setPreguntaN] = useState(0);
  /** Pregunta en pantalla: sigue visible mientras se anima el turno ya respondido. */
  const [mostrada, setMostrada] = useState<Pregunta | null>(null);
  const [adivinanza, setAdivinanza] = useState('');
  const [msgAdivinanza, setMsgAdivinanza] = useState<Linea | null>(null);
  const ocupado = useRef(false);

  const raizRef = useRef<HTMLDivElement>(null);
  const escenarioRef = useRef<HTMLElement>(null);
  const efectosRef = useRef<HTMLDivElement>(null);
  const spriteJRef = useRef<HTMLDivElement>(null);
  const spriteBRef = useRef<HTMLDivElement>(null);
  const confetiRef = useRef<HTMLCanvasElement>(null);

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const sonarSi = useCallback((s: Sonido) => sonar(s, prefsRef.current.sonido), []);
  const decir = useCallback((texto: string) => {
    if (prefsRef.current.voz) void speak(texto);
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  const juego = juegoRef.current;

  // En "Escucha y elige" la palabra se lee sola al aparecer.
  useEffect(() => {
    if (mostrada?.tipo === 'escucha') void speak(mostrada.audio);
  }, [mostrada]);

  const anotar = (texto: string, clase?: string) => setRegistro((r) => [...r.slice(-80), { texto, clase }]);
  const anunciar = (texto: string) => setAnuncio((a) => ({ texto, n: (a?.n ?? 0) + 1 }));

  /* ---------- Inicio ---------- */

  async function empezar(id: PersonajeId) {
    if (cargando) return;
    setCargando(true);
    setError('');
    try {
      const level = await loadLevel(prefs.nivel);
      sonarSi('nivel');
      juegoRef.current = new Juego(id, level);
      void server.start('boss', prefs.nivel);
    } catch {
      setError('Could not load the vocabulary for this level. Check your connection and try again.');
      setCargando(false);
      return;
    }
    const j = juegoRef.current!;
    ocupado.current = false;
    efectos()?.limpiar();
    setRegistro([{ texto: `You start as ${j.pj.nombre} at level ${prefs.nivel.toUpperCase()}.`, clase: 'especial' }]);
    setRespondida(null);
    setMensaje(null);
    setFin(null);
    setCapa(null);
    setBossVisible(true);
    setCargando(false);
    setMostrada(j.pregunta);
    setPreguntaN((x) => x + 1);
    window.scrollTo(0, 0);
    anunciar(`${j.bs.nombre} appears!`);
  }

  function enviarAdivinanza(e: FormEvent) {
    e.preventDefault();
    const id = seleccionarSecreto(adivinanza);
    if (!id) {
      setMsgAdivinanza({ texto: 'Hmm, that’s not it. Try again! (answer in English)' });
      sonarSi('error');
      return;
    }
    if (!prefs.secretos.includes(id)) setPrefs({ secretos: [...prefs.secretos, id] });
    setMsgAdivinanza({ texto: `Correct! You unlocked ${PERSONAJES[id].nombre}.`, clase: 'bien' });
    setAdivinanza('');
    sonarSi('victoria');
  }

  /* ---------- Batalla ---------- */

  const efectos = () =>
    escenarioRef.current && efectosRef.current ? new Efectos(escenarioRef.current, efectosRef.current) : null;

  async function responder(valor: string) {
    const j = juegoRef.current;
    if (ocupado.current || !j || j.fin || j.puntosPendientes > 0 || !j.pregunta) return;
    ocupado.current = true;
    const p = j.pregunta;
    const acierto = valor === p.respuesta;
    setRespondida({ elegida: valor, acierto });
    const { item } = p.palabra;
    const traduccion = `${item.term} = ${item.es}`;
    if (acierto) {
      setMensaje({ texto: `${ELOGIOS[Math.floor(Math.random() * ELOGIOS.length)]} ${traduccion}`, clase: 'bien' });
      sonarSi('acierto');
    } else {
      setMensaje({ texto: `Almost. It was “${p.respuesta}”. ${traduccion}`, clase: 'mal' });
      sonarSi('error');
    }
    reviewWord(`${j.nivelIngles}/${p.palabra.topicId}/${item.term}`, acierto);
    setTimeout(() => decir(p.audio), 250);

    void server.answer(j.turno, acierto);
    const resultado = j.responder(valor);
    anotar(`Question ${j.turno}: ${traduccion}${acierto ? ' (correct)' : ` (you answered “${valor}”)`}`, 'turno');
    repintar();

    for (const ev of resultado.eventos) await mostrarEvento(ev);

    repintar();
    if (resultado.fin) {
      mostrarFin(resultado.fin);
    } else if (j.puntosPendientes > 0) {
      setCapa('nivel');
    } else {
      await esperar(acierto ? 500 : 1400);
      siguientePregunta();
    }
    ocupado.current = false;
  }

  function siguientePregunta() {
    setRespondida(null);
    setMensaje(null);
    setMostrada(juegoRef.current?.pregunta ?? null);
    setPreguntaN((x) => x + 1);
  }

  async function mostrarEvento(ev: Evento) {
    const spriteJ = spriteJRef.current;
    const spriteB = spriteBRef.current;
    const fx = efectos();
    const raiz = raizRef.current!;
    if (!spriteJ || !spriteB || !fx) return;
    switch (ev.tipo) {
      case 'acierto':
      case 'error':
        await esperar(500);
        return;

      case 'golpeJugador':
        void animar(spriteJ, [{ transform: 'none' }, { transform: 'translateX(18%) rotate(4deg)' }, { transform: 'none' }], { duration: 380 });
        await fx.proyectil(spriteJ, spriteB, ev.critico ? 'critico' : '');
        sonarSi(ev.critico ? 'critico' : 'golpe');
        void animar(
          spriteB,
          [
            { transform: 'none', filter: 'none' },
            { transform: 'translateX(10px) rotate(4deg)', filter: 'brightness(1.8)' },
            { transform: 'translateX(-8px) rotate(-3deg)' },
            { transform: 'none', filter: 'none' },
          ],
          { duration: 380 },
        );
        fx.particulas(spriteB, color(ev.critico ? '--tiza-naranja' : '--tiza-amarilla', raiz), ev.critico ? 14 : 8);
        fx.flotante(spriteB, `${ev.critico ? 'Critical! ' : ''}−${n(ev.danio)}`, ev.critico ? 'critico' : '');
        anotar(ev.texto, 'bueno');
        repintar();
        await esperar(450);
        return;

      case 'bossEsquiva':
        void animar(spriteB, [{ transform: 'none' }, { transform: 'translateX(26%) skewX(8deg)', offset: 0.4 }, { transform: 'none' }], { duration: 650 });
        await fx.proyectil(spriteJ, spriteB);
        sonarSi('esquiva');
        fx.flotante(spriteB, 'Dodged!', 'esquiva');
        anotar(ev.texto, 'malo');
        await esperar(450);
        return;

      case 'golpeBoss':
        void animar(spriteB, [{ transform: 'none' }, { transform: 'translateX(-18%) rotate(-5deg)' }, { transform: 'none' }], { duration: 380 });
        await fx.proyectil(spriteB, spriteJ, 'enemigo');
        sonarSi('dolor');
        void animar(
          spriteJ,
          [{ transform: 'none' }, { transform: 'translateX(-10px) rotate(-4deg)' }, { transform: 'translateX(8px) rotate(3deg)' }, { transform: 'none' }],
          { duration: 380 },
        );
        {
          const esc = escenarioRef.current;
          esc?.classList.remove('dolor');
          void esc?.offsetWidth;
          esc?.classList.add('dolor');
        }
        fx.particulas(spriteJ, color('--tiza-roja', raiz), 8);
        fx.flotante(spriteJ, `−${n(ev.danio)}`);
        anotar(ev.texto, 'malo');
        repintar();
        await esperar(450);
        return;

      case 'jugadorEsquiva':
        void animar(spriteJ, [{ transform: 'none' }, { transform: 'translateX(-26%) skewX(-8deg)', offset: 0.4 }, { transform: 'none' }], { duration: 650 });
        await fx.proyectil(spriteB, spriteJ, 'enemigo');
        sonarSi('esquiva');
        fx.flotante(spriteJ, 'You dodged!', 'esquiva');
        anotar(ev.texto, 'bueno');
        await esperar(450);
        return;

      case 'bossDerrotado':
        sonarSi('victoria');
        fx.particulas(spriteB, color('--tiza', raiz), 18);
        anunciar(`You beat ${ev.nombre}!`);
        anotar(ev.texto, 'especial');
        confeti(confetiRef.current, raiz, 70, 1800);
        await animar(
          spriteB,
          [
            { transform: 'none', opacity: 1 },
            { transform: 'translateY(8%) rotate(-12deg) scale(0.9)', opacity: 0.8, offset: 0.3 },
            { transform: 'translateY(30%) rotate(-30deg) scale(0.4)', opacity: 0 },
          ],
          { duration: 900, easing: 'ease-in' },
        );
        setBossVisible(false);
        await esperar(700);
        return;

      case 'nuevoBoss':
        setBossVisible(true);
        repintar();
        await esperar(30);
        void animar(
          spriteBRef.current,
          [
            { transform: 'translateX(120%)', opacity: 0 },
            { transform: 'translateX(-6%)', opacity: 1, offset: 0.7 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 700, easing: 'ease-out' },
        );
        anunciar(`${ev.nombre} appears!`);
        if (ev.curado > 0) fx.flotante(spriteJ, `+${n(ev.curado)}`, 'cura');
        anotar(ev.texto, 'especial');
        await esperar(1300);
        return;

      case 'subeNivel':
        sonarSi('nivel');
        anunciar(`Level ${ev.nivel}!`);
        anotar(ev.texto, 'especial');
        repintar();
        await esperar(900);
        return;
    }
  }

  function elegirMejora(stat: Stat, nombre: string, suma: number) {
    const j = juegoRef.current;
    if (!j) return;
    j.asignarPunto(stat);
    sonarSi('acierto');
    anotar(`+${suma} ${nombre}.`, 'bueno');
    if (j.puntosPendientes === 0) {
      setCapa(null);
      siguientePregunta();
    } else {
      repintar();
    }
  }

  function mostrarFin(resultado: Exclude<Fin, null>) {
    const j = juegoRef.current!;
    const vencidos = resultado === 'victoria' ? NIVEL_FINAL : j.bs.nivel - 1;
    if (vencidos > (prefs.record[j.nivelIngles] ?? 0)) setPrefs({ record: { ...prefs.record, [j.nivelIngles]: vencidos } });
    if (resultado === 'victoria') {
      sonarSi('victoria');
      confeti(confetiRef.current, raizRef.current!, 180, 3500);
    } else {
      sonarSi('derrota');
    }
    setFin(resultado);
    setCapa('fin');
    void server.finish().then(() => setBoardKey((k) => k + 1));
  }

  function volverAlInicio() {
    stopSpeaking();
    void server.finish().then(() => setBoardKey((k) => k + 1));
    setCapa(null);
    setFin(null);
    juegoRef.current = null;
    setMostrada(null);
    ocupado.current = false;
    repintar();
    window.scrollTo(0, 0);
  }

  /* ---------- Teclado ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!juegoRef.current) return;
      if (capa) {
        if (e.key === 'Escape' && capa === 'rendirse') setCapa(null);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const i = parseInt(e.key, 10);
      if (i >= 1 && i <= 4) {
        const b = raizRef.current?.querySelectorAll<HTMLButtonElement>('.opciones .opcion')[i - 1];
        if (b && !b.disabled) b.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [capa]);

  useEffect(() => {
    if (capa === 'nivel' || capa === 'fin' || capa === 'rendirse') {
      raizRef.current?.querySelector<HTMLButtonElement>('.capa:not([hidden]) button')?.focus();
    }
  }, [capa]);

  /* ---------- Pintado ---------- */

  const cabecera = (
    <header className="cabecera">
      <h1 className="titulo">Vocab Boss Game</h1>
      <div className="botones-cabecera">
        <button type="button" className="boton-sonido" aria-pressed={prefs.sonido} onClick={() => {
          setPrefs({ sonido: !prefs.sonido });
          sonar('acierto', !prefs.sonido);
        }}>
          Sound: {prefs.sonido ? 'on' : 'off'}
        </button>
        <button type="button" className="boton-sonido" aria-pressed={prefs.voz} onClick={() => setPrefs({ voz: !prefs.voz })}>
          Voice: {prefs.voz ? 'on' : 'off'}
        </button>
      </div>
    </header>
  );

  if (!juego) {
    const personajes = [...PERSONAJES_NORMALES, ...prefs.secretos];
    return (
      <div className="vbg" ref={raizRef}>
        <FiltroTiza />
        {cabecera}
        <main className="pantalla">
          <p className="lema">
            Answer English vocabulary questions to attack the bosses. Beat all 10 to win. It uses all the vocabulary of
            your level: systems, IoT, cybersecurity, AI, data and servers.
          </p>

          <section className="bloque" aria-labelledby="vbg-nivel">
            <h2 id="vbg-nivel" className="subtitulo">
              <span className="paso">1</span> Choose your level
            </h2>
            <div className="dificultades niveles" role="radiogroup" aria-labelledby="vbg-nivel">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.nivel === l.id}
                  className="dificultad"
                  onClick={() => {
                    setPrefs({ nivel: l.id });
                    sonarSi('golpe');
                  }}
                >
                  <b>{l.name}</b>
                  <span>{l.label}</span>
                  {prefs.record[l.id] ? <span className="record">★ {prefs.record[l.id]}/10</span> : null}
                </button>
              ))}
            </div>
          </section>

          <section className="bloque" aria-labelledby="vbg-personajes">
            <h2 id="vbg-personajes" className="subtitulo">
              <span className="paso">2</span> Choose your character
            </h2>
            {error && <p className="mensaje">{error}</p>}
            <div className="personajes">
              {personajes.map((id) => {
                const b = PERSONAJES[id];
                const filas: [string, number, number][] = [
                  ['HP', b.vida, 40],
                  ['Attack', b.ataque, 40],
                  ['Speed', b.velocidad, 22],
                  ['Dodge', b.esquiva, 18],
                ];
                return (
                  <button key={id} type="button" className={`carta ${b.secreto ? 'secreta' : ''}`} disabled={cargando} onClick={() => void empezar(id)}>
                    <span className="carta-cabecera">
                      <PersonajeDibujo id={id} />
                      <span>
                        <span className="carta-nombre" style={{ display: 'block' }}>
                          {b.nombre}
                        </span>
                        <span className="carta-lema" style={{ display: 'block' }}>
                          {b.secreto ? '⭐ Secret · ' : ''}
                          {b.lema}
                        </span>
                      </span>
                    </span>
                    <dl className="mini-stats">
                      {filas.map(([nombre, valor, max]) => (
                        <div key={nombre} style={{ display: 'contents' }}>
                          <dt>{nombre}</dt>
                          <span className="mini-barra" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, (valor / max) * 100)}%` }} />
                          </span>
                          <dd>{valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </button>
                );
              })}
            </div>
            {cargando && <p className="nota">Loading vocabulary…</p>}
          </section>

          <section className="bloque adivinanzas" aria-labelledby="vbg-adivinanzas">
            <h2 id="vbg-adivinanzas" className="subtitulo">
              Bonus riddles!
            </h2>
            <p className="nota">Answer in English. Solve one to unlock a secret character that gets 4 points per level.</p>
            <ol className="lista-adivinanzas">
              {ADIVINANZAS.map((a) => (
                <li key={a.en}>
                  {a.en}
                  <small><Es text={a.es} level={prefs.nivel} /></small>
                </li>
              ))}
            </ol>
            <form className="form-adivinanza" autoComplete="off" onSubmit={enviarAdivinanza}>
              <label htmlFor="vbg-respuesta" className="etiqueta">
                Your answer
              </label>
              <div className="fila-adivinanza">
                <input
                  id="vbg-respuesta"
                  type="text"
                  placeholder="Write one word"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={40}
                  value={adivinanza}
                  onChange={(e) => setAdivinanza(e.target.value)}
                />
                <button type="submit" className="boton">
                  Try
                </button>
              </div>
              <p className={`mensaje ${msgAdivinanza?.clase ?? ''}`} role="status">
                {msgAdivinanza?.texto}
              </p>
            </form>
          </section>

          <section className="bloque" aria-labelledby="vbg-ranking">
            <h2 id="vbg-ranking" className="subtitulo">
              🏆 Leaderboard
            </h2>
            <Leaderboard game="boss" level={prefs.nivel} onLevel={(l) => setPrefs({ nivel: l })} refreshKey={boardKey} />
          </section>

          <section className="bloque" aria-labelledby="vbg-duelo">
            <h2 id="vbg-duelo" className="subtitulo">
              ⚔️ Duel other players
            </h2>
            <p className="nota">Challenge someone who is online at your level. Answer correctly to knock out your rival.</p>
            <div>
              <Link to="/duelo" className="boton" style={{ display: 'inline-block', textDecoration: 'none' }}>
                Go to the duel lobby
              </Link>
            </div>
          </section>

          <details className="bloque instrucciones">
            <summary className="subtitulo">How to play</summary>
            <ul>
              <li>A right answer attacks the boss. A wrong answer lets the boss attack you.</li>
              <li>
                With {RACHA_CRITICO} right answers in a row you land a <b>critical hit</b> that deals extra damage.
              </li>
              <li>
                There are 4 question types: <b>What does it mean?</b>, <b>Say it in English</b>, <b>Listen and choose</b> and{' '}
                <b>Complete the sentence</b>. Every two bosses the questions get a bit harder.
              </li>
              <li>Words you miss come back soon, and at the end you get a list to review them.</li>
              <li>Every answer counts toward your vocabulary review (spaced repetition).</li>
              <li>
                <b>HP</b>: how much damage you can take. <b>Attack</b>: how much damage you deal. <b>Speed</b>: chance to hit
                dos veces. <b>Esquiva</b>: probabilidad de evitar los golpes.
              </li>
              <li>When you beat a boss you recover HP and the next one appears.</li>
              <li>On a computer you can answer with keys 1 to 4.</li>
            </ul>
          </details>
        </main>
        <footer className="pie">Based on Logic Boss Game, the university project by Santiago Quiroga Torres.</footer>
      </div>
    );
  }

  const { pj, bs } = juego;
  const pctVida = (a: number, m: number) => (m > 0 ? Math.max(0, Math.min(1, a / m)) : 0);
  const claseVida = (a: number, m: number) => {
    const x = pctVida(a, m);
    return x <= 0.3 ? 'baja' : x <= 0.6 ? 'media' : '';
  };
  const llenas = Math.min(juego.racha, RACHA_CRITICO);
  const rachaLista = juego.racha >= RACHA_CRITICO - 1;
  const repaso = [...new Map(juego.fallos.map((f) => [f.palabra.item.term, f.palabra])).values()];

  return (
    <div className="vbg" ref={raizRef}>
      <FiltroTiza />
      {cabecera}
      <main className="pantalla">
        <ol className="mapa" aria-label="Bosses">
          {BOSSES.map((b, i) => {
            const nivel = i + 1;
            const estado = nivel < bs.nivel || fin === 'victoria' ? 'vencido' : nivel === bs.nivel ? 'actual' : '';
            return (
              <li key={b.nombre} className={estado} aria-label={`Boss ${nivel}: ${b.nombre}${estado === 'vencido' ? ', defeated' : estado === 'actual' ? ', now' : ''}`}>
                <BossDibujo forma={b.forma} corona={b.corona} />
              </li>
            );
          })}
        </ol>

        <section className="escenario" ref={escenarioRef} aria-label="Battle">
          <div className="luchador jugador">
            <div className="sprite" ref={spriteJRef}>
              <PersonajeDibujo id={pj.id} />
            </div>
            <div className="placa">
              <p className="nombre">
                <span>{pj.nombre}</span> <span className="nivel">Lv. {pj.nivel}</span>
              </p>
              <Barra clase={`barra-vida ${claseVida(pj.vida, pj.vidaMax)}`} etiqueta="Your HP" actual={pj.vida} maximo={pj.vidaMax} />
              <p className="cifras">
                HP {n(pj.vida)} / {n(pj.vidaMax)}
              </p>
              <Barra clase="barra-exp" etiqueta="Experience" actual={juego.exp.actual} maximo={juego.exp.necesaria} />
              <p className="cifras">
                EXP {n(Math.max(0, juego.exp.actual))} / {n(juego.exp.necesaria)}
              </p>
            </div>
          </div>
          <div className="luchador boss">
            <div className="sprite" ref={spriteBRef} style={{ opacity: bossVisible ? undefined : 0 }}>
              <BossDibujo key={bs.nivel} forma={bs.forma} corona={bs.corona} />
            </div>
            <div className="placa">
              <p className="nombre">
                <span>{bs.nombre}</span>{' '}
                <span className="nivel">
                  Lv. {bs.nivel} of {NIVEL_FINAL}
                </span>
              </p>
              <Barra clase="barra-vida" etiqueta="Boss HP" actual={bs.vida} maximo={bs.vidaMax} />
              <p className="cifras">
                HP {n(bs.vida)} / {n(bs.vidaMax)}
              </p>
            </div>
          </div>
          <div className="efectos" ref={efectosRef} aria-hidden="true" />
          {anuncio && (
            <p key={anuncio.n} className="anuncio visible" aria-live="assertive">
              {anuncio.texto}
            </p>
          )}
        </section>

        <section className="pregunta" aria-label="Question">
          <div className="pregunta-cabecera">
            <p className="tipo-pregunta">{mostrada ? `${NOMBRE_TIPO[mostrada.tipo]} · ${juego.nivelIngles.toUpperCase()}` : ''}</p>
            <div className={`racha ${rachaLista ? 'lista' : ''}`} aria-live="polite">
              <span>{rachaLista ? 'Next hit: critical!' : 'Streak'}</span>
              {Array.from({ length: RACHA_CRITICO }, (_, i) => (
                <Estrella key={i} className={i < llenas ? 'llena' : ''} />
              ))}
            </div>
          </div>

          {mostrada && (
            <>
              <Enunciado key={preguntaN} pregunta={mostrada} revelada={!!respondida} />
              <div className="opciones texto">
                {mostrada.opciones.map((op, i) => {
                  const clase = respondida
                    ? op === mostrada.respuesta
                      ? 'correcta'
                      : op === respondida.elegida
                        ? 'incorrecta'
                        : ''
                    : '';
                  return (
                    <button
                      key={`${preguntaN}-${op}`}
                      type="button"
                      className={`opcion ${clase}`}
                      disabled={!!respondida || !!capa}
                      onClick={() => void responder(op)}
                      aria-label={`Answer ${op}`}
                    >
                      <span className="tecla">{i + 1}</span>
                      {op}
                    </button>
                  );
                })}
              </div>
              <p className="tema">Topic: {mostrada.palabra.topicTitle}</p>
            </>
          )}
          <p className={`respuesta-mensaje ${mensaje?.clase ?? ''}`} role="status">
            {mensaje?.texto}
          </p>
        </section>

        <div className="pie-batalla">
          <details className="registro">
            <summary>Battle log</summary>
            <ol className="lista-registro">
              {registro.map((l, i) => (
                <li key={i} className={l.clase}>
                  {l.texto}
                </li>
              ))}
            </ol>
          </details>
          <button type="button" className="boton boton-secundario" onClick={() => setCapa('rendirse')}>
            Give up
          </button>
        </div>
      </main>

      {capa === 'nivel' && (
        <div className="capa">
          <div className="ventana" role="dialog" aria-modal="true" aria-labelledby="vbg-titulo-nivel">
            <h2 id="vbg-titulo-nivel" className="subtitulo">
              Level up!
            </h2>
            <p>
              You have <b>{juego.puntosPendientes === 1 ? '1 point' : `${juego.puntosPendientes} points`}</b> left to upgrade your
              character.
            </p>
            <div className="mejoras">
              {MEJORAS.map((m) => (
                <button key={m.stat} type="button" className="mejora" onClick={() => elegirMejora(m.stat, m.nombre, m.suma)}>
                  <b>{m.nombre}</b>
                  <span>
                    {n(m.valor(pj))} → {n(m.valor(pj) + m.suma)}
                  </span>
                  <small>{m.ayuda}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {capa === 'fin' && (
        <div className="capa">
          <div className="ventana ventana-fin" role="dialog" aria-modal="true" aria-labelledby="vbg-titulo-fin">
            <div className={`sprite-fin ${fin === 'victoria' ? '' : 'triste'}`}>
              <PersonajeDibujo id={pj.id} />
            </div>
            <h2 id="vbg-titulo-fin" className="subtitulo">
              {fin === 'victoria' ? 'You beat every boss!' : 'Nice try!'}
            </h2>
            <p>
              {fin === 'victoria'
                ? `${pj.nombre} defeated ${bs.nombre}. Your ${juego.nivelIngles.toUpperCase()} vocabulary is champion level!`
                : `${bs.nombre} won this time. Review the words and try again.`}
            </p>
            <dl className="resumen">
              <div>
                <dt>Bosses beaten</dt>
                <dd>{fin === 'victoria' ? NIVEL_FINAL : bs.nivel - 1}</dd>
              </div>
              <div>
                <dt>Correct</dt>
                <dd>
                  {juego.aciertos}/{juego.turno}
                </dd>
              </div>
              <div>
                <dt>Best streak</dt>
                <dd>{juego.mejorRacha}</dd>
              </div>
            </dl>
            {server.current() && (
              <p className="nota">
                ⭐ Score: <b>{server.current()!.score.toLocaleString('en')}</b> (saved on the leaderboard)
              </p>
            )}
            {repaso.length > 0 && (
              <>
                <p className="etiqueta">Words to review</p>
                <ul className="repaso">
                  {repaso.map((w) => (
                    <li key={w.item.term}>
                      <button type="button" className="boton-sonido" onClick={() => void speak(w.item.term)} aria-label={`Listen to ${w.item.term}`}>
                        🔊
                      </button>
                      <span aria-hidden="true">{w.item.emoji}</span>
                      <b>{w.item.term}</b>
                      <Es text={w.item.es} level={juego.nivelIngles} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="acciones">
              <button type="button" className="boton" onClick={volverAlInicio}>
                Play again
              </button>
            </div>
          </div>
        </div>
      )}

      {capa === 'rendirse' && (
        <div className="capa">
          <div className="ventana" role="dialog" aria-modal="true" aria-labelledby="vbg-titulo-rendirse">
            <h2 id="vbg-titulo-rendirse" className="subtitulo">
              Give up?
            </h2>
            <p>You will lose this game and go back to choosing a character.</p>
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setCapa(null)}>
                Keep playing
              </button>
              <button type="button" className="boton" onClick={volverAlInicio}>
                Give up
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas className="confeti" ref={confetiRef} aria-hidden="true" />
    </div>
  );
}

export function Barra({ clase, etiqueta, actual, maximo }: { clase: string; etiqueta: string; actual: number; maximo: number }) {
  const pct = maximo > 0 ? Math.max(0, Math.min(1, actual / maximo)) : 0;
  return (
    <div className={`barra ${clase}`} role="meter" aria-label={etiqueta} aria-valuemin={0} aria-valuemax={maximo} aria-valuenow={Math.max(0, actual)}>
      <span style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Enunciado({ pregunta, revelada }: { pregunta: Pregunta; revelada: boolean }) {
  const { item } = pregunta.palabra;
  const oir = (texto: string, grande = false) => (
    <button type="button" className={`boton-oir ${grande ? 'grande' : ''}`} onClick={() => void speak(texto)} aria-label={`Listen: ${texto}`}>
      🔊
    </button>
  );
  switch (pregunta.tipo) {
    case 'significado':
      return (
        <p className="palabra nueva" lang="en">
          {item.term} {oir(item.term)}
        </p>
      );
    case 'traduce':
      return (
        <>
          <p className="palabra nueva">
            <span className="emoji" aria-hidden="true">
              {item.emoji}
            </span>
            {limpiarEs(item.es)}
          </p>
          {revelada && (
            <p className="pista" lang="en">
              {item.term} {oir(item.term)}
            </p>
          )}
        </>
      );
    case 'escucha':
      return (
        <>
          <div className="palabra nueva">{oir(item.term, true)}</div>
          <p className="pista" lang={revelada ? 'en' : undefined}>
            {revelada ? item.term : 'Tap 🔊 to hear it again'}
          </p>
        </>
      );
    case 'completa':
      return (
        <>
          <p className="frase nueva" lang="en">
            {pregunta.antes}
            <span className="hueco">{revelada ? pregunta.respuesta : '?'}</span>
            {pregunta.despues}
          </p>
          <p className="pista">
            {item.exampleEs} {revelada && oir(item.example)}
          </p>
        </>
      );
  }
}
