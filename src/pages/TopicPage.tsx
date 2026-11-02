import { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { Es } from '../components/Es';
import { Loading } from '../components/Loading';
import { isLevelId, loadTopic } from '../content';
import type { Level, Topic } from '../content/types';
import { useProgress } from '../core/progress/ProgressContext';
import { findModule, MODULES } from '../modules/registry';
import NotFoundPage from './NotFoundPage';

export default function TopicPage() {
  const { levelId, topicId, sectionId } = useParams();
  const { data, markSection } = useProgress();
  const [state, setState] = useState<{ level: Level; topic: Topic } | null | undefined>(undefined);

  useEffect(() => {
    setState(undefined);
    if (isLevelId(levelId) && topicId) void loadTopic(levelId, topicId).then(setState);
  }, [levelId, topicId]);

  const topicKey = `${levelId}/${topicId}`;
  const mod = findModule(sectionId);
  const onComplete = useCallback(
    (score?: number) => {
      if (mod) markSection(topicKey, mod.id, score);
    },
    [markSection, topicKey, mod],
  );

  if (!isLevelId(levelId) || state === null) return <NotFoundPage />;
  if (!state) return <Loading />;
  const { level, topic } = state;
  const available = MODULES.filter((m) => !m.isAvailable || m.isAvailable(topic));
  if (!sectionId) return <Navigate to={`/nivel/${level.id}/${topic.id}/${available[0]!.id}`} replace />;
  if (!mod) return <NotFoundPage />;
  const Section = mod.component;
  const progress = data.topics[topicKey] ?? {};
  const idx = available.findIndex((m) => m.id === mod.id);
  const next = available[idx + 1];

  return (
    <div>
      <nav className="breadcrumb">
        <Link to="/">Home</Link> › <Link to={`/nivel/${level.id}`}>Level {level.name}</Link> › {topic.title}
      </nav>
      <header className="topic-header">
        <span className="topic-card__emoji" aria-hidden="true">
          {topic.emoji}
        </span>
        <div>
          <h1>{topic.title}</h1>
          <p className="muted">
            <Es text={topic.titleEs} level={level.id} /> · {topic.grammarFocus}
          </p>
        </div>
      </header>
      <nav className="section-nav" aria-label="Topic sections">
        {available.map((m) => (
          <NavLink key={m.id} to={`/nivel/${level.id}/${topic.id}/${m.id}`} className="section-nav__item" title={m.description}>
            <span aria-hidden="true">{m.emoji}</span> {m.label}
            {progress[m.id]?.completed && <span className="check" aria-label="completed">✓</span>}
          </NavLink>
        ))}
      </nav>
      <div className="topic-progress" aria-label={`${available.filter((m) => progress[m.id]?.completed).length} of ${available.length} sections completed`}>
        <span style={{ width: `${(available.filter((m) => progress[m.id]?.completed).length / available.length) * 100}%`, background: level.color }} />
      </div>
      <p className="section-desc muted">{mod.description}</p>
      <Suspense fallback={<Loading />}>
        <Section key={`${topicKey}/${mod.id}`} level={level} topic={topic} topicKey={topicKey} onComplete={onComplete} />
      </Suspense>
      {next && (
        <div className="next-section">
          <Link className="btn" to={`/nivel/${level.id}/${topic.id}/${next.id}`}>
            Next: {next.emoji} {next.label} ➜
          </Link>
        </div>
      )}
    </div>
  );
}
