import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEVELS, loadAllLevels } from '../content';
import type { Level } from '../content/types';
import { useAuth } from '../core/auth/AuthContext';
import { useProgress } from '../core/progress/ProgressContext';
import { isDue } from '../core/srs/leitner';
import { MODULES } from '../modules/registry';

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

  return (
    <div>
      <section className="hero">
        <h1>¡Hola, {session?.user.username}! 👋</h1>
        <p>
          🎯 <strong>Tu objetivo:</strong> hablar inglés con fluidez y naturalidad, de forma casual, sobre ingeniería de sistemas e IoT:
          dailies con tu equipo, explicar un bug, hablar de sensores, la nube y despliegues, o charlar con colegas de cualquier país.
        </p>
        <p className="muted">
          Elige tu nivel. Cada tema tiene tarjetas visuales, apuntes, vocabulario, conversación, lectura asistida, dictado y
          autoevaluación. Los temas 🛠️ son de tecnología. Escucha con la <Link to="/voz">voz más natural de tu dispositivo</Link> y repite en voz alta.
        </p>
        <div className="stats">
          <div className="stat">
            <strong>🔥 {data.streak.count}</strong>
            <span>días seguidos</span>
          </div>
          <div className="stat">
            <strong>🧠 {Object.keys(data.srs).length}</strong>
            <span>palabras estudiadas</span>
          </div>
          <div className="stat">
            <strong>🔁 {dueWords}</strong>
            <span>para repasar hoy</span>
          </div>
        </div>
      </section>

      <div className="level-grid">
        {LEVELS.map((meta) => {
          const lv = levels.find((l) => l.id === meta.id);
          const p = lv ? pct(lv) : 0;
          return (
            <Link key={meta.id} to={`/nivel/${meta.id}`} className="level-card" style={{ borderColor: meta.color }}>
              <span className="level-card__badge" style={{ background: meta.color }}>
                {meta.name}
              </span>
              <h2>{meta.label}</h2>
              <p>{meta.description}</p>
              <div className="progress-bar" aria-label={`Progreso ${p}%`}>
                <span style={{ width: `${p}%`, background: meta.color }} />
              </div>
              <small className="muted">
                {lv ? `${lv.topics.length} temas · ${p}% completado` : 'Cargando…'}
              </small>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
