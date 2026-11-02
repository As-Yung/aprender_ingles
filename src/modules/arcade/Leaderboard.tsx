import { useEffect, useState } from 'react';
import { LEVELS } from '../../content';
import type { LevelId } from '../../content/types';
import { ArcadeError, leaderboardPve, leaderboardPvp, useOnlineClient, type PveRow, type PvpRow } from './api';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Top players of one game: PvE (best score per level) and PvP (Elo rating). */
export function Leaderboard({
  game,
  level,
  onLevel,
  initialMode = 'pve',
  refreshKey = 0,
}: {
  game: string;
  level: LevelId;
  onLevel?: (l: LevelId) => void;
  initialMode?: 'pve' | 'pvp';
  refreshKey?: number;
}) {
  const client = useOnlineClient();
  const [mode, setMode] = useState<'pve' | 'pvp'>(initialMode);
  const [pve, setPve] = useState<PveRow[] | null>(null);
  const [pvp, setPvp] = useState<PvpRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client) return;
    let off = false;
    setError('');
    const load =
      mode === 'pve'
        ? leaderboardPve(client, game, level).then((r) => !off && setPve(r))
        : leaderboardPvp(client, game).then((r) => !off && setPvp(r));
    load.catch((e) => !off && setError(e instanceof ArcadeError ? e.message : 'Could not load the leaderboard.'));
    return () => {
      off = true;
    };
  }, [client, game, level, mode, refreshKey]);

  if (!client) return <p className="nota">Leaderboards are available on the online version of the app.</p>;

  const rows = mode === 'pve' ? pve : pvp;
  return (
    <div className="arc-board">
      <div className="arc-tabs" role="tablist" aria-label="Leaderboard mode">
        <button type="button" role="tab" aria-selected={mode === 'pve'} className={mode === 'pve' ? 'on' : ''} onClick={() => setMode('pve')}>
          🧍 Solo (PvE)
        </button>
        <button type="button" role="tab" aria-selected={mode === 'pvp'} className={mode === 'pvp' ? 'on' : ''} onClick={() => setMode('pvp')}>
          ⚔️ Duels (PvP)
        </button>
        {mode === 'pve' && onLevel && (
          <select className="arc-select" value={level} onChange={(e) => onLevel(e.target.value as LevelId)} aria-label="Level">
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="mensaje">{error}</p>}
      {!rows && !error && <p className="nota">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="nota">{mode === 'pve' ? `No scores yet in ${level.toUpperCase()}. Be the first!` : 'No duels played yet. Challenge someone!'}</p>
      )}
      {rows && rows.length > 0 && (
        <table className="arc-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              {mode === 'pve' ? (
                <>
                  <th scope="col">Score</th>
                  <th scope="col">Right</th>
                  <th scope="col">Best streak</th>
                </>
              ) : (
                <>
                  <th scope="col">Rating</th>
                  <th scope="col">W</th>
                  <th scope="col">L</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {mode === 'pve'
              ? (rows as PveRow[]).map((r) => (
                  <tr key={`${r.rank}-${r.username}`} className={r.is_me ? 'me' : ''}>
                    <td>{MEDALS[r.rank - 1] ?? r.rank}</td>
                    <td>{r.username}</td>
                    <td>{r.score.toLocaleString('en')}</td>
                    <td>
                      {r.correct}/{r.answered}
                    </td>
                    <td>{r.best_streak}</td>
                  </tr>
                ))
              : (rows as PvpRow[]).map((r) => (
                  <tr key={`${r.rank}-${r.username}`} className={r.is_me ? 'me' : ''}>
                    <td>{MEDALS[r.rank - 1] ?? r.rank}</td>
                    <td>{r.username}</td>
                    <td>{r.rating}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
