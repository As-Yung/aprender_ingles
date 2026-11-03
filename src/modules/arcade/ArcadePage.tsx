import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS } from '../../content';
import { FiltroTiza } from '../vocab-game/drawings';
import { BOSS_GAME, GAMES, type Skill } from './engine';
import { Leaderboard } from './Leaderboard';
import { readArcadePrefs, writeArcadePrefs } from './prefs';
import '../vocab-game/vocab-game.css';
import './arcade.css';

const SKILLS: (Skill | 'All')[] = ['All', 'Vocabulary', 'Listening', 'Spelling', 'Sentences', 'Reading', 'Speed'];

/** Game Arcade: every game, solo or as a duel, with leaderboards. */
export default function ArcadePage() {
  const [prefs, setPrefs] = useState(readArcadePrefs);
  const [skill, setSkill] = useState<Skill | 'All'>('All');
  const [query, setQuery] = useState('');
  const [boardGame, setBoardGame] = useState('boss');
  const list = useMemo(
    () =>
      GAMES.filter(
        (g) => (skill === 'All' || g.skill === skill) && `${g.name} ${g.blurb}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [skill, query],
  );

  return (
    <div className="vbg arc">
      <FiltroTiza />
      <header className="cabecera">
        <h1 className="titulo">Game Arcade</h1>
        <div className="botones-cabecera">
          <Link to="/duelo" className="boton arc-link">
            ⚔️ Duels
          </Link>
        </div>
      </header>
      <main className="pantalla">
        <p className="lema">
          31 games to practice English with the vocabulary, dialogues and readings of your level. Play solo to climb the leaderboard, or
          challenge someone online in Duels.
        </p>

        <section className="bloque" aria-labelledby="arc-hub-level">
          <h2 id="arc-hub-level" className="subtitulo">
            <span className="paso">1</span> Your level
          </h2>
          <div className="dificultades niveles" role="radiogroup" aria-labelledby="arc-hub-level">
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={prefs.level === l.id}
                className="dificultad"
                onClick={() => setPrefs(writeArcadePrefs({ level: l.id }))}
              >
                <b>{l.name}</b>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bloque" aria-labelledby="arc-hub-games">
          <h2 id="arc-hub-games" className="subtitulo">
            <span className="paso">2</span> Pick a game
          </h2>
          <div className="arc-filters">
            <div className="arc-tabs" role="tablist" aria-label="Skill">
              {SKILLS.map((s) => (
                <button key={s} type="button" role="tab" aria-selected={skill === s} className={skill === s ? 'on' : ''} onClick={() => setSkill(s)}>
                  {s}
                </button>
              ))}
            </div>
            <input className="arc-search" type="search" placeholder="Search games…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search games" />
          </div>
          <div className="arc-games">
            {(skill === 'All' || skill === 'Vocabulary') && !query && (
              <Link to="/juego" className="arc-game featured">
                <span className="arc-game__emoji" aria-hidden="true">
                  {BOSS_GAME.emoji}
                </span>
                <span className="arc-game__name">{BOSS_GAME.name}</span>
                <span className="arc-game__blurb">{BOSS_GAME.blurb}</span>
                <span className="arc-game__skill">Featured · Vocabulary · Solo &amp; Duel</span>
              </Link>
            )}
            {list.map((g) => (
              <Link key={g.id} to={`/arcade/${g.id}`} className="arc-game">
                <span className="arc-game__emoji" aria-hidden="true">
                  {g.emoji}
                </span>
                <span className="arc-game__name">{g.name}</span>
                <span className="arc-game__blurb">{g.blurb}</span>
                <span className="arc-game__skill">
                  {g.skill}
                  {g.timeLimit ? ` · ${g.timeLimit}s` : ''} · Solo &amp; Duel
                </span>
              </Link>
            ))}
            {list.length === 0 && <p className="nota">No games match your search.</p>}
          </div>
        </section>

        <section className="bloque" aria-labelledby="arc-hub-board">
          <h2 id="arc-hub-board" className="subtitulo">
            🏆 Leaderboards
          </h2>
          <select className="arc-select" value={boardGame} onChange={(e) => setBoardGame(e.target.value)} aria-label="Game">
            <option value="boss">
              {BOSS_GAME.emoji} {BOSS_GAME.name}
            </option>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.emoji} {g.name}
              </option>
            ))}
          </select>
          <Leaderboard game={boardGame} level={prefs.level} onLevel={(l) => setPrefs(writeArcadePrefs({ level: l }))} />
        </section>
      </main>
    </div>
  );
}
