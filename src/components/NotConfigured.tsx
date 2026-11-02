export function NotConfigured() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>⚙️ Setup pending</h1>
        <p>
          This deployment isn't connected to its authentication server yet. The administrator needs to set
          the <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> variables in GitHub (Settings → Secrets and
          variables → Actions → Variables) and redeploy.
        </p>
        <p className="muted">See docs/CONFIGURACION.md in the repository.</p>
      </div>
    </main>
  );
}
