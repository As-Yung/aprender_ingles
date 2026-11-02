import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="card center">
      <p className="big">🧭</p>
      <h2>Página no encontrada</h2>
      <Link className="btn" to="/">
        Volver al inicio
      </Link>
    </div>
  );
}
