import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAdmin, RequireAuth } from './components/Guards';
import { Loading } from './components/Loading';
import { AuthProvider } from './core/auth/AuthContext';
import { ProgressProvider } from './core/progress/ProgressContext';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const MfaPage = lazy(() => import('./pages/MfaPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LevelPage = lazy(() => import('./pages/LevelPage'));
const TopicPage = lazy(() => import('./pages/TopicPage'));
const VoicePage = lazy(() => import('./pages/VoicePage'));
const VocabGamePage = lazy(() => import('./modules/vocab-game/VocabGamePage'));
const DuelPage = lazy(() => import('./modules/vocab-duel/DuelPage'));
const ArcadePage = lazy(() => import('./modules/arcade/ArcadePage'));
const PlayPage = lazy(() => import('./modules/arcade/PlayPage'));
const ReviewPage = lazy(() => import('./modules/review/ReviewPage'));
const AiTutorPage = lazy(() => import('./modules/ai-tutor/AiTutorPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

/** HashRouter: compatible con GitHub Pages (hosting estático sin reescrituras de rutas). */
export function App() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <HashRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/mfa" element={<MfaPage />} />
              <Route
                path="/cambiar-contrasena"
                element={
                  <RequireAuth allowPasswordChange>
                    <ChangePasswordPage />
                  </RequireAuth>
                }
              />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="nivel/:levelId" element={<LevelPage />} />
                <Route path="nivel/:levelId/:topicId" element={<TopicPage />} />
                <Route path="nivel/:levelId/:topicId/:sectionId" element={<TopicPage />} />
                <Route path="voz" element={<VoicePage />} />
                <Route path="juego" element={<VocabGamePage />} />
                <Route path="duelo" element={<DuelPage />} />
                <Route path="arcade" element={<ArcadePage />} />
                <Route path="arcade/:gameId" element={<PlayPage />} />
                <Route path="repaso" element={<ReviewPage />} />
                <Route path="ia" element={<AiTutorPage />} />
                <Route
                  path="admin"
                  element={
                    <RequireAdmin>
                      <AdminPage />
                    </RequireAdmin>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </ProgressProvider>
    </AuthProvider>
  );
}
