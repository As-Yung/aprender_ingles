import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="card center">
      <p className="big">🧭</p>
      <h2>Page not found</h2>
      <Link className="btn" to="/">
        Back to home
      </Link>
    </div>
  );
}
