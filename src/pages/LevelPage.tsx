import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Es } from '../components/Es';
import { Loading } from '../components/Loading';
import { isLevelId, loadLevel } from '../content';
import type { Level } from '../content/types';
import { useProgress } from '../core/progress/ProgressContext';
import { MODULES } from '../modules/registry';
import NotFoundPage from './NotFoundPage';

export default function LevelPage() {
  const { levelId } = useParams();
  const { data } = useProgress();
  const [level, setLevel] = useState<Level | null>(null);

  useEffect(() => {
    if (isLevelId(levelId)) void loadLevel(levelId).then(setLevel);
  }, [levelId]);

  if (!isLevelId(levelId)) return <NotFoundPage />;
  if (!level || level.id !== levelId) return <Loading />;

  return (
    <div>
      <nav className="breadcrumb">
        <Link to="/">Home</Link> › Level {level.name}
      </nav>
      <section className="hero hero--level" style={{ ['--level' as string]: level.color }}>
        <span className="level-card__badge">{level.name}</span>
        <h1>{level.label}</h1>
        <p>{level.description}</p>
        <h3>By the end of this level you can…</h3>
        <ul className="can-do">
          {level.canDo.map((c) => (
            <li key={c}>✅ {c}</li>
          ))}
        </ul>
      </section>
      <div className="topic-grid">
        {level.topics.map((t) => {
          const done = Object.values(data.topics[`${level.id}/${t.id}`] ?? {}).filter((s) => s.completed).length;
          return (
            <Link key={t.id} className={`topic-card${done >= MODULES.length ? ' is-done' : ''}`} to={`/nivel/${level.id}/${t.id}`}>
              <span className="topic-card__emoji" aria-hidden="true">
                {t.emoji}
              </span>
              <h2>{t.title}</h2>
              <Es text={t.titleEs} level={level.id} className="muted es" block />
              <p className="small">{t.grammarFocus}</p>
              <div className="progress-bar">
                <span style={{ width: `${(done / MODULES.length) * 100}%`, background: level.color }} />
              </div>
              <small className="muted">
                {done}/{MODULES.length} sections
              </small>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
