import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loading } from '../components/Loading';
import { useAuth } from '../core/auth/AuthContext';
import { AuthError, type MfaEnrollment } from '../core/auth/types';

export default function MfaPage() {
  const { service, session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [qr, setQr] = useState('');
  const needsEnroll = Boolean(session && session.aal === 'aal1' && !session.hasMfa);

  useEffect(() => {
    if (!service || !needsEnroll || enrollment) return;
    let cancelled = false;
    service
      .startMfaEnrollment()
      .then(async (en) => {
        if (cancelled) return;
        setEnrollment(en);
        const QRCode = (await import('qrcode')).default;
        setQr(await QRCode.toDataURL(en.uri, { margin: 1, width: 220 }));
      })
      .catch((e: unknown) => setError(e instanceof AuthError ? e.message : 'Could not start two-factor setup.'));
    return () => {
      cancelled = true;
    };
  }, [service, needsEnroll, enrollment]);

  if (loading) return <Loading />;
  if (!service || !session) return <Navigate to="/login" replace />;
  if (session.aal === 'aal2') return <Navigate to={session.user.mustChangePassword ? '/cambiar-contrasena' : '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (needsEnroll && enrollment) await service.confirmMfaEnrollment(enrollment.factorId, code);
      else await service.verifyMfa(code);
      await refresh();
      navigate('/');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Invalid code.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>🔐 Two-step verification</h1>
        {needsEnroll ? (
          <>
            <p>
              Set up two-factor authentication (required). Scan this QR code with an authenticator app and type the 6-digit code it
              shows.
            </p>
            {qr ? <img className="qr" src={qr} alt="QR code for your authenticator app" width={220} height={220} /> : <Loading text="Generating QR code…" />}
            {enrollment && (
              <details className="small">
                <summary>Can't scan it? Enter the key manually</summary>
                <code className="secret">{enrollment.secret}</code>
              </details>
            )}
          </>
        ) : (
          <p>Open your authenticator app and type the 6-digit code for “Aprender Ingles”.</p>
        )}
        <label className="field">
          <span>Code</span>
          <input
            className="input input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </label>
        {error && (
          <div className="feedback feedback--bad" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--block" type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button
          className="link-btn"
          type="button"
          onClick={() => {
            void service.signOut().then(() => navigate('/login'));
          }}
        >
          Cancel and go back to sign in
        </button>
      </form>
    </main>
  );
}
