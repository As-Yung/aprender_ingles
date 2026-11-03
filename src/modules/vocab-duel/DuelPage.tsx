import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS, loadLevel } from '../../content';
import type { LevelId } from '../../content/types';
import { useAuth } from '../../core/auth/AuthContext';
import type { SupabaseAuthService } from '../../core/auth/supabaseAuthService';
import { useProgress } from '../../core/progress/ProgressContext';
import { readJson, writeJson } from '../../core/security/storage';
import { speak, stopSpeaking } from '../../core/speech/speech';
import { FiltroTiza, PersonajeDibujo, Estrella } from '../vocab-game/drawings';
import { animar, color, confeti, Efectos, esperar, sonar, type Sonido } from '../vocab-game/fx';
import { NOMBRE_TIPO, PERSONAJES, palabrasDelNivel, RACHA_CRITICO, type PalabraJuego } from '../vocab-game/logic';
import { Barra, Enunciado } from '../vocab-game/VocabGamePage';
import '../vocab-game/vocab-game.css';
import './duel.css';
import {
  cancelarDesafio,
  desafiar,
  DueloError,
  entrarEnSala,
  escucharJugadas,
  escucharMisDuelos,
  jugar,
  leerDuelo,
  pendientes,
  reclamarAbandono,
  rendirse,
  responderDesafio,
  type Duelo,
  type EnSala,
  type Jugada,
  type PersonajeDuelo,
} from './api';
import { preguntaDuelo } from './questions';
import { BOSS_GAME, buildCtx, findGame, GAMES, gameEmoji, gameName, type ArcadeQuestion, type Ctx } from '../arcade/engine';
import { QuestionView } from '../arcade/QuestionView';
import { Es } from '../../components/Es';

const PERSONAJES_DUELO: PersonajeDuelo[] = ['paladin', 'asesino', 'mago', 'arquero'];
const PREFS_KEY = 'aprender-ingles.vocab-duel';
const JUEGO_PREFS_KEY = 'aprender-ingles.vocab-game';
const ABANDONO_MS = 45_000;
const ESPERA_DESAFIO_MS = 60_000;

interface Prefs {
  nivel: LevelId;
  personaje: PersonajeDuelo;
  juego: string;
}

function leerPrefs(): Prefs {
  const p = readJson<Partial<Prefs>>('local', PREFS_KEY, {});
  const prefsJuego = readJson<{ nivel?: LevelId }>('local', JUEGO_PREFS_KEY, {});
  const nivel = [p.nivel, prefsJuego.nivel].find((n) => LEVELS.some((l) => l.id === n)) ?? 'a1';
  const juego = p.juego === 'boss' || findGame(p.juego) ? p.juego! : 'boss';
  return { nivel, personaje: PERSONAJES_DUELO.includes(p.personaje!) ? p.personaje! : 'paladin', juego };
}

function leerSonido(): { sonido: boolean; voz: boolean } {
  const p = readJson<{ sonido?: boolean; voz?: boolean }>('local', JUEGO_PREFS_KEY, {});
  return { sonido: p.sonido !== false, voz: p.voz !== false };
}

const ELOGIOS = ['Well done!', 'Great!', 'Correct!', 'Nice!', 'Great job!'];

export default function DuelPage() {
  const { service, session } = useAuth();
  if (!service || !session) return null;
  if (service.mode !== 'supabase') {
    return (
      <div className="vbg">
        <h1 className="titulo">Duels</h1>
        <p className="lema">Online duels only work on the published site (with the user server). There are no other players in local development mode.</p>
        <Link to="/juego" className="boton" style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
          Back to the game
        </Link>
      </div>
    );
  }
  return <Sala client={(service as SupabaseAuthService).client} yo={session.user.id} miNombre={session.user.username} />;
}

/* ===================================================================== */
/* Sala de espera                                                         */
/* ===================================================================== */

