export function NotConfigured() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>⚙️ Configuración pendiente</h1>
        <p>
          Esta publicación todavía no está conectada a su servidor de autenticación. El administrador debe configurar
          las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en GitHub (Settings → Secrets and
          variables → Actions → Variables) y volver a desplegar.
        </p>
        <p className="muted">Consulta docs/CONFIGURACION.md en el repositorio.</p>
      </div>
    </main>
  );
}
