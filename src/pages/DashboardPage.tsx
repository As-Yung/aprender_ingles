import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS, loadAllLevels } from '../content';
import type { Level } from '../content/types';
import { useAuth } from '../core/auth/AuthContext';
import { useProgress } from '../core/progress/ProgressContext';
import { isMastered } from '../core/progress/misses';
import { isDue } from '../core/srs/leitner';
import { MODULES } from '../modules/registry';
import '../styles/game-banner.css';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 19) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { session } = useAuth();
  const { data } = useProgress();
  const [levels, setLevels] = useState<Level[]>([]);
  useEffect(() => {
    void loadAllLevels().then(setLevels);
  }, []);

  const pct = (lv: Level) => {
    const total = lv.topics.length * MODULES.length;
    const done = lv.topics.reduce(
      (acc, t) => acc + Object.values(data.topics[`${lv.id}/${t.id}`] ?? {}).filter((s) => s.completed).length,
      0,
    );
    return total ? Math.round((done / total) * 100) : 0;
  };
  const dueWords = Object.values(data.srs).filter((c) => isDue(c)).length;
  const bugs = Object.values(data.misses).filter((r) => !isMastered(r)).length;

  // "Continue where you left off": the most recently touched topic.
  const resume = useMemo(() => {
    let best: { key: string; at: number } | null = null;
    for (const [key, sections] of Object.entries(data.topics)) {
      for (const s of Object.values(sections)) {
        if (!best || s.updatedAt > best.at) best = { key, at: s.updatedAt };
      }
    }
    if (!best) return null;
    const [levelId, topicId] = best.key.split('/');
    const level = levels.find((l) => l.id === levelId);
    const topic = level?.topics.find((t) => t.id === topicId);
    if (!level || !topic) return null;
    const done = Object.values(data.topics[best.key] ?? {}).filter((s) => s.completed).length;
    return { level, topic, done };
  }, [data.topics, levels]);

  return (
    <div className="dashboard">
      <section className="hero hero--dashboard">
        <div className="hero__text">
          <p className="eyebrow">Your English for tech</p>
          <h1>
            {greeting()}, {session?.user.username}! 👋
          </h1>
          <p className="hero__lead">
            Speak casual, natural English about systems, IoT, cybersecurity, AI, data and servers: stand-ups, explaining a bug, presenting data or
            chatting with teammates from anywhere.
          </p>
        </div>
        <div className="stats" role="list">
          <div className="stat" role="listitem">
            <strong>🔥 {data.streak.count}</strong>
            <span>day streak</span>
          </div>
          <div className="stat" role="listitem">
            <strong>🧠 {Object.keys(data.srs).length}</strong>
            <span>words studied</span>
          </div>
          <div className="stat" role="listitem">
            <strong>🔁 {dueWords}</strong>
            <span>due today</span>
          </div>
          <div className="stat" role="listitem">
            <strong>🐛 {bugs}</strong>
            <span>bugs to squash</span>
          </div>
        </div>
      </section>

      {resume && (
        <Link className="resume-card" to={`/nivel/${resume.level.id}/${resume.topic.id}`} style={{ ['--level' as string]: resume.level.color }}>
          <span className="resume-card__emoji" aria-hidden="true">
            {resume.topic.emoji}
          </span>
          <span className="resume-card__body">
            <small className="eyebrow">Continue where you left off · {resume.level.name}</small>
            <strong>{resume.topic.title}</strong>
            <span className="progress-bar">
              <span style={{ width: `${(resume.done / MODULES.length) * 100}%`, background: resume.level.color }} />
            </span>
          </span>
          <span className="resume-card__cta" aria-hidden="true">
            Resume ➜
          </span>
        </Link>
      )}

      <h2 className="section-title">🎮 Play &amp; practice</h2>
      <div className="quick-grid">
        <Link to="/arcade" className="game-banner game-banner--arcade">
          <span className="game-banner__emoji" aria-hidden="true">
            🕹️
          </span>
          <span>
            <strong>Game Arcade · 31 games</strong>
            <small>Spelling, listening, sentences, speed rounds and more. Climb the leaderboards solo or in duels.</small>
          </span>
        </Link>
        <Link to="/juego" className="game-banner">
          <span className="game-banner__emoji" aria-hidden="true">
            ⚔️
          </span>
          <span>
            <strong>Vocab Boss Game</strong>
            <small>Beat 10 bosses with the vocabulary of your level (A1–C2). Every right answer is an attack!</small>
          </span>
        </Link>
        <Link to="/duelo" className="game-banner game-banner--duel">
          <span className="game-banner__emoji" aria-hidden="true">
            🤺
          </span>
          <span>
            <strong>Online duels</strong>
            <small>Challenge another player in real time. Fastest correct answer wins the round.</small>
          </span>
        </Link>
        <Link to="/repaso" className="game-banner game-banner--bugs">
          <span className="game-banner__emoji" aria-hidden="true">
            🐛
          </span>
          <span>
            <strong>Bug Hunt{bugs > 0 ? ` · ${bugs} to review` : ''}</strong>
            <small>Review the words you missed. Get them right 3 times in a row to squash them 💥.</small>
          </span>
        </Link>
        <Link to="/voz" className="game-banner game-banner--voice">
          <span className="game-banner__emoji" aria-hidden="true">
            🔊
          </span>
          <span>
            <strong>Voice settings</strong>
            <small>Pick the most natural voice on your device, then listen and repeat out loud.</small>
          </span>
        </Link>
      </div>

      <h2 className="section-title">🗺️ Your learning path</h2>
      <div className="level-grid">
        {LEVELS.map((meta) => {
          const lv = levels.find((l) => l.id === meta.id);
          const p = lv ? pct(lv) : 0;
          return (
            <Link key={meta.id} to={`/nivel/${meta.id}`} className="level-card" style={{ ['--level' as string]: meta.color }}>
              <div className="level-card__top">
                <span className="level-card__badge">{meta.name}</span>
                <span className="level-card__pct">{p}%</span>
              </div>
              <h3>{meta.label}</h3>
              <p>{meta.description}</p>
              <div className="progress-bar" aria-label={`Progress ${p}%`}>
                <span style={{ width: `${p}%`, background: meta.color }} />
              </div>
              <small className="muted">{lv ? `${lv.topics.length} topics` : 'Loading…'}</small>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
