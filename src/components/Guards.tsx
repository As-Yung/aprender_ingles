import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/auth/AuthContext';
import { Loading } from './Loading';
import { NotConfigured } from './NotConfigured';

/**
 * Protege rutas: exige sesión + 2FA (AAL2) + contraseña no temporal.
 * Importante: esto es control de NAVEGACIÓN. La seguridad real de los datos la imponen
 * el servidor (RLS en Supabase y la Edge Function), que también exigen AAL2.
 */
export function RequireAuth({ children, allowPasswordChange }: { children: ReactNode; allowPasswordChange?: boolean }) {
  const { service, session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!service) return <NotConfigured />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.aal !== 'aal2') return <Navigate to="/mfa" replace />;
  if (session.user.mustChangePassword && !allowPasswordChange) return <Navigate to="/cambiar-contrasena" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (session?.user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