export function Sala({ client, yo, miNombre }: { client: SupabaseClient; yo: string; miNombre: string }) {
  const [prefs, setPrefsState] = useState<Prefs>(leerPrefs);
  const setPrefs = (c: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...c };
      writeJson('local', PREFS_KEY, next);
      return next;
    });
  const [jugadores, setJugadores] = useState<EnSala[]>([]);
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [enviado, setEnviado] = useState<Duelo | null>(null);
  const [recibido, setRecibido] = useState<Duelo | null>(null);
  const [miRespuesta, setMiRespuesta] = useState<PersonajeDuelo>(prefs.personaje);
  const [activo, setActivo] = useState<Duelo | null>(null);
  const [aviso, setAviso] = useState('');
  const [ahora, setAhora] = useState(Date.now());
  const salaRef = useRef<{ canal: RealtimeChannel; actualizar: (d: EnSala) => void } | null>(null);
  const enviadoRef = useRef<Duelo | null>(null);
  enviadoRef.current = enviado;
  const sonidoRef = useRef(leerSonido());
  const sonarSi = useCallback((s: Sonido) => sonar(s, sonidoRef.current.sonido), []);

  // Reloj para las cuentas atrás.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Retomar un duelo activo o un desafío recibido al entrar.
  useEffect(() => {
    void pendientes(client, yo)
      .then(({ activo: a, recibido: r }) => {
        if (a) setActivo(a);
        else if (r) setRecibido(r);
      })
      .catch(() => undefined);
  }, [client, yo]);

  // Cambios de mis duelos en tiempo real.
  useEffect(() => {
    const canal = escucharMisDuelos(client, yo, (d) => {
      if (d.status === 'pending' && d.opponent === yo) {
        setRecibido(d);
        sonarSi('nivel');
        return;
      }
      if (d.status === 'active') {
        setEnviado(null);
        setRecibido(null);
        setActivo((prev) => (prev && prev.id !== d.id ? prev : d));
        return;
      }
      if (enviadoRef.current?.id === d.id && (d.status === 'declined' || d.status === 'expired' || d.status === 'cancelled')) {
        setEnviado(null);
        if (d.status === 'declined') setAviso(`${d.opponent_name} declined the challenge.`);
        if (d.status === 'expired') setAviso(`${d.opponent_name} did not answer in time.`);
      }
      setRecibido((r) => (r?.id === d.id && d.status !== 'pending' ? null : r));
      setActivo((prev) => (prev?.id === d.id ? d : prev));
    });
    return () => void client.removeChannel(canal);
  }, [client, yo, sonarSi]);

  // Sala de espera (presencia).
  useEffect(() => {
    let cancelado = false;
    void entrarEnSala(
      client,
      { id: yo, name: miNombre, level: prefs.nivel, busy: false },
      (l) => !cancelado && setJugadores(l),
      (ok) => !cancelado && setConectado(ok),
    ).then((s) => {
      if (cancelado) void client.removeChannel(s.canal);
      else salaRef.current = s;
    });
    return () => {
      cancelado = true;
      if (salaRef.current) void client.removeChannel(salaRef.current.canal);
      salaRef.current = null;
    };
    // Solo al montar: los cambios de nivel o estado se publican con actualizar().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, yo]);

  useEffect(() => {
    salaRef.current?.actualizar({ id: yo, name: miNombre, level: prefs.nivel, busy: !!activo || !!enviado || !!recibido });
  }, [prefs.nivel, activo, enviado, recibido, yo, miNombre, conectado]);

  // Al salir de la página se cancela el desafío enviado.
  useEffect(
    () => () => {
      if (enviadoRef.current) void cancelarDesafio(client, enviadoRef.current.id).catch(() => undefined);
    },
    [client],
  );

  // Caducidad de los desafíos (60 s).
  useEffect(() => {
    if (enviado && ahora - Date.parse(enviado.created_at) > ESPERA_DESAFIO_MS + 3000) {
      void cancelarDesafio(client, enviado.id).catch(() => undefined);
      setEnviado(null);
      setAviso(`${enviado.opponent_name} did not answer in time.`);
    }
    if (recibido && ahora - Date.parse(recibido.created_at) > ESPERA_DESAFIO_MS) setRecibido(null);
  }, [ahora, enviado, recibido, client]);

  async function retar(j: EnSala) {
    setAviso('');
    try {
      const d = await desafiar(client, j.id, prefs.nivel, prefs.personaje, prefs.juego);
      setEnviado(d);
      sonarSi('golpe');
    } catch (e) {
      setAviso(e instanceof DueloError ? e.message : 'Could not send the challenge.');
    }
  }

  async function contestar(aceptar: boolean) {
    if (!recibido) return;
    const d = recibido;
    setRecibido(null);
    try {
      const r = await responderDesafio(client, d.id, aceptar, miRespuesta);
      if (aceptar && r.status === 'active') {
        setPrefs({ personaje: miRespuesta });
        setActivo(r);
      } else if (r.status === 'expired') {
        setAviso('That challenge has expired.');
      }
    } catch (e) {
      setAviso(e instanceof DueloError ? e.message : 'Could not answer the challenge.');
    }
  }

  if (activo && activo.seed !== null) {
    return (
      <Combate
        key={activo.id}
        client={client}
        yo={yo}
        inicial={activo}
        alSalir={() => {
          setActivo(null);
          stopSpeaking();
        }}
      />
    );
  }

  const mismoNivel = jugadores.filter((j) => j.level === prefs.nivel);
  const otrosNiveles = jugadores.filter((j) => j.level !== prefs.nivel);
  const restante = (d: Duelo) => Math.max(0, Math.ceil((ESPERA_DESAFIO_MS - (ahora - Date.parse(d.created_at))) / 1000));

  return (
    <div className="vbg">
      <FiltroTiza />
      <header className="cabecera">
        <h1 className="titulo">Duels</h1>
        <Link to="/juego" className="boton-sonido" style={{ textDecoration: 'none' }}>
          ← Back to the game
        </Link>
      </header>
      <main className="pantalla">
        <p className="lema">
          Challenge someone who is online at your level. You both answer the same questions: each right answer attacks your
          rival and each mistake gives them a counterattack. Knock out your rival to win.
        </p>

        <section className="bloque" aria-labelledby="duelo-nivel">
          <h2 id="duelo-nivel" className="subtitulo">
            <span className="paso">1</span> Choose the duel level
          </h2>
          <div className="dificultades niveles" role="radiogroup" aria-labelledby="duelo-nivel">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={prefs.nivel === l.id}
                className="dificultad"
                disabled={!!enviado}
                onClick={() => setPrefs({ nivel: l.id })}
              >
                <b>{l.name}</b>
                <span>{jugadores.filter((j) => j.level === l.id).length} online</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bloque" aria-labelledby="duelo-juego">
          <h2 id="duelo-juego" className="subtitulo">
            <span className="paso">⚔</span> Game
          </h2>
          <select className="arc-select" value={prefs.juego} disabled={!!enviado} onChange={(e) => setPrefs({ juego: e.target.value })} aria-label="Game">
            <option value="boss">
              {BOSS_GAME.emoji} {BOSS_GAME.name}
            </option>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
        </section>

        <section className="bloque" aria-labelledby="duelo-personaje">
          <h2 id="duelo-personaje" className="subtitulo">
            <span className="paso">2</span> Choose your character
          </h2>
          <p className="nota">Secret characters can’t be used in duels.</p>
          <SelectorPersonaje valor={prefs.personaje} alCambiar={(p) => setPrefs({ personaje: p })} />
        </section>

        <section className="bloque" aria-labelledby="duelo-sala">
          <h2 id="duelo-sala" className="subtitulo">
            <span className="paso">3</span> Challenge someone
          </h2>
          {conectado === false && <p className="mensaje">Could not join the lobby. Check your connection and reload the page.</p>}
          {conectado === null && <p className="nota">Joining the lobby…</p>}
          {aviso && (
            <p className="mensaje" role="status">
              {aviso}
            </p>
          )}
          {conectado && mismoNivel.length === 0 && (
            <p className="nota">
              Nobody else is in {prefs.nivel.toUpperCase()} right now. Keep this page open: when someone joins they will appear here.
              {otrosNiveles.length > 0 && ` ${otrosNiveles.length} player(s) in other levels.`}
            </p>
          )}
          <ul className="sala">
            {mismoNivel.map((j) => (
              <li key={j.id}>
                <span className="sala__punto" aria-hidden="true" />
                <b>{j.name}</b>
                <span className="nota">{j.busy ? 'busy' : 'available'}</span>
                <button type="button" className="boton" disabled={j.busy || !!enviado} onClick={() => void retar(j)}>
                  Challenge
                </button>
              </li>
            ))}
          </ul>
        </section>

        <details className="bloque instrucciones">
          <summary className="subtitulo">Duel rules</summary>
          <ul>
            <li>Both players must be online and at the same level. The challenged player has 60 seconds to accept.</li>
            <li>Both players get the same questions, which slowly get harder. Each one answers at their own pace.</li>
            <li>
              Right answer: you attack ({RACHA_CRITICO} in a row is a critical hit). Wrong answer: your rival counterattacks with half their attack.
            </li>
            <li>Every character has triple HP in duels, and the server calculates the hits so the fight is fair.</li>
            <li>If your rival doesn’t answer for 45 seconds, you can claim the win.</li>
          </ul>
        </details>
      </main>

      {enviado && (
        <div className="capa">
          <div className="ventana ventana-fin" role="dialog" aria-modal="true" aria-labelledby="duelo-esperando">
            <h2 id="duelo-esperando" className="subtitulo">
              Waiting for {enviado.opponent_name}…
            </h2>
            <p>
              {gameEmoji(enviado.game)} {gameName(enviado.game)} · Level {enviado.level.toUpperCase()} · {restante(enviado)} s left
            </p>
            <div className="acciones">
              <button
                type="button"
                className="boton boton-secundario"
                onClick={() => {
                  void cancelarDesafio(client, enviado.id).catch(() => undefined);
                  setEnviado(null);
                }}
              >
                Cancel challenge
              </button>
            </div>
          </div>
        </div>
      )}

      {recibido && (
        <div className="capa">
          <div className="ventana" role="dialog" aria-modal="true" aria-labelledby="duelo-recibido">
            <h2 id="duelo-recibido" className="subtitulo">
              ⚔️ {recibido.challenger_name} challenges you!
            </h2>
            <p>
              Game: <b>{gameEmoji(recibido.game)} {gameName(recibido.game)}</b>. Level <b>{recibido.level.toUpperCase()}</b>. Their character: {PERSONAJES[recibido.challenger_char].nombre}. You have{' '}
              {restante(recibido)} s to answer.
            </p>
            <p className="etiqueta">Choose your character</p>
            <SelectorPersonaje valor={miRespuesta} alCambiar={setMiRespuesta} compacto />
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => void contestar(false)}>
                Decline
              </button>
              <button type="button" className="boton" onClick={() => void contestar(true)}>
                Accept!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectorPersonaje({ valor, alCambiar, compacto }: { valor: PersonajeDuelo; alCambiar: (p: PersonajeDuelo) => void; compacto?: boolean }) {
  return (
    <div className={`selector-personaje ${compacto ? 'compacto' : ''}`} role="radiogroup" aria-label="Character">
      {PERSONAJES_DUELO.map((id) => {
        const b = PERSONAJES[id];
        return (
          <button key={id} type="button" role="radio" aria-checked={valor === id} className="carta" onClick={() => alCambiar(id)}>
            <span className="carta-cabecera">
              <PersonajeDibujo id={id} />
              <span>
                <span className="carta-nombre">{b.nombre}</span>
                {!compacto && <span className="carta-lema">{b.lema}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ===================================================================== */
/* Combate                                                                */
/* ===================================================================== */

function Combate({ client, yo, inicial, alSalir }: { client: SupabaseClient; yo: string; inicial: Duelo; alSalir: () => void }) {
  const { reviewWord } = useProgress();
  const [duelo, setDuelo] = useState<Duelo>(inicial);
  const [palabras, setPalabras] = useState<PalabraJuego[] | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [respondida, setRespondida] = useState<{ elegida: string; acierto: boolean; indice: number } | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; clase?: string } | null>(null);
  const [anuncio, setAnuncio] = useState<{ texto: string; n: number } | null>({ texto: 'Duel!', n: 0 });
  const [capa, setCapa] = useState<'rendirse' | null>(null);
  const [fallos, setFallos] = useState<PalabraJuego[]>([]);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(Date.now());
  const enviando = useRef(false);

  const raizRef = useRef<HTMLDivElement>(null);
  const escenarioRef = useRef<HTMLElement>(null);
  const efectosRef = useRef<HTMLDivElement>(null);
  const spriteYoRef = useRef<HTMLDivElement>(null);
  const spriteRivalRef = useRef<HTMLDivElement>(null);
  const confetiRef = useRef<HTMLCanvasElement>(null);
  const vistas = useRef(new Set<number>());
  const cola = useRef<Promise<void>>(Promise.resolve());
  const sonidoRef = useRef(leerSonido());
  const sonarSi = useCallback((s: Sonido) => sonar(s, sonidoRef.current.sonido), []);

  const soyC = duelo.challenger === yo;
  const yoP = {
    nombre: soyC ? duelo.challenger_name : duelo.opponent_name,
    char: (soyC ? duelo.challenger_char : duelo.opponent_char)!,
    hp: (soyC ? duelo.c_hp : duelo.o_hp) ?? 0,
    max: (soyC ? duelo.c_hp_max : duelo.o_hp_max) ?? 1,
    q: soyC ? duelo.c_q : duelo.o_q,
    ok: soyC ? duelo.c_ok : duelo.o_ok,
    racha: soyC ? duelo.c_streak : duelo.o_streak,
  };
  const rival = {
    nombre: soyC ? duelo.opponent_name : duelo.challenger_name,
    char: (soyC ? duelo.opponent_char : duelo.challenger_char)!,
    hp: (soyC ? duelo.o_hp : duelo.c_hp) ?? 0,
    max: (soyC ? duelo.o_hp_max : duelo.c_hp_max) ?? 1,
    q: soyC ? duelo.o_q : duelo.c_q,
    ok: soyC ? duelo.o_ok : duelo.c_ok,
    last: soyC ? duelo.o_last : duelo.c_last,
  };
  const terminado = duelo.status === 'finished';

  useEffect(() => {
    void loadLevel(duelo.level)
      .then((l) => {
        setPalabras(palabrasDelNivel(l));
        setCtx(buildCtx(l));
      })
      .catch(() => setError('Could not load the vocabulary for this level.'));
  }, [duelo.level]);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  const refrescar = useCallback(async () => {
    const d = await leerDuelo(client, inicial.id).catch(() => null);
    if (d) setDuelo(d);
  }, [client, inicial.id]);

  // Cambios del duelo (vida, final) y jugadas del rival en tiempo real.
  useEffect(() => {
    const canalDuelo = client
      .channel(`vbg-duelo-${inicial.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vocab_duels', filter: `id=eq.${inicial.id}` }, (p) =>
        setDuelo(p.new as Duelo),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refrescar();
      });
    const canalJugadas = escucharJugadas(client, inicial.id, (j) => {
      if (j.player !== yo) encolar(j);
    });
    // Respaldo por si se pierde algún evento: refresco periódico.
    const t = setInterval(() => void refrescar(), 10_000);
    return () => {
      clearInterval(t);
      void client.removeChannel(canalDuelo);
      void client.removeChannel(canalJugadas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, inicial.id, yo, refrescar]);

  const juegoArc = duelo.game && duelo.game !== 'boss' ? findGame(duelo.game) : undefined;
  const indiceVisible = respondida ? respondida.indice : yoP.q;
  const pregunta = useMemo(
    () => (!juegoArc && palabras && duelo.seed !== null ? preguntaDuelo(palabras, duelo.seed, indiceVisible) : null),
    [juegoArc, palabras, duelo.seed, indiceVisible],
  );
  const preguntaArc = useMemo<ArcadeQuestion | null>(
    () => (juegoArc && ctx && duelo.seed !== null ? juegoArc.generate(ctx, duelo.seed, indiceVisible) : null),
    [juegoArc, ctx, duelo.seed, indiceVisible],
  );

  useEffect(() => {
    if (pregunta?.tipo === 'escucha' && !respondida && !terminado) void speak(pregunta.audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pregunta?.palabra.item.term, yoP.q]);

  // Fin del duelo.
  const finAnunciado = useRef(false);
  useEffect(() => {
    if (!terminado || finAnunciado.current) return;
    finAnunciado.current = true;
    void cola.current.then(() => {
      if (duelo.winner === yo) {
        sonarSi('victoria');
        confeti(confetiRef.current, raizRef.current!, 160, 3200);
      } else {
        sonarSi('derrota');
      }
    });
  }, [terminado, duelo.winner, yo, sonarSi]);

  const efectos = () => (escenarioRef.current && efectosRef.current ? new Efectos(escenarioRef.current, efectosRef.current) : null);

  function encolar(j: Jugada) {
    if (vistas.current.has(j.id)) return;
    vistas.current.add(j.id);
    cola.current = cola.current.then(() => animarJugada(j)).catch(() => undefined);
  }

  async function animarJugada(j: Jugada) {
    const fx = efectos();
    const sYo = spriteYoRef.current;
    const sRival = spriteRivalRef.current;
    const raiz = raizRef.current;
    if (!fx || !sYo || !sRival || !raiz) return;
    const mia = j.player === yo;
    // Acierto: ataca quien jugó. Fallo: contraataca el otro.
    const atacaYo = mia === j.correct;
    const atacante = atacaYo ? sYo : sRival;
    const defensor = atacaYo ? sRival : sYo;
    const dir = atacaYo ? 1 : -1;
    if (j.dodged) {
      void animar(defensor, [{ transform: 'none' }, { transform: `translateX(${dir * 26}%) skewX(${dir * 8}deg)`, offset: 0.4 }, { transform: 'none' }], {
        duration: 650,
      });
      await fx.proyectil(atacante, defensor, atacaYo ? '' : 'enemigo');
      sonarSi('esquiva');
      fx.flotante(defensor, atacaYo ? 'Dodged!' : 'You dodged!', 'esquiva');
      await esperar(300);
      return;
    }
    for (let g = 0; g < j.hits; g++) {
      void animar(atacante, [{ transform: 'none' }, { transform: `translateX(${dir * 18}%) rotate(${dir * 4}deg)` }, { transform: 'none' }], {
        duration: 380,
      });
      await fx.proyectil(atacante, defensor, `${atacaYo ? '' : 'enemigo'} ${j.critical ? 'critico' : ''}`);
      sonarSi(atacaYo ? (j.critical ? 'critico' : 'golpe') : 'dolor');
      void animar(
        defensor,
        [{ transform: 'none' }, { transform: `translateX(${dir * 10}px) rotate(${dir * 4}deg)`, filter: 'brightness(1.8)' }, { transform: 'none' }],
        { duration: 380 },
      );
      if (!atacaYo) {
        const esc = escenarioRef.current;
        esc?.classList.remove('dolor');
        void esc?.offsetWidth;
        esc?.classList.add('dolor');
      }
      fx.particulas(defensor, color(atacaYo ? (j.critical ? '--tiza-naranja' : '--tiza-amarilla') : '--tiza-roja', raiz), j.critical ? 14 : 8);
      fx.flotante(defensor, `${j.critical ? 'Critical! ' : ''}−${j.damage}`, j.critical ? 'critico' : '');
      await esperar(380);
    }
  }

  async function responder(op: string) {
    if (!pregunta || respondida || enviando.current || terminado) return;
    const acierto = op === pregunta.respuesta;
    const { item } = pregunta.palabra;
    setMensaje(
      acierto
        ? { texto: `${ELOGIOS[Math.floor(Math.random() * ELOGIOS.length)]} ${item.term} = ${item.es}`, clase: 'bien' }
        : { texto: `Almost. It was “${pregunta.respuesta}”. ${item.term} = ${item.es}`, clase: 'mal' },
    );
    await enviar(op, acierto, pregunta.palabra, pregunta.audio);
  }

  async function responderArcade(acierto: boolean, dado: string) {
    if (!preguntaArc || respondida || enviando.current || terminado) return;
    setMensaje({ texto: `${acierto ? ELOGIOS[Math.floor(Math.random() * ELOGIOS.length)] + ' ' : ''}${preguntaArc.reveal}`, clase: acierto ? 'bien' : 'mal' });
    await enviar(dado, acierto, preguntaArc.word, preguntaArc.say, preguntaArc.kind === 'choice' ? 1100 : 2000);
  }

  async function enviar(op: string, acierto: boolean, palabra: PalabraJuego | undefined, decir: string | undefined, pausaFallo = 1100) {
    enviando.current = true;
    const indice = yoP.q;
    setRespondida({ elegida: op, acierto, indice });
    sonarSi(acierto ? 'acierto' : 'error');
    if (palabra) {
      if (!acierto) setFallos((f) => (f.some((p) => p.item.term === palabra.item.term) ? f : [...f, palabra]));
      reviewWord(`${duelo.level}/${palabra.topicId}/${palabra.item.term}`, acierto);
    }
    if (sonidoRef.current.voz && decir) setTimeout(() => void speak(decir), 250);
    try {
      const j = await jugar(client, duelo.id, indice, acierto);
      encolar(j);
      await cola.current;
      await refrescar();
    } catch (e) {
      if (e instanceof DueloError && e.code === 'too_fast') await esperar(700);
      else setError(e instanceof DueloError ? e.message : 'Connection lost. Retrying…');
      await refrescar();
    }
    await esperar(acierto ? 300 : pausaFallo);
    setRespondida(null);
    setMensaje(null);
    setError('');
    enviando.current = false;
  }

  // Teclas 1 a 4.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (capa || terminado || juegoArc) return;
      const i = parseInt(e.key, 10);
      if (i >= 1 && i <= 4) raizRef.current?.querySelectorAll<HTMLButtonElement>('.opciones .opcion')[i - 1]?.click();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [capa, terminado, juegoArc]);

  useEffect(() => {
    if (anuncio?.n === 0) setTimeout(() => setAnuncio({ texto: `${rival.nombre} accepts the challenge!`, n: 1 }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inactivo = !terminado && rival.last !== null && ahora - Date.parse(rival.last) > ABANDONO_MS;
  const gane = duelo.winner === yo;
  const razon =
    duelo.finish_reason === 'forfeit'
      ? gane
        ? `${rival.nombre} gave up.`
        : 'You gave up.'
      : duelo.finish_reason === 'abandon'
        ? gane
          ? `${rival.nombre} stopped answering.`
          : 'You went too long without answering.'
        : gane
          ? `You knocked out ${rival.nombre}. Your vocabulary rules!`
          : `${rival.nombre} won this time. Review and ask for a rematch.`;
  const llenas = Math.min(yoP.racha, RACHA_CRITICO);

  return (
    <div className="vbg" ref={raizRef}>
      <FiltroTiza />
      <header className="cabecera">
        <h1 className="titulo">
          {juegoArc ? `${juegoArc.emoji} ${juegoArc.name}` : 'Duel'} {duelo.level.toUpperCase()}
        </h1>
        <p className="nota">
          You: {yoP.ok} correct · {rival.nombre}: {rival.ok} correct (question {rival.q + 1})
        </p>
      </header>
      <main className="pantalla">
        <section className="escenario" ref={escenarioRef} aria-label="Battle">
          <div className="luchador jugador">
            <div className="sprite" ref={spriteYoRef}>
              <PersonajeDibujo id={yoP.char} />
            </div>
            <div className="placa">
              <p className="nombre">
                <span>{yoP.nombre} (you)</span> <span className="nivel">{PERSONAJES[yoP.char].nombre}</span>
              </p>
              <Barra clase={`barra-vida ${yoP.hp / yoP.max <= 0.3 ? 'baja' : yoP.hp / yoP.max <= 0.6 ? 'media' : ''}`} etiqueta="Your HP" actual={yoP.hp} maximo={yoP.max} />
              <p className="cifras">
                HP {yoP.hp} / {yoP.max}
              </p>
            </div>
          </div>
          <div className="luchador boss rival">
            <div className="sprite" ref={spriteRivalRef}>
              <PersonajeDibujo id={rival.char} />
            </div>
            <div className="placa">
              <p className="nombre">
                <span>{rival.nombre}</span> <span className="nivel">{PERSONAJES[rival.char].nombre}</span>
              </p>
              <Barra clase="barra-vida" etiqueta={`${rival.nombre}’s HP`} actual={rival.hp} maximo={rival.max} />
              <p className="cifras">
                HP {rival.hp} / {rival.max}
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
            <p className="tipo-pregunta">
              {pregunta
                ? `${NOMBRE_TIPO[pregunta.tipo]} · question ${indiceVisible + 1}`
                : preguntaArc
                  ? `${juegoArc!.emoji} ${juegoArc!.name} · ${preguntaArc.prompt.ask} · #${indiceVisible + 1}`
                  : ''}
            </p>
            <div className={`racha ${yoP.racha >= RACHA_CRITICO - 1 ? 'lista' : ''}`} aria-live="polite">
              <span>{yoP.racha >= RACHA_CRITICO - 1 ? 'Next hit: critical!' : 'Streak'}</span>
              {Array.from({ length: RACHA_CRITICO }, (_, i) => (
                <Estrella key={i} className={i < llenas ? 'llena' : ''} />
              ))}
            </div>
          </div>
          {!pregunta && !preguntaArc && !error && <p className="nota">Loading questions…</p>}
          {preguntaArc && !terminado && (
            <QuestionView key={`arc-${indiceVisible}`} q={preguntaArc} disabled={!!respondida || !!capa} onAnswer={(ok, dado) => void responderArcade(ok, dado)} />
          )}
          {pregunta && !terminado && (
            <>
              <Enunciado key={`${respondida?.indice ?? yoP.q}`} pregunta={pregunta} revelada={!!respondida} />
              <div className="opciones texto">
                {pregunta.opciones.map((op, i) => {
                  const clase = respondida ? (op === pregunta.respuesta ? 'correcta' : op === respondida.elegida ? 'incorrecta' : '') : '';
                  return (
                    <button
                      key={`${yoP.q}-${op}`}
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
            </>
          )}
          <p className={`respuesta-mensaje ${mensaje?.clase ?? ''}`} role="status">
            {error || mensaje?.texto}
          </p>
        </section>

        <div className="pie-batalla">
          {inactivo ? (
            <button
              type="button"
              className="boton"
              onClick={() =>
                void reclamarAbandono(client, duelo.id)
                  .then(setDuelo)
                  .catch((e) => setError(e instanceof DueloError ? e.message : 'Could not claim the win.'))
              }
            >
              {rival.nombre} is not answering: claim the win
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="boton boton-secundario" disabled={terminado} onClick={() => setCapa('rendirse')}>
            Give up
          </button>
        </div>
      </main>

      {capa === 'rendirse' && (
        <div className="capa">
          <div className="ventana" role="dialog" aria-modal="true" aria-labelledby="duelo-rendirse">
            <h2 id="duelo-rendirse" className="subtitulo">
              Give up?
            </h2>
            <p>{rival.nombre} will win the duel.</p>
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setCapa(null)}>
                Keep playing
              </button>
              <button
                type="button"
                className="boton"
                onClick={() => {
                  setCapa(null);
                  void rendirse(client, duelo.id)
                    .then(setDuelo)
                    .catch(() => void refrescar());
                }}
              >
                Give up
              </button>
            </div>
          </div>
        </div>
      )}

      {terminado && (
        <div className="capa">
          <div className="ventana ventana-fin" role="dialog" aria-modal="true" aria-labelledby="duelo-fin">
            <div className={`sprite-fin ${gane ? '' : 'triste'}`}>
              <PersonajeDibujo id={yoP.char} />
            </div>
            <h2 id="duelo-fin" className="subtitulo">
              {gane ? 'You won the duel!' : 'Nice try!'}
            </h2>
            <p>{razon}</p>
            <dl className="resumen">
              <div>
                <dt>Your correct answers</dt>
                <dd>
                  {yoP.ok}/{yoP.q}
                </dd>
              </div>
              <div>
                <dt>{rival.nombre}</dt>
                <dd>
                  {rival.ok}/{rival.q}
                </dd>
              </div>
              <div>
                <dt>Your HP</dt>
                <dd>{yoP.hp}</dd>
              </div>
            </dl>
            {fallos.length > 0 && (
              <>
                <p className="etiqueta">Words to review</p>
                <ul className="repaso">
                  {fallos.map((w) => (
                    <li key={w.item.term}>
                      <button type="button" className="boton-sonido" onClick={() => void speak(w.item.term)} aria-label={`Listen to ${w.item.term}`}>
                        🔊
                      </button>
                      <span aria-hidden="true">{w.item.emoji}</span>
                      <b>{w.item.term}</b>
                      <Es text={w.item.es} level={duelo.level} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="acciones">
              <button type="button" className="boton" onClick={alSalir}>
                Back to the lobby
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas className="confeti" ref={confetiRef} aria-hidden="true" />
    </div>
  );
}
