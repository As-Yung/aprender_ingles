import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LEVELS, loadAllLevels } from '../content';
import type { Level } from '../content/types';
import { useAuth } from '../core/auth/AuthContext';
import { useProgress } from '../core/progress/ProgressContext';
import { isMastered } from '../core/progress/misses';
import { isDue } from '../core/srs/leitner';
import { BOSS_GAME, GAMES } from '../modules/arcade/engine';
import { MODULES } from '../modules/registry';
import '../styles/game-banner.css';

type Tab = 'overview' | 'lessons' | 'games' | 'review';
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview', icon: '✨', label: 'Overview' },
  { id: 'lessons', icon: '📚', label: 'Lessons' },
  { id: 'games', icon: '🎮', label: 'Games' },
  { id: 'review', icon: '🔁', label: 'Review' },
];
const isTab = (t: string | null): t is Tab => TABS.some((x) => x.id === t);
/** A few games shown directly on Home; the full list lives in the Arcade. */
const FEATURED = ['meaning-match', 'spelling-bee', 'listen-pick', 'sentence-builder', 'hangman', 'speed-sprint'];

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

  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: Tab = isTab(tabParam) ? tabParam : 'overview';
  const selectTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    selectTab(TABS[n]!.id);
    document.getElementById(`hometab-${TABS[n]!.id}`)?.focus();
  };

  const featured = useMemo(() => {
    const picked = FEATURED.map((id) => GAMES.find((g) => g.id === id)).filter((g): g is (typeof GAMES)[number] => !!g);
    return picked.length >= 4 ? picked : GAMES.slice(0, 6);
  }, []);
  const totalGames = GAMES.length + 1;
  const overall = levels.length ? Math.round(levels.reduce((a, l) => a + pct(l), 0) / levels.length) : 0;
  // Suggested next level: the first one that isn't finished yet.
  const nextLevel = LEVELS.find((m) => {
    const lv = levels.find((l) => l.id === m.id);
    return !lv || pct(lv) < 100;
  });

  const levelGrid = (
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
  );

  const resumeCard = resume && (
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
  );

  return (
    <div className="dashboard">
      <section className="hero hero--dashboard hero--compact">
        <div className="hero__text">
          <p className="eyebrow">Your English for tech</p>
          <h1>
            {greeting()}, {session?.user.username}! 👋
          </h1>
        </div>
        <div className="stats">
          <div className="stat">
            <strong>🔥 {data.streak.count}</strong>
            <span>day streak</span>
          </div>
          <div className="stat">
            <strong>🧠 {Object.keys(data.srs).length}</strong>
            <span>words studied</span>
          </div>
          <button type="button" className="stat stat--link" onClick={() => selectTab('review')}>
            <strong>🔁 {dueWords}</strong>
            <span>due today</span>
          </button>
          <button type="button" className="stat stat--link" onClick={() => selectTab('review')}>
            <strong>🐛 {bugs}</strong>
            <span>bugs to squash</span>
          </button>
        </div>
      </section>

      <div className="subtabs" role="tablist" aria-label="Home sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`hometab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`homepanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`subtab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
            {t.id === 'review' && bugs + dueWords > 0 && <span className="nav-badge">{bugs + dueWords}</span>}
          </button>
        ))}
      </div>

      <div className="subtab-panel" role="tabpanel" id={`homepanel-${tab}`} aria-labelledby={`hometab-${tab}`} key={tab}>
        {tab === 'overview' && (
          <>
            {resumeCard}
            <h2 className="section-title">🚀 Quick start</h2>
            <div className="quick-grid">
              {nextLevel && (
                <Link to={`/nivel/${nextLevel.id}`} className="action-card" style={{ ['--level' as string]: nextLevel.color }}>
                  <span className="action-card__icon" aria-hidden="true">
                    📚
                  </span>
                  <span>
                    <strong>{resume ? 'Next lesson' : 'Start learning'}</strong>
                    <small>
                      Level {nextLevel.name} · {nextLevel.label}. Notes, vocabulary, hands-on lab, dialogues and more.
                    </small>
                  </span>
                </Link>
              )}
              <button type="button" className="action-card" onClick={() => selectTab('games')}>
                <span className="action-card__icon" aria-hidden="true">
                  🎮
                </span>
                <span>
                  <strong>Play a game</strong>
                  <small>{totalGames} games with leaderboards, solo or in duels.</small>
                </span>
              </button>
              <button type="button" className="action-card" onClick={() => selectTab('review')}>
                <span className="action-card__icon" aria-hidden="true">
                  🔁
                </span>
                <span>
                  <strong>Review</strong>
                  <small>{bugs + dueWords > 0 ? `${bugs} bugs and ${dueWords} words waiting for you.` : 'Nothing pending. Nice work!'}</small>
                </span>
              </button>
            </div>
            <h2 className="section-title">🗺️ Your progress</h2>
            <div className="overall card">
              <div className="overall__head">
                <strong>Overall course progress</strong>
                <span className="level-card__pct">{overall}%</span>
              </div>
              <div className="progress-bar progress-bar--lg">
                <span style={{ width: `${overall}%` }} />
              </div>
              <div className="level-dots">
                {LEVELS.map((m) => {
                  const lv = levels.find((l) => l.id === m.id);
                  const p = lv ? pct(lv) : 0;
                  return (
                    <Link key={m.id} to={`/nivel/${m.id}`} className="level-dot" style={{ ['--level' as string]: m.color, ['--p' as string]: `${p}%` }}>
                      <span className="level-dot__ring">{m.name}</span>
                      <small>{p}%</small>
                    </Link>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {tab === 'lessons' && (
          <>
            {resumeCard}
            <p className="muted panel-intro">
              Pick a level. Every topic has visual cards, notes, vocabulary, a hands-on lab, practice games, a dialogue, guided reading, dictation
              and a self-check.
            </p>
            {levelGrid}
          </>
        )}

        {tab === 'games' && (
          <>
            <div className="quick-grid">
              <Link to="/arcade" className="game-banner game-banner--arcade">
                <span className="game-banner__emoji" aria-hidden="true">
                  🕹️
                </span>
                <span>
                  <strong>Game Arcade · {totalGames} games</strong>
                  <small>Spelling, listening, sentences, speed rounds and more. Climb the leaderboards solo or in duels.</small>
                </span>
              </Link>
              <Link to="/juego" className="game-banner">
                <span className="game-banner__emoji" aria-hidden="true">
                  ⚔️
                </span>
                <span>
                  <strong>{BOSS_GAME.name}</strong>
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
            </div>
            <h2 className="section-title">⭐ Quick play</h2>
            <div className="mini-games">
              {featured.map((g) => (
                <Link key={g.id} to={`/arcade/${g.id}`} className="mini-game">
                  <span className="mini-game__emoji" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <strong>{g.name}</strong>
                  <small className="muted">{g.blurb}</small>
                  <span className="chip-tag">{g.skill}</span>
                </Link>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link className="btn btn--ghost" to="/arcade">
                See all {totalGames} games ➜
              </Link>
            </div>
          </>
        )}

        {tab === 'review' && (
          <div className="quick-grid">
            <Link to="/repaso" className="game-banner game-banner--bugs">
              <span className="game-banner__emoji" aria-hidden="true">
                🐛
              </span>
              <span>
                <strong>Bug Hunt{bugs > 0 ? ` · ${bugs} to review` : ''}</strong>
                <small>Review the words you missed. Get them right 3 times in a row to squash them 💥.</small>
              </span>
            </Link>
            {resume ? (
              <Link to={`/nivel/${resume.level.id}/${resume.topic.id}/vocabulario`} className="action-card">
                <span className="action-card__icon" aria-hidden="true">
                  🧠
                </span>
                <span>
                  <strong>Spaced repetition · {dueWords} due</strong>
                  <small>Flashcards for “{resume.topic.title}”. Open Vocabulary › Review (SRS) in any topic.</small>
                </span>
              </Link>
            ) : (
              <button type="button" className="action-card" onClick={() => selectTab('lessons')}>
                <span className="action-card__icon" aria-hidden="true">
                  🧠
                </span>
                <span>
                  <strong>Spaced repetition</strong>
                  <small>Start a topic to get flashcards that come back right when you are about to forget them.</small>
                </span>
              </button>
            )}
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
        )}
      </div>
    </div>
  );
}
